## Paid Pipeline Engine — Phased Build Plan

A configurable system that converts Media Buyer Attribution sales into a tracked CRM pipeline with payments, finance/EMI, balance, and realized revenue. Customizable for any coach (not IPC-only).

---

### Phase 1 — Database foundation (1 migration)

Create 7 new tables (all soft-delete, RLS enforced):

- `webinar_batches` — reusable batch identity (name, date, type, BU, offer)
- `program_products` — products/programs per BU (price incl. GST, currency, GST flag/rate, default token, revenue-recognition rule, active)
- `paid_pipeline_settings` — single table for all configurable lists (`setting_type` ∈ payment_type, payment_model, pipeline_stage, finance_partner, finance_status, revenue_recognition_rule), with seeded defaults
- `paid_pipeline_leads` — main entity, stores attribution context + payment summary + flags (is_final_sale, is_enrolled, is_dropped, is_refunded)
- `paid_pipeline_payments` — payment ledger (token / balance / EMI / refund / adjustment)
- `paid_pipeline_finance_details` — 1:1 finance/EMI tracker
- `paid_pipeline_activity_logs` — audit trail

RLS pattern (mirrors existing `attribution_*` tables):
- `*_admin` ALL → admin role
- `*_read` SELECT → any active user
- `*_insert/update` → `created_by = auth.uid()` OR admin
- Soft-delete only (`is_deleted` flag, no DELETE for non-admins)

Indexes on: `webinar_batch_id`, `attribution_session_id`, `attribution_sale_id`, `(email, phone)` for duplicate detection.

Seed `paid_pipeline_settings` with all defaults listed in your spec (payment types, models, stages, finance partners/statuses, revenue rules). Seeded as `business_unit = NULL` (global) so any BU inherits them; coaches can override per BU.

---

### Phase 2 — Send to Paid Pipeline flow

In `AttributionResultsView.tsx`:
- Add **"Send Sales to Paid Pipeline"** button near Full Sales Attribution section
- Add row checkboxes (select all / matched-only / include-unmatched filter)

New `SendToPaidPipelineDrawer.tsx` (5 steps, IPC drawer styling):
1. Webinar Batch — auto-fill from session, allow create/select existing, save to `webinar_batches`
2. Product / Program — select from `program_products` (BU-scoped) or create inline; shows price, GST, default token
3. Payment Model — dropdown from settings
4. Review Buyers — editable per-row table: token amount, payment model override, initial stage, assigned executive, follow-up date. Live `balance_pending = deal_value − token_collected`
5. Confirm & Push — duplicate check (phone/email + batch + attribution_sale_id) with Skip / Update / Create-anyway choice; default Skip

Pushes inserts into `paid_pipeline_leads` (+ initial token row in `paid_pipeline_payments` if token > 0) + activity log entry.

---

### Phase 3 — Paid Pipeline module (Calling CRM tab)

New route `/crm/paid-pipeline` (added to existing CRM page as a tab — does not touch existing pipelines):

- **Filters:** batch, product, stage, payment status, finance status, assigned to, media buyer, date range, search
- **Summary cards:** Total Token Collected · Total Deal Value · Total Collected · Balance Pending · Final Sales · Dropped After Token · Finance Pending · EMI Disbursed Revenue
- **Views:** Table (default), Board (by stage), Batch (grouped), Payment Follow-Up (sorted by follow_up_date)
- **Row actions:** View · Edit · Add Payment · Update Stage · Assign · Copy WhatsApp · Soft Delete

`PaidLeadDrawer.tsx` — full lead detail with sections: Basic · Attribution context · Payment History (+ Add Payment) · Finance/EMI · Activity log · WhatsApp templates.

**Auto-rules on payment add:**
- `total_collected = Σ(positive amounts) − Σ(refunds)`
- `balance_pending = deal_value − total_collected`
- If `total_collected ≥ deal_value` → status=Full Payment Received, stage=Enrolled/Activated, is_final_sale=true
- If finance status=Disbursed and rule allows → is_final_sale=true, realized=loan_amount + down_payment
- `final_revenue_realized` derived from product's `revenue_recognition_rule`

---

### Phase 4 — Settings UI (Master Data → Paid Pipeline)

New section in Master Data page (or new sub-page `MasterData/PaidPipeline.tsx`):
- Tabs: Products · Payment Types · Payment Models · Pipeline Stages · Finance Partners · Finance Statuses · Revenue Rules
- Each tab: list + add/edit/soft-delete (mirrors existing `MasterData.tsx` UX)
- Products tab is richer (price, GST, default token, revenue rule)

---

### Phase 5 — Reports & permissions

- Add `paid-pipeline` to `src/lib/modules.ts` for Admin Panel access control
- Add new sections to `Reports.tsx`: Token Collection · Final Sales Realization · Pending Balance · Finance/EMI Pending · Dropped After Token · Media Buyer Quality · Sales Exec Follow-Up · Webinar Batch Payment
- Media Buyer Quality joins `paid_pipeline_leads.attributed_media_buyer` to compute token→final conversion %, realized revenue per buyer

Profit Statement integration: leave a clean read interface (`final_revenue_realized` column) but **do not** auto-wire it now — explicitly noted to avoid breaking the existing finance module.

---

### What stays untouched

- Sidebar/topbar/AppLayout, fonts, `index.css`, design tokens
- Existing Attribution tables/logic (only adds a button + drawer that *reads* sessions)
- ROAS Calculator, Daily Lead Reporting, existing CRM pipelines
- Existing Reports (only appends new sections)
- Profit Statement (read-only future hook only)

---

### Suggested execution order

I'd ship this across multiple turns, each independently testable:

1. **Turn A** — Migration (Phase 1) + seed settings. Wait for your approval on the migration.
2. **Turn B** — Settings UI (Phase 4) so you can configure before pushing data.
3. **Turn C** — Send to Paid Pipeline button + drawer (Phase 2).
4. **Turn D** — Paid Pipeline tab in CRM with table + drawer + payments/finance (Phase 3).
5. **Turn E** — Reports + Admin access key (Phase 5).

This keeps each turn reviewable and avoids a single 50-file change that's impossible to verify.

---

### Confirmations needed before I start

1. **Sidebar placement:** Paid Pipeline as a tab inside existing **Calling CRM** page (preferred per your spec) — confirm?
2. **Settings location:** Add as new tabs inside existing **Master Data** page — confirm?
3. **Currency:** default `INR` with field-level override per product — OK?
4. **Phase A first:** I'll start with the migration only this turn. OK to proceed?
