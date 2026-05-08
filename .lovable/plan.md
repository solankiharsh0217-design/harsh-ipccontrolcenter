# ROAS Automatic Fetching v6

Replace the current Automatic Fetching wizard with a leaner 4-step flow. Manual Upload, attribution logic, results UI, history, and design system stay untouched.

---

## Final flow (Automatic only)

```text
Step 1  Webinar Details              required: type, name, date(s) · optional bundle collapsed
Step 2  Connect Master Sheet         one URL → detect tabs → assign roles (Sales / MB / Ignore)
Step 3  Enter Ad Spends              manual ₹ per selected media buyer
Step 4  Results                      existing AttributionResultsView + context panel
```

No tab URLs, no gids, no Zoom IDs/links/recording, no Ad_Spends sheet.

---

## New / edited files

**New**
- `supabase/functions/fetch-roas-master-sheet-tabs/index.ts` — server-side Google Sheets API call. Input: `{ masterSheetUrl }`. Output: spreadsheet metadata + per-tab `{ sheetId, tabName, guessedRole, confidence, detectedHeaders, sampleRows, validRowsCount, detectedColumnMapping, warnings }`. Uses `GOOGLE_SHEETS_API_KEY` secret.
- `src/components/roas/auto/WebinarDetailsStep.tsx` — Step 1. Webinar Type (QuickSave) drives date input shape (single / range / multiple / custom). Collapsible "More Webinar Details" with timing block (per-day toggle), format, operator, slot, platform (default Zoom), zoom account, notes.
- `src/components/roas/auto/ConnectSheetStep.tsx` — Step 2. One URL input (QuickSave `google_sheet_url`), Detect Tabs button, summary cards, per-tab role dropdowns, MB name with auto-clean, status badges, hidden "Manual Expert Mode" fallback for gid.
- `src/components/roas/auto/ColumnMappingDrawer.tsx` — drawer to confirm name/email/phone (+ optional) per tab when needed.
- `src/components/roas/auto/AdSpendsStep.tsx` — Step 3. Manual ₹ inputs per selected MB, total, Test Fetch, Calculate.
- `src/components/roas/auto/ResultsStep.tsx` — Step 4. Reuses existing `AttributionResultsView`. Adds context panel + Edit/Recalculate/Start Fresh buttons + "Data used" collapsible + Needs Recalculation banner.
- `src/components/roas/auto/AutoWizardV6.tsx` — orchestrator (stepper, draft persistence, navigation rules, change detection).
- `src/lib/roas/autoDraft.ts` — localStorage + debounced Supabase draft sync helpers.
- `src/lib/roas/tabClassify.ts` — guess role (sales / media_buyer / ignore / unknown) + clean MB name.

**Edited**
- `src/pages/RoasCalculator.tsx` — when Automatic is chosen, render `AutoWizardV6` instead of the existing `AutoFetchWizard`.
- `src/components/roas/AttributionResultsView.tsx` — accept optional `contextPanel` slot (no logic change).
- (Existing `AutoFetchWizard.tsx` kept on disk for reference but no longer routed; safe to delete later.)

**Untouched**
Manual Upload wizard, matching algorithm, AttributionResultsView internals, history save, design tokens, Total ROAS tab, Data Sources tab.

---

## Database migration (single)

New table:
- `roas_master_sheet_mappings` — per spec (`spreadsheet_id`, `master_sheet_url`, `sales_sheet_id/tab_name`, `media_buyer_mappings jsonb`, `ignored_tabs jsonb`, `column_mappings jsonb`, audit cols, `is_active`). RLS: read for active members, insert/update for `created_by = auth.uid()`, admin-all.
- `roas_calculation_drafts` — per spec, RLS owner-only.

Add columns (idempotent `IF NOT EXISTS`):
- `attribution_sessions`: `master_sheet_url`, `master_sheet_title`, `webinar_type`, `webinar_date_mode`, `webinar_single_date`, `webinar_start_date`, `webinar_end_date`, `webinar_dates jsonb`, `webinar_timing jsonb`, `webinar_format`, `webinar_operator`, `session_slot`, `webinar_platform`, `zoom_account_used`, `webinar_notes`, `tab_role_mapping jsonb`, `column_mapping jsonb`, `result_status text default 'fresh'`. (`calculation_method`, `master_sheet_id`, `fetch_log_id` already exist.)
- `attribution_media_buyers`: `source_sheet_id` (others exist).
- `attribution_sales_detail`: `source_sales_sheet_id` (others exist).

QuickSave field keys reused (no schema change): `webinar_type`, `webinar_name`, `webinar_format`, `webinar_operator`, `session_slot`, `webinar_platform`, `zoom_account_used`, `google_sheet_url`.

---

## Edge function — tab detection

`fetch-roas-master-sheet-tabs` (verify_jwt validated in code via `getClaims`):
1. Extract `spreadsheetId` from URL.
2. `GET https://sheets.googleapis.com/v4/spreadsheets/{id}?key=...&includeGridData=false` → titles + sheetIds.
3. For each tab: `GET .../values/{tab}!A1:Z20?key=...` → headers + sample rows.
4. Classify with rules from PART 20; auto-detect column mapping using existing alias map in `src/lib/roas/fields.ts`.
5. Return structured payload + warnings.

Errors: 403/404 → "share as Anyone with the link can view"; missing key → "configure GOOGLE_SHEETS_API_KEY".

**Secret required:** `GOOGLE_SHEETS_API_KEY` — will request via `add_secret` after migration approval.

---

## Persistence & navigation

- localStorage keys per spec, written on every change.
- Supabase draft synced 800ms debounced.
- Recovery banner on mount if draft exists.
- Stepper: completed/current clickable, future locked unless prior valid; Results clickable only if a snapshot exists.
- Editing inputs after results → `result_status='outdated'` → amber banner + Save to History disabled until Recalculate.
- Saved-mapping reuse: on Detect Tabs, look up `roas_master_sheet_mappings` by `spreadsheet_id` and prefill roles.

---

## Out of scope
Attribution accuracy changes, results UI rebuild, manual wizard, mobile/dark mode, gradients/shadows, OAuth for private sheets.

---

## Execution order after approval
1. Run migration.
2. Request `GOOGLE_SHEETS_API_KEY` secret.
3. Create edge function + helpers.
4. Build wizard components and wire into `RoasCalculator.tsx`.
5. Smoke-test: detect a public sheet, assign roles, enter spends, calculate, save.
