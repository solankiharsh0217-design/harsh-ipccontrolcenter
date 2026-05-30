# Code of Conduct Trigger Rules — Automation Builder Refresh

## Goal
Turn the dense Trigger Rules form into a clean 3-section automation builder, add a true "After CoC Email Sent → move stage" rule, replace native dropdowns with IPC searchable comboboxes, and let admins create/rename/archive tags directly inside the rule builder.

## Scope (frontend + thin backend)
- Admin Center → Code of Conduct → Trigger Rules tab only
- Send-CoC edge function: add post-send evaluator call + return automation result for toast
- DB: extend `code_of_conduct_rules` for post-send config; add `lead_tags` archive/normalized fields if missing; add post-send audit event types (free text in existing events table)

Untouched: signed PDF, signing page, invoice, payments, qualifier, import, batch repair, paid finance.

## UX structure
Trigger Rules tab gets three stacked sections, each with a description, an "+ Add Rule" button, and a list of rule cards.

1. **When should Code of Conduct be sent?** — existing stage-trigger rules
2. **What happens after member signs?** — existing after-signed config (extracted from the same row for clarity)
3. **What happens after email is sent?** — NEW post-send stage-move rules

Each rule shows as a card: name, trigger summary, mode chip, template, after-action chip, Active/Inactive toggle, last-run timestamp, and an actions menu (Edit, Duplicate, Test, Disable, Delete).

## Stepwise rule modals
Replace the flat form with a 6-step wizard for sections 1+2 (combined: stage trigger + after-signed) and a 6-step wizard for section 3 (post-send).

Stage trigger wizard:
1. Source (Calling CRM / Paid Pipeline) — segmented buttons
2. Pipeline + Stage — IPC comboboxes
3. Mode (Suggest only / Auto-send) — radio cards
4. Template — IPC combobox
5. After signed: tag combobox (with inline create), optional move-to stage, notify admin, notify owner
6. Review summary in plain English

Post-send wizard:
1. Event (fixed: "CoC email sent successfully")
2. Apply to: Any template / Specific template (combobox)
3. Source scope: Calling CRM / Paid linked CRM / Both — segmented
4. Destination pipeline + stage — IPC comboboxes
5. Repeat behavior: do not move again on resend (default) / move again — radio
6. Review summary

## IPC combobox
New `src/components/ui/ipc-combobox.tsx` wrapping shadcn `Command` + `Popover`: searchable, checkmark on selected, empty-state, optional `onCreate` slot for inline creation, optional `actions` slot for rename/archive per item. Light popover, no native styling.

Used for pipelines, stages, templates, tags, sources, destinations.

## Inline tag manager
Inside the tag combobox:
- Search filters by `normalized_name`
- "+ Create '<typed value>'" when no exact match
- Per-item kebab (admin only): Rename, Archive (or Delete if unused)
- Archived tags hidden by default with a "Show archived" toggle and Restore action

`lead_tags` columns ensured: `id, name, normalized_name (unique), color, is_active, created_by, updated_by, created_at, updated_at`. Hard delete only if no `lead_tag_assignments`; otherwise archive (`is_active=false`).

## Post-send automation backend
- Extend `code_of_conduct_rules` with: `post_send_enabled bool`, `post_send_scope text` ('crm'|'paid'|'both'), `post_send_template_id uuid null` (null = any), `post_send_destination_pipeline_id uuid`, `post_send_destination_stage_id uuid`, `post_send_repeat_on_resend bool default false`, `last_run_at timestamptz`.
- Edge function `send-code-of-conduct-email`: after the provider confirms `sent`, call the existing `evaluatePostSendAutomation(requestId)` helper (already in `src/lib/codeOfConductAutomation.ts`) — extend it to read the new fields, resolve the linked CRM lead via `request.crm_lead_id → paid_pipeline_leads.crm_lead_id → email → phone`, update `leads.stage_id` / `leads.pipeline_id`, write a `code_of_conduct_events` row (`coc_post_send_rule_applied` / `_skipped` / `_failed` with `skip_reason`), update `rules.last_run_at`.
- Skip if: email failed, lead missing/archived, destination stage missing/inactive, rule inactive, request cancelled, already moved and repeat disabled.

Function returns `{ ok, request_id, automation: { matched, applied, stage_name?, skip_reason?, error? } }` so the UI can show the right toast.

## Toasts (LeadDrawer + PaidPipeline send actions)
- email sent + stage moved → `CoC email sent. Lead moved to {stage}.`
- email sent + no rule → `CoC email sent. No post-send rule matched.`
- email sent + automation failed → `CoC email sent, but stage automation failed.` (with debug link)
- email failed → `Email failed. Stage was not changed.`

## Rule test / dry-run
"Test Rule" on each card opens a modal with a lead picker (search by name/email/phone). Calls a new `dryRunRule(ruleId, leadId)` helper that returns `{ matches, willSendEmail, willMoveStage, willApplyTag, skipReason }` — no DB writes, no email send.

## Audit logging
Insert into `code_of_conduct_events` with `event_type` of: `coc_trigger_rule_created/updated/deleted`, `coc_post_send_rule_created/updated/applied/skipped/failed`, `coc_tag_created_from_rule`, `coc_tag_updated_from_rule`, `coc_tag_archived_from_rule`. Metadata includes rule_id, request_id, lead_id, paid_pipeline_lead_id, template_id, old/new stage_id, tag_id, performed_by.

## Files

New:
- `src/components/ui/ipc-combobox.tsx`
- `src/components/admin/coc/TriggerRulesSection.tsx`
- `src/components/admin/coc/AfterSignedSection.tsx`
- `src/components/admin/coc/PostSendRulesSection.tsx`
- `src/components/admin/coc/RuleCard.tsx`
- `src/components/admin/coc/StageTriggerWizard.tsx`
- `src/components/admin/coc/PostSendWizard.tsx`
- `src/components/admin/coc/TagCombobox.tsx`
- `src/components/admin/coc/RuleTestModal.tsx`
- Migration: add post-send columns + lead_tags hardening

Edited:
- `src/components/admin/CodeOfConductRulesTab.tsx` — becomes a thin shell rendering the 3 sections
- `src/components/admin/PostSendAutomationRulesSection.tsx` — replaced by new section (kept as re-export for compatibility)
- `src/lib/codeOfConductAutomation.ts` — extend evaluator + dry-run helper
- `supabase/functions/send-code-of-conduct-email/index.ts` — call evaluator, return automation result
- `src/components/LeadDrawer.tsx` and `src/components/paid-pipeline/CodeOfConductPanel.tsx` — surface new toasts from response

Untouched: signing page, signed-PDF function, invoice, payment, qualifier, import, batch repair.

## Risks / accepted tradeoffs
- Rule schema change is additive — old rules keep working; new section is opt-in per rule.
- Tag hard-delete only when unused; otherwise archive — prevents broken `lead_tag_assignments`.
- Dry-run never writes — pure read-only resolution.

## Out of scope
- Bulk rule import/export
- Per-rule scheduling/windows
- Multi-stage cascades after post-send
