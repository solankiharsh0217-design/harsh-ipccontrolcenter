## Goal

Add an **Attendees** step to the ROAS Auto Attribution wizard (and Manual flow if used) that captures attendee lists for **every webinar day + the sales pitch**, supports both **CSV upload** and **Google Sheet tab** as sources, stores them durably against the attribution session, and lets users **download / re-trace** the original CSV later from the saved report.

This is **storage-only** — no change to attribution math.

---

## What gets built

### 1. Database (1 migration)

**New bucket** `roas-attendees` (private) for raw CSV files.

**New table `attribution_attendee_lists`**
- `session_id` → `attribution_sessions.id`
- `slot_type` text (`day` | `sales_pitch`)
- `slot_label` text (e.g. "Day 1", "Day 2", "Sales Pitch")
- `slot_date` date (nullable, auto-suggested from webinar dates)
- `source_kind` text (`csv_upload` | `google_sheet`)
- `file_path` text (storage path, when `csv_upload`)
- `file_name`, `file_size_bytes`
- `sheet_url`, `sheet_id`, `tab_name`, `tab_gid` (when `google_sheet`)
- `headers` jsonb, `row_count` int, `parsed_rows` jsonb (cap ~5,000 rows; larger files keep CSV in storage and store a pointer + sample)
- `column_mapping` jsonb (name/email/phone/duration auto-guess + override)
- `notes` text
- `uploaded_by`, `uploaded_at`

**RLS:** read for active members, insert/update/delete restricted to session owner or admin (mirrors `attribution_sessions` policies). Storage policies: same — files keyed by `{session_id}/{list_id}-{filename}`.

### 2. New wizard step: "Attendees" (between Ad Spends and Results)

`AutoWizardV6` step labels become: `Webinar Details → Connect Sheet → Ad Spends → Attendees → Results` (5 steps).

**Step 4 UI — `Step4Attendees`:**
- Auto-pre-fills one slot per webinar day from `webinar.dateMode`/`dates` + one **Sales Pitch** slot (date optional)
- "**+ Add another day**" / "**+ Add another sales pitch**" buttons for flexibility
- Per slot:
  - Source toggle: **CSV upload** | **Google Sheet tab**
  - CSV: drag/drop (PapaParse, already a dep), shows row count + first-row preview, column mapper (Name / Email / Phone / Duration — auto-guessed)
  - Sheet: paste sheet URL or pick a tab from the already-detected master-sheet tabs (reuse `detectedTabs` list); same mapper drawer pattern as `ColumnMappingDrawer.tsx`
  - "Remove" button
- Validation: **required** — every prefilled slot must have a source attached before "Calculate" is enabled
- Slots persist into the existing wizard draft `roas_calculation_drafts.detected_tabs`/new field so refresh-safe

### 3. Persistence on save

When the user saves results (existing flow in `AutoWizardV6` `runCalculation` → insert into `attribution_sessions`), also:
1. For each CSV slot: upload file to `roas-attendees/{sessionId}/...`, parse with PapaParse, insert one row into `attribution_attendee_lists` with `parsed_rows` (truncated if huge) + storage path
2. For each Sheet slot: fetch via existing `fetchTabAsRows` / `resolveSheetCsvUrl` helpers, store rows + sheet pointer

All inserts happen in parallel after the session insert succeeds. Failure of an attendee upload does not roll back the session — shows a toast and lets user retry from the saved report detail.

### 4. Saved report detail — view & download

In `Reports.tsx` (Attribution tab) and `AttributionResultsView.tsx`:
- New **"Attendees"** card listing each slot with: label, date, row count, source badge, **Download CSV** button (signed URL from storage for uploads; regenerated CSV from `parsed_rows` for sheet sources), **View rows** drawer (paginated table)
- Edit affordance: replace/remove a slot from the saved report (admin or owner)

### 5. No change to attribution engine

`attributionEngine.ts`, sales matching, ROAS math — untouched.

---

## Files

```text
NEW   supabase/migrations/<ts>_attribution_attendees.sql
NEW   src/components/roas/auto/Step4Attendees.tsx
NEW   src/components/roas/AttendeesPanel.tsx        (used in saved report detail)
NEW   src/lib/roas/attendees.ts                     (parse/upload/fetch helpers)
EDIT  src/components/roas/auto/AutoWizardV6.tsx     (insert Attendees step, wire save)
EDIT  src/components/roas/AttributionResultsView.tsx (mount AttendeesPanel)
EDIT  src/pages/Reports.tsx                         (show attendee count badge per session)
EDIT  src/integrations/supabase/types.ts            (auto-regenerated post-migration)
```

No new dependencies (PapaParse already in `src/lib/roas/preview.ts`; storage SDK available).

---

## Out of scope

- Cross-matching attendees against leads / changing attribution
- Editing existing past sessions to add attendees retroactively (those sessions just show "no attendee data captured")
- xlsx upload — CSV only in v1 (matches existing CSV-only pattern in the app)
