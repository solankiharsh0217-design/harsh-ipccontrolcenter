## Unpaid Sales Lead → Paid Onboarding Conversion

This is a large request (19 parts). To ship safely without breaking existing flows (invoices, CoC, payments, qualifier dedupe, ROAS), I'll deliver it in **3 phases**. Please confirm — or tell me to skip phases.

### What already exists (no rebuild needed)
- `leads.paid_pipeline_lead_id` link and "Open in Paid Pipeline" button in the lead drawer.
- `SendToPaidPipelineDrawer` — but it's wired to the **ROAS attribution session** flow, not to a single CRM lead. We'll build a new, lead-centric conversion modal that reuses the same `paid_pipeline_leads` / `paid_pipeline_batches` tables.
- `recomputePaidLead()` for totals.

### Phase 1 — Core conversion (ship first)
Covers Parts 1, 3, 4, 5, 6, 7, 9, 12 (minimal), 16, 18.

1. **DB migration** — new fields on `leads`: `conversion_status` (`not_converted` | `converted` | `linked_to_paid`), `converted_at`, `converted_by`, `converted_to_paid_pipeline_lead_id`, `hide_from_sales_workload bool`. New table `crm_lead_conversions` for audit history.
2. **Lead drawer banner** — when stage name is in `{Conversion Successful, Payment Confirmed, Closed Won}` and lead is not yet linked to a paid buyer, show banner with **"Convert to Paid Onboarding"** primary CTA. If already linked → banner becomes **"Converted"** + Open Paid buttons.
3. **`ConvertToPaidModal`** new component:
   - Identity match query against `paid_pipeline_leads` by normalized email + last-10-digit phone (active + archived).
   - If match → show match card with "Link Existing" (primary) or "Create New Anyway" (admin only).
   - If no match → form for batch (pick existing or new), product, deal value, token amount, payment mode/date, owner.
   - "Convert" action: create or link `paid_pipeline_leads` row, set `leads.paid_pipeline_lead_id` + `conversion_status='converted'`, insert payment row if token entered, call `recomputePaidLead`, write `crm_lead_conversions` audit row, toast success.
4. **Converted chip** on Kanban card + drawer header.
5. **Audit logs** via existing `logActivity`.

### Phase 2 — Admin rules + workload cleanup (Parts 2, 8, 10, 13, 14, 17)
- Admin Center → CRM Settings → **Conversion Rules** panel (which stages trigger banner; default destination batch/owner; auto-hide from sales workload; default owner policy).
- Kanban filter: Show / Hide / Only converted.
- Follow-up handling choice in modal.
- Permission gates (admin vs sales).

### Phase 3 — Polish (Parts 11, 15)
- Standalone "Merge / Link Lead" tool for legacy duplicates already in both pipelines.
- Verify CoC + Invoice panels light up automatically post-conversion (they already key off `paid_pipeline_lead_id`, so likely no code change — just QA).

### Technical notes
- New table `crm_lead_conversions` will have explicit GRANTs (authenticated + service_role) and RLS: insert/select by active users, no anon.
- New `leads` columns added with safe defaults; existing rows get `conversion_status='not_converted'` (or `linked_to_paid` where `paid_pipeline_lead_id is not null`) via the migration.
- No changes to `invoices`, `code_of_conduct_*`, `paid_pipeline_payments` finance compute, `lead_qualifier_*`, ROAS, Operations CRM, Team.

### Question before I start
**Should I proceed with Phase 1 only first** (so you can test the core flow on Zuber nadaf), then I do Phase 2 and 3 in follow-up turns? Or do you want all 3 phases in one go?
