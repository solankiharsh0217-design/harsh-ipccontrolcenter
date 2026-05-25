# Operations CRM — Phased Build Plan

This is a large module (5 new tables, multiple pages, settings, gamification). To stay safe and reviewable, I will implement it in 4 phases matching your recommended build order. **This plan covers all 4 phases**, but I will deliver and ask for review **after each phase** so we don't ship a 4000-line untested change in one shot.

## Phase A — Foundation (this delivery)

**Database migration** (single migration, all safe, no destructive ops):
- `operations_leads` — full schema per spec, linked via nullable `crm_lead_id` and `paid_pipeline_lead_id`
- `operations_service_events` — event log for start/pause/resume/stop/complete
- `operations_conversion_reports` — with verification fields
- `operations_reward_rules` — seeded with default IPC rule (10 approved conversions = ₹3,000, monthly)
- `operations_reward_progress` — per media buyer per month
- Add column `profiles.can_receive_operations_leads boolean default false`
- Add `module_key = 'operations_crm'` to `ModuleKey` union
- RLS: admins full access; team members can read leads where `assigned_media_buyer_id = auth.uid()` and write events/conversions for their own leads; conversion approval restricted to admins
- Triggers: `updated_at`, unique index preventing duplicate active operations record per `crm_lead_id` or `paid_pipeline_lead_id`

**Sidebar & access**:
- New nav item "Operations CRM" → `/operations-crm`, visible if `hasModule('operations_crm')` or admin
- Add to `MODULES` list in `src/lib/modules.ts` so admins can grant access in Team Directory
- Add `can_receive_operations_leads` toggle in Manage Member modal (Team page) alongside existing eligibility flags
- Register `operations_crm` in `eligibleAssignees.ts` CONTEXT_MAP

**Send to Operations CRM**:
- New button on Calling CRM toolbar (when paid-onboarding pipeline active) + Paid Pipeline bulk-action bar
- New `SendToOperationsCrmModal` component:
  - Source scope (selected / all in stages / all in view)
  - Service duration (3 / 6 / 10 / custom months, from app_settings)
  - Service package (free text + quick-save suggestions)
  - Assignment method (unassigned / single / round-robin) using existing eligibility filter
  - Notes
  - De-dup check: warns if `crm_lead_id` or `paid_pipeline_lead_id` already exists in active operations record; offers Skip vs Update
- Creates `operations_leads` rows; does NOT mutate source CRM/Paid Pipeline rows
- Audit log `operations_leads_sent_from_crm`; grouped assignment notification per assignee (reusing `createNotification`)

**Operations CRM Kanban page** (`src/pages/OperationsCrm.tsx`):
- Reuses Calling CRM Kanban patterns (compact header, top metric cards, drag/drop, stage management)
- Default stages stored in DB (`operations_stages` reuses existing `stages` table with `pipeline_id` of a new "operations" pipeline, so we don't duplicate stage infra) — seeded with the 11 default stages
- Filters: search, media buyer, service status, batch, package, single date-range popover, tags, conversion status
- Top cards: total / active / not started / paused / stopped / completed / conversions this month / reward progress
- Card content per spec; click opens drawer (Phase B fills it)

## Phase B — Service tracking + drawer (next delivery)
- Full drawer with profile, assignment, package, timeline
- Start / Pause / Resume / Stop / Complete buttons → write `operations_service_events`
- Day calculation: `total_active_days`, `total_paused_days`, `service_end_target_date` recomputed on each event
- Estimated end date visible on card + drawer

## Phase C — Conversions + rewards
- Conversion reporting UI in drawer + approve/reject flow for admins
- Reward progress widget on Media Buyer dashboard
- Monthly auto-rollup triggered on conversion approval

## Phase D — Notifications, Master Settings, reporting
- All notification triggers (overdue launch, paused, nearing completion, reward milestones)
- Master Settings page sections for stages / durations / packages / pause reasons / reward rules / email templates
- Admin reporting + CSV export
- Email template scaffolding (copyable for V1; live send deferred until email infra confirmed)

## Technical notes

- All defaults stored in `app_settings` (existing key-value pattern) — no hardcoded ₹3,000 / 10 conversions / 3-6-10 months in code paths, only as seed values
- Reusing existing `stages` table (with new `pipeline_type='operations'` pipeline row) instead of a parallel `operations_stages` table — keeps Kanban management, reorder, deactivate, drag/drop logic identical to Calling CRM
- Reusing existing `tags` system via lead-tag pivot pattern if available
- Reusing `AssignModal` infra by adding `operations_crm` as a recognized `moduleKey` (notifications already grouped + deep-linked from the recent fix)
- No deletion of Calling CRM / Paid Pipeline records anywhere
- New unique constraint prevents double-send duplicates

## Out of scope for now
- Live email sending (Phase D will scaffold templates; real SMTP/SendGrid deferred until you confirm provider)
- Weighted round-robin (added as a "future" placeholder in AssignModal; equal RR shipped in Phase A)
- AI insights (explicitly excluded by your spec)

## Confirmation needed before I start
Confirm I should proceed with **Phase A only** in this delivery (~1 migration + ~6 new files + sidebar/Team edits), then we review live before Phase B.
