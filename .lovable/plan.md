# Daily Lead Reporting — UX, Analytics, History, Export & Action Cleanup

Scope: improve the existing `DailyLeadReportingModule` only. No changes to Attribution Engine, Manual Upload, Automatic Attribution, Total ROAS, or the IPC design system.

## Phase 1 — Navigation shell + visible primary actions
- Replace the current "Hide History" toggle with a 3-view shell inside the module: **Create Report**, **History**, **Analytics**.
- Header shows title + subtitle + 3 primary actions (`+ New Daily Report`, `📊 Analytics`, `History`) — always visible, locked-design styled.
- Add 4 summary cards (Total Spend, Total Leads, Overall CPL, Reports Saved) driven by current filter range; visible above each view.
- Default view: if a draft exists → Create; else → History.

## Phase 2 — Always-visible add buttons + clearer dropdowns
- Update `QuickSaveInput` so the gold `+` button is always visible (not only when typing) when the field is empty or value isn't in saved list.
- Add a "saved-list" affordance: small chevron + helper text (`Click to choose from saved list or add new` / `No saved options yet — click + to add one`).
- Apply consistent placeholders to: Media Buyer Name, Ad Account Name, Lead Source Name, Saved Sheet Source, Metric Template, Custom Metric, Google Sheet URL.
- `+` opens a small popover dialog (Add New [Field]) → saves to `quick_save_entries` (or relevant table) → auto-selects new value.

## Phase 3 — Reports History view (prominent)
- Replace existing inline `DailyReportsHistory` with full view:
  - Filters row: Date range (From/To), Media Buyer, Ad Account, Search, Metric Template, Reset.
  - Top actions: `+ New Daily Report`, `Export History ▾`, `Analytics`.
  - Table columns: Created On · Report Date · Report Name · Media Buyers · Total Spend · Total Leads · Overall CPL · Actions.
  - Actions cell: `View` button + `⋯ More` dropdown (Edit, Copy WhatsApp, Export ▸ CSV/XLSX/PDF/Sheets-ready, Delete).
- View opens a right-side drawer (see Phase 4).

## Phase 4 — View / Edit / Delete report flows
- **View Drawer**: header with date, top summary cards, sections (Overall, Media Buyer Breakdown, Ad Accounts, WhatsApp Preview, Notes). Top-right buttons: Edit, Export ▾, Copy WhatsApp, Close. Visible `📋 Copy Full WhatsApp Report` button next to the WhatsApp preview box; toast on success/failure.
- **Edit**: load saved report into the Create flow, preserve `report_id`, show "Editing Saved Report" badge + `Save Changes` / `Save as New Copy` / `Cancel Editing`. Bumps `updated_at`, sets `report_status='edited'`.
- **Delete**: confirmation modal → soft delete (`is_deleted=true`); refresh history; toast.

## Phase 5 — Analytics view
- Filters: Date range, Media Buyer, Ad Account, Metric Template, Metric selector, Reset.
- 5 summary cards: Total Spend, Total Leads, Average CPL, Best CPL Buyer, Highest Lead Buyer.
- Charts (Chart.js, in bordered cards):
  1. Daily Spend trend (line)
  2. Daily Leads trend (line)
  3. Daily CPL trend (line)
  4. Media Buyer CPL comparison (bar)
  5. Media Buyer Spend vs Leads (grouped bar — separate if scales clash)
  6. Custom Metric trend (line, user-selected metric)
- Below: filtered history table; empty state if no data.

## Phase 6 — Unified Export menu
- Single `Export ▾` dropdown everywhere (single report and filtered history):
  - 📁 CSV · 📊 Excel/XLSX · 📄 PDF · 📋 Copy WhatsApp · 📗 Google Sheets Ready
- WhatsApp option only for individual reports; in bulk view show helper text instead.
- XLSX: try `xlsx` lib if already in deps; if not, fall back to CSV labelled "CSV (Excel-compatible)".
- Google Sheets Ready: download CSV + "Copy Table" (TSV to clipboard) with toast.

## Phase 7 — WhatsApp formatter cleanup
- Update `buildWhatsApp()` in `helpers.ts` to skip null/undefined metrics and empty buyers; format ₹ correctly; plain-text only.
- `📋 Copy WhatsApp Report` button visible in Step 3 Review, View drawer, and actions menu.

## Phase 8 — DB additions (only missing columns)
Single migration adds (idempotent `IF NOT EXISTS`):
- `daily_lead_reports`: `report_status text default 'saved'` (others `updated_at`, `is_deleted`, `whatsapp_message` already exist).
- `daily_lead_report_media_buyers`: `is_manual_lead_override boolean default false` (`status` already exists).
- `daily_lead_report_ad_accounts`: nothing — `metrics jsonb` already exists.

No data migrations. No hard deletes. Existing rows unaffected.

## Phase 9 — Aesthetic polish
- Card sections, status badges (Saved/Draft/Edited/Manual Override/Fetch Failed/Needs Review), compact action dropdowns, helper text, chart cards, no gradients/shadows.

## Out of scope (explicit)
- Attribution engine, Total ROAS, Manual Upload, Automatic Attribution, Media Buyer Attribution.
- Meta API, Google Sheets OAuth/write.
- Any change to existing tables beyond additive columns above.

## Technical notes
- New files:
  - `src/components/roas/daily/DailyLauncher.tsx` (3-view shell + summary cards)
  - `src/components/roas/daily/DailyHistoryView.tsx`
  - `src/components/roas/daily/DailyAnalyticsView.tsx`
  - `src/components/roas/daily/DailyReportDrawer.tsx`
  - `src/components/roas/daily/ExportMenu.tsx`
  - `src/components/roas/daily/AddItemPopover.tsx`
- Modified:
  - `src/components/roas/DailyLeadReportingModule.tsx` (mount shell, support edit-existing-report mode, expose Step 3 WhatsApp copy button)
  - `src/components/QuickSaveInput.tsx` (always-visible `+`, helper text, chevron)
  - `src/lib/dailyReports/helpers.ts` (WhatsApp formatter cleanup, XLSX/Sheets-ready exporters, soft-delete helper, history-range exporters)
- Migration: `supabase/migrations/<ts>_daily_reports_status_override.sql`

## Delivery order
Run as 3 commits within this turn, in order: Phase 8 migration → Phases 1–4 (shell, history, drawer, edit/delete, visible `+`) → Phases 5–7 + 9 (analytics, export menu, WhatsApp cleanup, polish). Verify build after each.
