# ROAS Calculator — Add Automatic Master Sheet Fetching

## Goal
Add a method-selection screen to the **Media Buyer Attribution** tab. Keep the existing manual 4-step wizard untouched. Add a new 5-step **Automatic Master Sheet** wizard that fetches multiple tabs from one Google Sheet workbook, then reuses the existing matching algorithm and existing results UI.

---

## Scope boundaries
- No changes to the matching algorithm, the results screen layout, charts, exports, history saving, or design system.
- No changes to Total ROAS tab. Data Sources tab gets one additional section.
- Manual flow only changes by adding a "Calculation Method: Manual Upload" label at the top of results.

---

## File changes

### New files
- `src/components/roas/AttributionMethodSelect.tsx` — two-card chooser shown when Media Buyer Attribution tab opens with no method chosen.
- `src/components/roas/AutoFetchWizard.tsx` — the 5-step automatic wizard (steps 1–4 inline; step 5 reuses `AttributionResultsView`).
- `src/components/roas/MasterSheetMapping.tsx` — the mapping editor (sales tab + repeatable media buyer tabs + ad spend tab option). Reused by the wizard and by Data Sources "Add Master ROAS Sheet".
- `src/lib/roas/sheetFetch.ts` — `resolveSheetCsvUrl(masterUrl, tabInput)` + `fetchTabAsRows(csvUrl)`; extracts `spreadsheetId` and `gid`, builds `…/export?format=csv&gid=…`, parses CSV via Papa Parse, returns rows + detected headers.
- `src/lib/roas/autoAttribute.ts` — orchestrator: takes mapping + ad spends, fetches all tabs in parallel, normalizes (reusing existing email/phone/name normalizers), calls the existing matching algorithm, returns the same result shape `AttributionResultsView` already consumes.
- `src/components/roas/MasterSheetsSection.tsx` — Data Sources tab section listing saved master sheets with Use / Edit / Test Fetch / Archive.

### Edited files
- `src/pages/RoasCalculator.tsx` — inside the Media Buyer Attribution tab, render `AttributionMethodSelect` first; route to existing wizard or `AutoFetchWizard` based on choice. Add a "Back to Method Selection" affordance. Add `Calculation Method:` label at the top of the results section in both flows.
- `src/components/roas/AttributionResultsView.tsx` — accept a `calculationMethod: 'manual' | 'automatic_master_sheet'` prop and render the label; persist it on save (new column on `attribution_sessions`).
- `src/integrations/supabase/types.ts` — auto-regenerated after migration.

### Reused as-is
- Matching algorithm (existing helpers used by current wizard).
- `AttributionResultsView` (charts, tables, CSV/PDF export, save-to-history).
- `QuickSaveInput` for `webinar_name`, `media_buyer_name`, `google_sheet_url`, `data_source_name`.
- Existing IPC design tokens, fonts, colors.

---

## Wizard structure (Automatic)

```text
Step 1  Webinar Details        name (QuickSave) · date · type
Step 2  Master Sheet           source name · sheet URL · fetch method radio
Step 3  Map Tabs               sales tab · repeatable MB tabs · ad spend source
Step 4  Review Ad Spends       per-MB inputs OR fetched table w/ override
Step 5  Calculate + Results    progress states → AttributionResultsView
```

Validation, error states, and empty states match the spec verbatim.

---

## Database migration
Single migration adding:
- `roas_master_sheets` (workbook-level)
- `roas_master_sheet_tabs` (per-tab mapping with `tab_role` in {`media_buyer_leads`,`sales`,`ad_spends`})
- `roas_fetch_logs` (per fetch attempt)
- `attribution_sessions`: add `calculation_method` (default `'manual'`), `master_sheet_id`, `fetch_log_id`
- `attribution_media_buyers`: add `source_tab_name`, `source_tab_gid`, `source_type` (default `'manual_upload'`)
- `attribution_sales_detail`: add `source_sales_tab_name`, `source_sales_tab_gid`, `source_type` (default `'manual_upload'`)

RLS pattern matches existing ROAS tables (`is_active(auth.uid())` for read/insert by creator; admin manages all). Defaults ensure existing rows + manual flow keep working with zero code change.

---

## Fetching implementation notes
- Pure client-side fetch of `…/export?format=csv&gid=…`. Works for sheets shared "Anyone with the link" or published. No new edge function needed.
- `Test Fetch` button in Step 4 runs `fetchTabAsRows` against every mapped tab in parallel and shows per-tab status badges (ok / failed / missing-columns).
- Partial-success path: if sales + ≥1 MB tab succeed, allow "Continue with Available Data".
- Column auto-detection uses the alias map already in `src/lib/roas/fields.ts` (extend with the new aliases listed in the spec — e.g. `whatsapp`, `contact number`, `paid date`, `amount spent`).

---

## Out of scope (explicit)
- No mobile layout, no dark mode, no gradients/shadows.
- No changes to manual wizard internals.
- No new charts or KPIs.
- No private-sheet OAuth (warning shown to user).

---

## Order of execution after approval
1. Run the migration (single SQL, awaits approval).
2. Create `sheetFetch.ts` + `autoAttribute.ts`.
3. Create `AttributionMethodSelect`, `AutoFetchWizard`, `MasterSheetMapping`.
4. Wire into `RoasCalculator.tsx`; add the method label in results.
5. Add `MasterSheetsSection` to Data Sources tab.
6. Smoke-test: build passes, method selector renders, manual flow unchanged, auto flow fetches a public sheet and produces the same results UI.
