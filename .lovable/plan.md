# Calling CRM → Operations CRM Handoff Cleanup

This is a multi-part fix touching the Calling CRM Kanban, the lead drawer, the Send to Operations modal, Operations CRM filtering, and a new Operations Handoff Rules system in Master Settings.

## Scope

Parts 1–11 from your spec. Phase C (conversion reporting, rewards, AI Insights) is explicitly out of scope.

---

## 1. Calling CRM bulk selection UI (`src/pages/Crm.tsx`)

- Move card checkbox to the **left** of the card header, before the name.
- Move stage select-all checkbox to the **left** of the stage header, before the stage name. Support `indeterminate` state.
- Checkboxes use existing `<Checkbox>` (subtle, always rendered, low-contrast border; selected card gets `ring-1 ring-primary/40 bg-primary/5`).
- Bulk action bar: sticky pill at top-left of the Kanban (below filters), not floating right. Layout: `"N selected | Move Stage | Assign | Send to Operations | Add Tag | Clear"`.
- Audit log `crm_bulk_selected` on first selection per session.

## 2. Restore CRM Stage section in Lead Drawer (`src/components/LeadDrawer.tsx`)

- New compact **CRM Stage** section: current stage badge + "Change Stage" dropdown listing live stages from the lead's pipeline.
- Updating writes to `leads.stage_id`, refreshes parent, logs `crm_stage_changed`, and if the destination stage is eligible for Ops handoff, shows an inline "Send to Operations CRM" suggestion chip.
- Placed directly after Suggested Next Action, above Follow-ups.

## 3. Compact the Lead Drawer (`src/components/LeadDrawer.tsx`)

Reorder into tighter sections (header → Payment Snapshot → Tags → Suggested Next Action → Score/Attendance summary → Quick Actions → Follow-up → CRM Stage → Assigned Agent → Activity Log). Tighten vertical padding (`space-y-3` instead of `space-y-6`). Sticky footer keeps `Cancel | Save & Close`.

## 4. Fix media buyer eligibility (`src/components/SendToOperationsCrmModal.tsx`, `src/lib/eligibleAssignees.ts`)

- Broaden `operations_crm` context: include profiles where **role ILIKE 'media buyer'** OR `can_receive_operations_leads = true`, in addition to existing flag check.
- When the dropdown is empty, render a **debug panel** showing counts:
  - Active users
  - Media Buyer role users
  - Users with `operations_crm` module access
  - Users with `active_for_assignment = true`
  - Users with `can_receive_operations_leads = true`
- List "Media buyers found but not eligible" with the missing-flag reason next to each.
- CTA button **"Manage Operations Eligibility"** that navigates to `/team` (Team Directory) with `?module=operations_crm` query so the page can scroll/filter to those flags.

## 5. Operations CRM admin/team visibility (`src/pages/OperationsCrm.tsx`)

- Admin sees all leads. Add filter dropdown: **All media buyers / Assigned to me / Unassigned / <specific buyer>**.
- Non-admin team member: query already scoped, but enforce `assigned_media_buyer_id = auth.uid()` client-side as a guard in case RLS is permissive.

## 6. Manual Send to Operations from drawer + bulk bar

Already wired in bulk bar; ensure the drawer's "Send to Operations CRM" button opens the modal with a single-lead payload and that after success the button flips to "Open in Operations CRM" (re-query `operations_leads`).

## 7. Operations Handoff Rules (Master Settings)

### Migration

New table `operations_handoff_rules`:
- `id`, `source_pipeline_id` (FK pipelines), `eligible_stage_ids` (uuid[]), `mode` ('manual'|'suggest'|'auto'), `default_service_package` (text), `default_service_days` (int), `default_assignment_method` ('unassigned'|'single'|'round_robin'), `eligible_buyer_ids` (uuid[]), `duplicate_behavior` ('skip'|'update'), `is_active` (bool), `created_by`, timestamps.
- RLS: admins manage; authenticated read.

### UI (`src/pages/MasterSettings.tsx` — new "Operations Handoff Rules" section)

- List rules, create/edit/delete.
- Stage multi-select populated from live `stages` for chosen pipeline.
- Mode selector (default `suggest`).
- Save disabled until package + duration + assignment method are set when mode is `auto`; show warning "Operations handoff rule needs package, duration, and assignment settings."

### Runtime (`src/lib/operationsCrm.ts`)

- `getActiveHandoffRules()`, `getRuleForStage(stageId)` helpers.
- `evaluateHandoffOnStageChange(lead, newStageId)`:
  - **suggest**: returns suggestion payload (used by drawer chip + bulk banner).
  - **auto**: creates `operations_leads` row using rule defaults, dedupes by `crm_lead_id`/`paid_pipeline_lead_id`, notifies assigned buyer(s), logs `operations_auto_handoff_completed`.
- Hooked from `Crm.tsx` drag-drop + bulk stage move + `LeadDrawer.tsx` Change Stage.

## 8. Bulk move → Operations banner

After bulk stage move, count leads whose new stage matches an active rule. Show inline banner `"X leads are now eligible for Operations CRM"` with button → opens `SendToOperationsCrmModal` prefilled with those IDs (suggest mode) or auto-creates them (auto mode).

## 9. Duplicate prevention (`src/lib/operationsCrm.ts`)

`createOperationsLeadFromCrm` already checks `crm_lead_id`. Extend to also check `paid_pipeline_lead_id`, and (only when neither ID is provided) match by email/phone. Honor rule's `duplicate_behavior`.

## 10. Audit logs

Wire `logActivity` for: `crm_bulk_selected`, `bulk_crm_stage_changed` (already), `operations_manual_handoff_started`, `operations_lead_created_from_crm`, `operations_bulk_handoff_completed`, `operations_handoff_rule_created/updated`, `operations_auto_handoff_completed`, `operations_lead_assigned`. Include lead count, source pipeline/stage, destination stage, assignment method, buyer ids, created_by.

---

## Files to edit

- `src/pages/Crm.tsx` — bulk UI, left-aligned checkboxes, sticky pill bar, stage-change hook.
- `src/components/LeadDrawer.tsx` — restored Stage section + compact reorder + suggestion chip.
- `src/components/SendToOperationsCrmModal.tsx` — debug panel, "Manage Eligibility" CTA, broader eligibility.
- `src/lib/eligibleAssignees.ts` — broaden operations_crm context (role OR flag); add `getOperationsEligibilityDiagnostics()`.
- `src/lib/operationsCrm.ts` — handoff rule helpers + auto/suggest evaluator + duplicate hardening.
- `src/pages/OperationsCrm.tsx` — admin filter dropdown.
- `src/pages/MasterSettings.tsx` — new Operations Handoff Rules section.
- `src/components/admin/OperationsHandoffRulesPanel.tsx` *(new)* — rule editor.
- `supabase/migrations/<ts>_ops_handoff_rules.sql` — new table + RLS.

## What stays untouched

- Calling CRM data, Paid Pipeline data, existing Operations CRM leads, service lifecycle logic, notifications module, AppLayout sidebar.
- No Phase C (conversion reporting, rewards, AI insights).

## Build verification

Lovable auto-runs typecheck/build after edits; I'll address any compile errors before finishing.
