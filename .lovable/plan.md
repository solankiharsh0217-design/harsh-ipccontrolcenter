# P0 — Code of Conduct Post-Send Automation

Build a configurable rule engine so that when a Code of Conduct email is successfully sent, the linked CRM lead is automatically moved to an admin-selected pipeline/stage.

## 1. Database (single migration)

**New table `code_of_conduct_automation_rules`**
- `id`, `name`, `event_type` (default `'email_sent'`)
- `template_id` (nullable → any template)
- `source_type` (`crm` | `paid_pipeline` | `both`)
- `current_pipeline_id` / `current_stage_id` (nullable → any)
- `destination_pipeline_id`, `destination_stage_id` (required)
- `also_update_paid_pipeline_stage` (bool), `destination_paid_pipeline_stage` (text, nullable)
- `allow_repeat` (bool), `is_active` (bool)
- `created_by`, `updated_by`, timestamps
- GRANTs + RLS: read by authenticated, write admin-only

**New table `code_of_conduct_automation_events`**
- `id`, `request_id`, `rule_id`, `event_type`
- `crm_lead_id`, `paid_pipeline_lead_id`
- `old_pipeline_id`, `old_stage_id`, `new_pipeline_id`, `new_stage_id`
- `status` (`applied` | `skipped` | `failed`), `skip_reason`, `error_message`
- `created_by`, `created_at`
- GRANTs + RLS: insert authenticated, read admin

## 2. Evaluator (`src/lib/codeOfConductAutomation.ts`)

`evaluatePostSendAutomation({ requestId, ruleEvent: 'email_sent', dryRun? })`:
1. Load request → get `template_id`, `crm_lead_id`, `paid_pipeline_lead_id`, status.
2. Load active rules for `event_type='email_sent'` matching template + source.
3. Resolve linked CRM lead (direct → paid_pipeline_leads.crm_lead_id → email/phone fallback only if missing).
4. Apply safety checks (archived, deleted/inactive destination stage/pipeline, request cancelled, already in destination, allow_repeat=false + already applied).
5. Update `leads.pipeline_id` / `stage_id`; optionally `paid_pipeline_leads.pipeline_stage`.
6. Write `code_of_conduct_automation_events` row + `code_of_conduct_events` audit (`coc_post_send_stage_move_rule_matched`, `_moved`, `_skipped`, `_failed`).
7. Return `{ status, ruleName, oldStage, newStage, skipReason?, error? }` for toast + debug.

## 3. Wire into send flow

- `src/lib/codeOfConductRules.ts` — after successful `send-code-of-conduct-email` invoke (auto-send path), call evaluator.
- `src/components/paid-pipeline/CodeOfConductPanel.tsx` — after manual send / resend success, call evaluator and show toast variants:
  - sent + moved → "…Lead moved to {stage}."
  - sent + no rule → "…No stage automation rule matched."
  - sent + failed → "…stage automation failed. Check debug."
  - failed → "…Stage was not changed."

## 4. Admin UI

**`src/components/admin/CodeOfConductRulesTab.tsx`** — add new section "After Code of Conduct Email Sent" with:
- List of post-send rules with summary line "When CoC email is sent, move lead to {Pipeline → Stage}".
- `+ Add Post-Send Rule` button → modal `PostSendRuleModal.tsx`:
  - Name, Source (crm/paid/both), Template (any/specific), Current stage condition (any/specific multi), Destination pipeline → stage, Allow repeat, Also move paid pipeline stage, Active.
- Edit / delete / toggle active.

## 5. Drawer debug panel

Inside `CodeOfConductPanel.tsx` (admin only):
- Collapsible "Post-Send Automation Debug" section showing matched rule, current vs destination stage, last automation event for this request, last skip reason / error.
- "Run Automation Check" button → calls evaluator with `dryRun: true`, renders result.

## 6. Out of scope (untouched)

Signed PDF generation, signing page, email template content, invoice/payment/follow-up/import/team systems, edge function `send-code-of-conduct-email` internals (we only consume its `ok` response).

## Technical notes

- All stage moves go through the existing `leads` table; no new triggers.
- Idempotency: query `code_of_conduct_automation_events` for `(request_id, rule_id, status='applied')` before moving when `allow_repeat=false`.
- Type updates pulled in via auto-generated `src/integrations/supabase/types.ts` after migration; use `(supabase as any)` casts in new lib code until regen.
- Toast variants centralized in a helper to keep manual + auto send paths consistent.

Proceed?
