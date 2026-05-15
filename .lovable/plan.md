# Paid Pipeline Operational Upgrade

This is a large, targeted enhancement to the existing Paid Pipeline + Calling CRM integration. No rebuild, no global UI changes, no data loss. I'll execute it in phased migrations + frontend additions, all preserving the existing IPC Control Center design.

## Scope summary

- Add operational fields (balance/follow-up/temperature/batches/CRM links) to existing tables
- New `paid_pipeline_followups` and `paid_pipeline_to_crm_links` tables
- Upgrade `PaidPipeline.tsx` dashboard, table, drawer, filters, bulk actions
- Upgrade `SendToPaidPipelineDrawer` minimally (lead temperature on review step)
- Add "Send to Calling CRM / Paid Onboarding" bulk modal that writes into existing CRM `leads`/`pipelines`/`stages`
- Add "+ New Stage" inline creator on the Calling CRM Kanban
- QuickSaveInput across every open-ended field
- Recalculation logic for totals/realized/balance/final sale

## Phase 1 — Database migration (single migration, all `IF NOT EXISTS`-safe)

`paid_pipeline_leads` — add columns:
balance_category, balance_description, next_balance_follow_up_date,
next_follow_up_date (if missing), next_follow_up_time, follow_up_reason,
follow_up_priority, follow_up_status, lead_temperature, paid_batch_name,
onboarding_batch_name, crm_pipeline_id, crm_stage_id, sent_to_crm,
sent_to_crm_at, revenue_to_be_realized, finance_notes,
finance_follow_up_date, finance_owner.

`paid_pipeline_payments` — add columns:
payment_category, next_payment_expected_date, payment_description,
finance_linked.

New tables (with RLS for active users — matches existing pattern):
- `paid_pipeline_followups`
- `paid_pipeline_to_crm_links`

Seed default Paid Onboarding pipeline + stages into existing CRM pipeline/stage tables ONLY if a pipeline named "Paid — Onboarding" doesn't already exist.

## Phase 2 — Frontend: PaidPipeline.tsx

Dashboard cards (replace current set):
1. Realized Revenue
2. Revenue To Be Realized
3. Token Collected
4. Balance Pending
5. Finance Pending
6. Final Sales
7. Dropped After Token
8. EMI / Finance Disbursed
9. Hot/Urgent Balance Pending
10. Follow-Ups Due Today

Filters bar additions: balance category, lead temperature, finance partner, finance status, follow-up date/status, revenue realization status, paid batch, onboarding batch.

Table additions:
- Row checkbox column + select-all
- Compact row actions: `+ Payment`, `Follow-Up`, inline `Stage` dropdown (QuickSave), inline `Priority/Temperature` dropdown (QuickSave), `Notes`, `Open`
- New columns: Lead Temperature badge, Next Follow-Up date

Bulk action bar (appears when ≥1 selected):
- Assign Owner, Update Stage, Update Temperature, Set Follow-Up, **Send to CRM / Paid Onboarding**, Export CSV, Delete (soft).

## Phase 3 — New small components

- `QuickAddPaymentModal` — payment category + type + amount + mode + date + description + next follow-up + flags (token / final / finance-linked). Recomputes totals on save.
- `QuickFollowUpModal` — date/time/reason/priority/status/assignee/notes → writes to `paid_pipeline_followups` and updates lead's next_follow_up_*.
- `SendToCrmBulkModal` — choose CRM pipeline (default "Paid — Onboarding"), CRM stage, onboarding batch (QuickSave), owner, notes. Inserts into existing CRM `leads` (skipping duplicates by phone/email per pipeline) + writes `paid_pipeline_to_crm_links`. Marks `sent_to_crm = true`.
- `BalanceFollowUpSection` (inside drawer) — balance_category + description + next_balance_follow_up_date.

## Phase 4 — Lead drawer rework (within existing drawer file)

Sections: Lead Summary, Payment Summary (with Realized + To-Be-Realized), Quick Status (stage/temperature/payment status/follow-up/owner), Add Payment, Finance/EMI, Activity/Notes, WhatsApp Templates (mailto/wa.me deep links with prefilled token-received / balance reminder / EMI docs / welcome messages).

## Phase 5 — Calling CRM "+ New Stage"

In existing CRM Kanban (`src/pages/Crm.tsx`): add a small "+ New Stage" button at the end of the stage strip → opens compact dialog (name, color, pipeline). Inserts into existing `stages` table with next position. Duplicate-name guard within pipeline.

## Phase 6 — Recalculation helper

Shared `recomputePaidLead(leadId)` util:
- token_amount_collected = Σ payments where category/type ∈ {Token, Second Token}
- total_collected = Σ positive payments − Σ refunds
- balance_pending = max(deal_value_including_gst − total_collected, 0)
- revenue_to_be_realized = balance_pending if not dropped/closed-lost else 0
- final_revenue_realized per `revenue_recognition_rule`
- is_final_sale only when full collection / finance disbursed / stage Enrolled-Active / manual
- is_dropped when stage = Dropped After Token / Closed Lost

Called after every payment add/edit/delete and stage change.

## Phase 7 — Quick-save coverage

Every open-ended field uses `QuickSaveInput` with these field keys:
`paid_pipeline_stage`, `payment_category`, `payment_type`, `payment_mode`,
`balance_category`, `follow_up_reason`, `follow_up_priority`,
`lead_temperature`, `finance_partner`, `finance_status`,
`paid_batch_name`, `onboarding_batch_name`, `crm_pipeline`,
`crm_stage`, `revenue_recognition_rule`.

## Phase 8 — Export CSV

Filtered-view CSV with the 19 fields listed in the prompt (Part 19).

## Out-of-scope guardrails

- No edits to global CSS, sidebar, topbar, or fonts
- No rebuild of Reports/Attribution/SendToPaidPipeline
- No deletion of any existing rows
- All migrations additive, all `IF NOT EXISTS`
- No hardcoded coach/finance/token values

## Sequencing

1. Run the single Supabase migration (Phase 1).
2. After approval + types regen, ship frontend in this order: helpers → modals → table/dashboard → drawer → CRM "+ New Stage".

Given the size, I'll deliver this in 2 turns: **Turn A** = migration only (so types regenerate). **Turn B** = all frontend changes + new components in one shot.

Approve to proceed with the migration.
