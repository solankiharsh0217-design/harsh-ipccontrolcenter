# Phase 1.1 — Code of Conduct Stage-Trigger Automation

Much of the foundation already exists: the `code_of_conduct_rules` table, the Admin "Trigger Rules" UI (`CodeOfConductRulesTab`), the runtime evaluator `evaluateStageTrigger()`, and one wiring point in the CRM Lead Drawer. This plan finishes the remaining gaps so the feature ships end-to-end without disturbing the working signed-PDF flow.

## Scope (only)
- Wire the existing evaluator into every stage-change path (CRM kanban DnD, CRM bulk move, Paid Pipeline drawer CRM-stage change, Paid Pipeline pipeline-stage change).
- Show CoC status in the CRM Lead Drawer + small chips on CRM kanban cards.
- Sync signed status across CRM + Paid Pipeline + apply tag + optional stage move + notifications when a lead signs.
- Persist "suggestion ignored" state per (lead, rule).
- Admin Requests filters: status, trigger type, rule, pipeline, stage.
- Audit events for every runtime action.

## Out of scope
Payments, follow-ups, imports, Operations rewards, LMS automation, signed-PDF generation logic, Team Directory, hard wipe.

## What's already done (reused as-is)
- `code_of_conduct_rules` table + `CodeOfConductRulesTab` admin UI (Part 1 ✓)
- `evaluateStageTrigger` / `findMatchingRule` / `logManualSendEvent` (Part 2 ✓)
- LeadDrawer (CRM) calls evaluator on dropdown stage change ✓
- `CodeOfConductPanel` on Paid Pipeline drawer ✓
- Signed PDF generation, evidence appendix, email links ✓

## Implementation

### 1. New DB pieces (one migration)
- `code_of_conduct_suggestion_ignores` (request_id nullable, crm_lead_id nullable, paid_pipeline_lead_id nullable, rule_id, stage_id, ignored_by, ignored_at) — admin/active-user insert; admin select.
- Add columns on `leads` and `paid_pipeline_leads`: `coc_status text`, `coc_request_id uuid`, `coc_signed_at timestamptz` (denormalised cache for fast chip rendering; updated by triggers/edge function).
- Trigger on `code_of_conduct_requests` AFTER UPDATE to mirror status → both leads tables, apply configured tag, optional stage move, fire notifications.

### 2. Runtime evaluator integration
- `src/pages/Crm.tsx` line ~398: after kanban drop stage update → call `evaluateStageTrigger({source:"crm"...})` and toast.
- `src/pages/Crm.tsx` line ~928: bulk stage update → loop minimal evaluator (skip if same stage) with throttle, surface summary toast.
- `src/pages/PaidPipeline.tsx` line ~1061 (CRM stage change from paid drawer) → evaluator with `source:"paid_pipeline"`.
- `src/pages/PaidPipeline.tsx` pipeline_stage change (line ~1038) → already linked through CRM stage; no extra trigger needed.

### 3. CRM Lead Drawer — CoC card
New component `src/components/crm/CodeOfConductCard.tsx`:
- Loads matched rule + latest request for the lead.
- Renders one of 8 states (Not Required / Required / Suggested / Sent / Viewed / Signed / Expired / Failed) with the buttons specified.
- Reuses `send-code-of-conduct-email` + `code-of-conduct-public` edge functions; reuses `ensureSignedPdf` pattern.
- "Ignore" inserts into `code_of_conduct_suggestion_ignores`; Suggested banner suppressed until rule/stage changes.
- Mounted in `LeadDrawer.tsx` between activity and follow-ups.

### 4. CRM Kanban chips
- Read `coc_status` denorm column on lead cards in `Crm.tsx`; render a small pill (`CoC Signed` green, `CoC Sent`/`Viewed` blue, `Required`/`Expired` amber/red, `Failed` red) only when the value is set.

### 5. Paid Pipeline drawer improvements
- `CodeOfConductPanel.tsx`: display matched rule name + trigger reason + suggested/auto-sent badge using `code_of_conduct_events`. Show "Code of Conduct Signed — ready for Diamond access review" banner when signed.

### 6. After-signing automation
Implemented in the DB trigger described above (runs with definer rights so it can touch leads/notifications/tags safely). Events written: `code_of_conduct_signed_status_synced`, `code_of_conduct_signed_tag_applied`, `code_of_conduct_signed_stage_updated`, `code_of_conduct_signed_notification_sent`.

### 7. Admin Requests filters
- `CodeOfConductAdmin.tsx` Requests tab: add filter chips/selects for status, trigger source (manual/auto/suggested), rule, pipeline, stage. All client-side filtering over the already-loaded list to avoid query rewrites.

### 8. Audit events
All evaluator branches and trigger actions write to `code_of_conduct_events`; `logManualSendEvent` is already wired for manual sends.

## Files touched
- New: `supabase/migrations/<ts>_coc_stage_triggers.sql`, `src/components/crm/CodeOfConductCard.tsx`
- Edited: `src/pages/Crm.tsx`, `src/pages/PaidPipeline.tsx`, `src/components/LeadDrawer.tsx`, `src/components/paid-pipeline/CodeOfConductPanel.tsx`, `src/pages/CodeOfConductAdmin.tsx`

## Risk controls
- Evaluator already has duplicate-protection (existing active request guard).
- Bulk move throttles to avoid email storms (sequential, max 25/batch).
- DB trigger is idempotent (only acts when status transitions to `signed` and not already synced).
- No changes to signed-PDF generation, RLS on private bucket, or public token logic.
