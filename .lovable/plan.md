# ROAS Attribution Engine Stability Fix

## Goal

Make ROAS attribution **deterministic**: same input + same media buyer order + same column mapping = same output, every time, in both Manual Upload and Automatic Fetching.

## Root cause

Today, two separate matching code paths exist (`RoasCalculator.tsx` for Manual, `autoAttribute.ts` for Auto). Both build short-circuit indexes (`emailIndex[email] = lead`, last-write-wins) and iterate sales in arrival order, so the "winner" depends on insertion/fetch ordering. Fuzzy name matches can silently beat exact matches because matching is sale-by-sale instead of round-by-round.

## What I'll build

### 1. Single shared deterministic engine — `src/lib/roas/attributionEngine.ts`

```text
calculateAttribution(snapshot) -> result
  ├─ normalizeLeads / normalizeSales (pure, never mutates input)
  ├─ build sorted indexes (emailIndex, phoneIndex, nameIndex)
  │     each value = array of leads, sorted by:
  │       1. mediaBuyerOrder priority
  │       2. rowIndex
  │       3. mediaBuyerName tiebreak
  ├─ Round 1: email exact match for every sale
  ├─ Round 2: phone exact match for sales still unmatched
  ├─ Round 3: name fuzzy (>=0.85) for sales still unmatched
  ├─ Round 4: mark unmatched
  ├─ build duplicateLeadConflicts
  ├─ build auditLog (one row per sale)
  └─ compute summary, mediaBuyerBreakdown, hashes
```

Pure functions, no React state. Exports types matching the spec (snapshot in, result out, with `auditLog`, `duplicateLeadConflicts`, `inputSnapshotHash`, `outputHash`).

### 2. Wire both flows into the new engine

- `RoasCalculator.tsx` (Manual): when user clicks Calculate, build a snapshot from current parsed CSVs + media buyer order + column mappings + ad spends, call `calculateAttribution`, then map result back into the existing `AttributionPayload` shape so `AttributionResultsView` renders unchanged.
- `AutoWizardV6.tsx` (Automatic): replace `runAutoAttribution`'s matching block. Fetching tabs stays the same; the matching/normalization step is delegated to `calculateAttribution`. `runAutoAttribution` becomes a thin orchestrator: fetch CSV rows → build snapshot → call engine.

### 3. Immutable calculation snapshot

On every Calculate / Recalculate:
- Generate fresh `calculationId` (uuid)
- Deep-copy parsed lead rows, sales rows, media buyer order, column mappings, ad spends
- Compute `leadRowsHash`, `salesRowsHash`, `mediaBuyerOrderHash`, `columnMappingHash` (FNV-1a)
- Pass snapshot to engine; never read from React state inside engine
- Store snapshot + result on the page (not just summary numbers)

### 4. Stable media buyer priority order

- Store `mediaBuyerOrder: string[]` derived from UI insertion order (Manual) or tab-role assignment order (Auto)
- Render a small "Media Buyer Priority Order" panel above Calculate showing each buyer + lead count + source + priority #
- Engine uses this order as the only tiebreaker; never sorts alphabetically and never relies on object key order

### 5. Strict matching rounds + name threshold

- Email round → Phone round → Name (>=0.85 word-token similarity) → Unmatched
- Weak phones (<10 digits) flagged; never override stronger email matches
- Name match only fires if no prior round matched that sale; competing matches recorded in audit

### 6. Duplicate lead conflict detection

While building indexes, detect when the same normalized email/phone/name appears in 2+ media buyer tabs. Output `duplicateLeadConflicts[]` with conflictType, normalizedValue, mediaBuyersFound, leadRows, winnerIfMatched, tieBreakerReason.

### 7. New collapsible UI sections in `AttributionResultsView`

Below the existing "Matching method" note, add three collapsed-by-default sections:
- **Data Used For This Calculation** — calc id, hashes, sales/lead counts, mediaBuyerOrder, columnMappingsUsed, calculatedAt
- **Duplicate Lead Conflicts** — count + per-conflict details
- **Attribution Audit** — sale-by-sale table with all columns from spec, plus search and filters (buyer / media buyer / method / conflicts only / unmatched only)

Existing summary cards, breakdown table, charts, exports stay untouched.

### 8. Stale draft / Start Fresh hygiene

- "Start Fresh" already clears local + remote draft. Also clear any in-memory snapshot, audit, conflicts, savedSessionId.
- New upload replaces (not appends) parsed rows for that source.
- Show source filename next to each media buyer / sales source.
- Internal `console.debug` log of snapshot summary on every calculate.

### 9. Result consistency check (admin/debug)

After calculate, store last `inputSnapshotHash` + `outputHash`. On Recalculate with identical hashes, show subtle "Result confirmed identical" indicator. If input hash matches but output hash differs, render red error banner: "Attribution engine is unstable."

### 10. Persist full audit on Save to History

Database changes (single migration):

```sql
-- Extend attribution_sessions
ALTER TABLE attribution_sessions
  ADD COLUMN IF NOT EXISTS calculation_id text,
  ADD COLUMN IF NOT EXISTS input_snapshot_hash text,
  ADD COLUMN IF NOT EXISTS output_hash text,
  ADD COLUMN IF NOT EXISTS media_buyer_order jsonb,
  ADD COLUMN IF NOT EXISTS column_mappings_used jsonb,
  ADD COLUMN IF NOT EXISTS duplicate_conflicts_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attribution_engine_version text DEFAULT 'deterministic_v1';

-- Extend attribution_sales_detail
ALTER TABLE attribution_sales_detail
  ADD COLUMN IF NOT EXISTS sale_id text,
  ADD COLUMN IF NOT EXISTS matched_lead_id text,
  ADD COLUMN IF NOT EXISTS matched_lead_name text,
  ADD COLUMN IF NOT EXISTS matched_lead_email text,
  ADD COLUMN IF NOT EXISTS matched_lead_phone text,
  ADD COLUMN IF NOT EXISTS source_media_buyer text,
  ADD COLUMN IF NOT EXISTS source_row_index integer,
  ADD COLUMN IF NOT EXISTS confidence_score numeric,
  ADD COLUMN IF NOT EXISTS competing_matches jsonb,
  ADD COLUMN IF NOT EXISTS match_reason text,
  ADD COLUMN IF NOT EXISTS needs_review boolean DEFAULT false;

-- New audit log table
CREATE TABLE roas_attribution_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attribution_session_id uuid REFERENCES attribution_sessions(id) ON DELETE CASCADE,
  calculation_id text NOT NULL,
  input_snapshot_hash text,
  output_hash text,
  media_buyer_order jsonb,
  column_mappings_used jsonb,
  audit_rows jsonb NOT NULL DEFAULT '[]',
  duplicate_conflicts jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE roas_attribution_audit_logs ENABLE ROW LEVEL SECURITY;
-- policies: admin all; member insert if owns session; member read if active
```

No existing columns removed. Save flow writes one audit_logs row alongside the existing session/media buyers/sales detail inserts.

## Files

**New**
- `src/lib/roas/attributionEngine.ts` — engine + types + hashing
- `src/lib/roas/normalize.ts` — email/phone/name/revenue normalization helpers
- `src/components/roas/AttributionAuditPanel.tsx` — three collapsible sections

**Modified**
- `src/lib/roas/autoAttribute.ts` — delegate matching to engine
- `src/components/roas/auto/AutoWizardV6.tsx` — pass mediaBuyerOrder, save audit_log row
- `src/pages/RoasCalculator.tsx` — build snapshot for Manual flow, save audit_log row, show priority order panel
- `src/components/roas/AttributionResultsView.tsx` — render new audit panel below existing UI; pass through extra audit data; keep current cards/charts/exports unchanged

## Out of scope (will not touch)

Manual Upload & Automatic Fetching presence, ROAS formula, deal value, currency formatting, IPC design system, Reports & History page, attribution UI labels, business rules other than the deterministic-tie-break and round-strictness rules above.

## Acceptance check

After build, I'll verify by:
1. Reading the engine to confirm pure / no React state / sorted indexes / strict rounds.
2. Running typecheck via the harness build.
3. Confirming the existing `AttributionResultsView` summary cards, per-buyer breakdown, and charts still render with the new payload shape.
