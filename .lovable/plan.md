
# Universal Lead Search

Build a cross-pipeline lead finder triggered from the Calling CRM search box. When the user types a name, email, or phone, a "Found across Control Center" panel appears below the input showing matches from every accessible pipeline, with quick actions to open a drawer, jump to a Kanban card in another pipeline, or open Paid Pipeline / Operations CRM directly. No data is mutated by search.

## Scope (do not touch)
Invoice system, Code of Conduct, Lead Qualifier, Daily Reports, payment calculations, batch repair internals, import logic, conversion logic (only reads links), paid pipeline finance values.

---

## Architecture

### 1. New shared module: `src/lib/universalSearch.ts`
Single entry point used by the CRM search box (and reusable elsewhere later).

```text
runUniversalSearch({ query, includeArchived, includeHidden, scope, role })
  → { groups: GroupResult[], debug: SearchDebug }
```

Search inputs are normalized once via existing `src/lib/identity.ts`
(`normalizeEmail`, `normalizePhone`, `normalizeName`) so search priority becomes:
1. Exact email
2. Exact normalized phone (last 10 digits)
3. Partial phone (≥5 digits)
4. Partial name ILIKE (≥3 chars)

Returns up to 20 results per source (CRM, Paid Onboarding CRM, Paid Pipeline, Operations CRM). Debug payload records: normalized email/phone, tables queried, counts per source, filters applied, role.

Tables queried in parallel via `Promise.all`:
- `leads` (Sales / Paid Onboarding — distinguished by `lead_type`)
- `paid_pipeline_leads`
- `operations_leads`

We rely on existing RLS — the same client is used everywhere so a sales user only sees what they can see today.

### 2. Lightweight DB indexes (additive, non-breaking)
A single migration adds expression indexes so search is instant. No table or column changes, no policy changes.

```text
CREATE INDEX IF NOT EXISTS idx_leads_email_lower         ON public.leads (lower(email));
CREATE INDEX IF NOT EXISTS idx_leads_phone_last10        ON public.leads (right(regexp_replace(coalesce(phone,''), '\D', '', 'g'), 10));
CREATE INDEX IF NOT EXISTS idx_leads_full_name_trgm      ON public.leads USING gin (full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_paid_leads_email_lower    ON public.paid_pipeline_leads (lower(email));
CREATE INDEX IF NOT EXISTS idx_paid_leads_phone_last10   ON public.paid_pipeline_leads (right(regexp_replace(coalesce(phone,''), '\D', '', 'g'), 10));
CREATE INDEX IF NOT EXISTS idx_paid_leads_name_trgm      ON public.paid_pipeline_leads USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_ops_leads_email_lower     ON public.operations_leads (lower(email));
CREATE INDEX IF NOT EXISTS idx_ops_leads_phone_last10    ON public.operations_leads (right(regexp_replace(coalesce(phone,''), '\D', '', 'g'), 10));
CREATE INDEX IF NOT EXISTS idx_ops_leads_name_trgm       ON public.operations_leads USING gin (name gin_trgm_ops);
```

`pg_trgm` is already installed (other functions in the project use it).

### 3. New component: `src/components/crm/UniversalSearchPanel.tsx`
Rendered below the existing Calling CRM search input. Receives the search input value, debounces 300 ms, calls `runUniversalSearch`, and renders grouped result cards:

```text
Found across Control Center
─────────────────────────────────────
 Sales Pipeline / Calling CRM  (n)
 Paid — Onboarding CRM        (n)
 Operations CRM               (n)
 Paid Pipeline                (n)
```

Each card shows: name · phone · email · pipeline + stage name · record-type chip
(Sales CRM Lead / Paid Onboarding CRM Lead / Operations CRM Lead / Paid Pipeline Buyer)
· status chips (Paid Linked, Converted, Archived, Hidden from Sales, CoC Sent/Signed)
· assigned owner · batch.

Quick actions per record type:
- **Sales / Paid Onboarding CRM Lead** → `Open Drawer` · `Jump to Kanban Card` · `Open Pipeline` · `Copy Phone` · `Copy Email`
- **Paid Pipeline Buyer** → `Open Paid Buyer` · `Open Paid Onboarding CRM` (if linked) · `Repair CRM Link` (admin only, if missing)
- **Operations CRM Lead** → `Open Operations Lead` · `Copy Phone` · `Copy Email`

Toggle at top right: **Current view only** ⇄ **All pipelines** (default = all for admin, current for non-admin).
Admin-only collapsible **Search Debug** at the bottom.

### 4. Jump-to-Kanban-Card
- Within Calling CRM (`/crm`): set active pipeline → set Kanban view → use a new `?focusLead=<id>` URL param. Kanban renders, then a `useEffect` scrolls the matching column horizontally and the card vertically into view (`scrollIntoView({behavior:"smooth", block:"center", inline:"center"})`), then adds a `data-focus-pulse` class for 3 s (CSS keyframe ring highlight).
- For paid pipeline buyers and operations leads: navigate to the right route (`/paid-pipeline?lead=<id>` already supported; `/operations-crm?lead=<id>`) and apply the same focus behavior in those Kanban views.
- If the lead is filtered out, show inline notice: *"This lead exists but is hidden by current filters. Clear filters or open drawer directly."* with a **Clear filters** button and an **Open drawer** button.

### 5. Empty state
"No lead found across accessible pipelines." with actions: `Add new lead`, `Search archived` (admin only — toggles `includeArchived` and re-runs), `Clear filters`. If query looks like email/phone, append: *"Checked Sales CRM, Paid Onboarding, Operations CRM, and Paid Pipeline."*

### 6. Audit logging
Add helper `logUniversalSearch(action, metadata)` posting to existing `activity_logs`. Logged actions only on user click:
- `universal_search_result_opened`
- `universal_search_jump_to_card`
- `universal_search_paid_buyer_opened`
- `universal_search_repair_link_clicked`

Keystrokes are **never** logged.

### 7. Role-safe visibility
- Admin: all results, can toggle archived/hidden.
- Non-admin: relies on RLS (no extra client filtering needed); archived/hidden toggles are hidden from UI.
- Finance fields on paid_pipeline_leads are not displayed in result cards (only name/email/phone/stage/owner).

---

## Files touched

**New**
- `src/lib/universalSearch.ts` — query orchestration, normalization, debug.
- `src/components/crm/UniversalSearchPanel.tsx` — dropdown UI + grouped results.
- `src/components/crm/UniversalSearchResultCard.tsx` — single card + actions.
- `src/hooks/useFocusKanbanCard.ts` — scroll/highlight helper shared by CRM, Paid Pipeline, Operations CRM Kanbans.

**Edited (small, surgical)**
- `src/pages/Crm.tsx` — mount `UniversalSearchPanel` under the search input, honor `?focusLead=`, pass through scope toggle.
- `src/pages/PaidPipeline.tsx` — honor `?focusLead=`, hook into `useFocusKanbanCard`.
- `src/pages/OperationsCrm.tsx` — same `?focusLead=` plumbing.
- `src/index.css` — `@keyframes focus-pulse` + `.data-focus-pulse` utility.

**Migration**
- One additive migration adding the 9 indexes listed above. No schema or policy changes, no data mutation.

---

## QA / acceptance map

| Spec part | Verification |
|---|---|
| 1–2 Universal box + result cards | Type email → grouped panel with all matches, chips, quick actions visible. |
| 3 Jump to Kanban Card | Clicking jump from a result switches pipeline, scrolls column + card, highlights 3 s. |
| 4 Multiple matches | Same person across CRM + Paid Pipeline shows in respective groups with distinct type chips. |
| 5 Normalized identity | Searching `+91 98xxx` and `98xxx` both find the same record (last-10 normalization). |
| 6 Paid Pipeline | Paid buyer surfaces; admin sees Repair CRM Link if `crm_lead_id` is null. |
| 7 Operations CRM | Ops lead surfaces with Open Operations Lead action. |
| 8 Role-safe | Non-admin sees no archived/hidden toggle; RLS filters results server-side. |
| 9 Performance | 300 ms debounce; min lengths enforced; limit 20/source; indexes added. |
| 10 Placement | Panel anchored under existing Calling CRM search; scope toggle visible. |
| 11 No mutation | Only reads, plus opt-in Repair link action (existing flow). |
| 12 Debug | Admin sees collapsible debug with normalized values + counts. |
| 13 Empty state | Clear copy + actions; admin gets Search archived. |
| 14 Audit | Only the 4 click actions logged with metadata. |
| 15 Build | No hook-order changes inside existing components; new panel uses its own hooks at top level. |

