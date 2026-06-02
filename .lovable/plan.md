# Configurable Operations Intake V1 — Plan

This is a large P1 feature. I'll get your approval on scope before building, since it spans new tables, an intake inbox, importer, checklist, custom fields, communication templates, and drawer changes.

## What I will NOT touch
Calling CRM logic, Paid Pipeline calcs, finance/payments, invoices, CoC, attendance, Follow-up Board, Daily Reporting, rewards, analytics, AI insights, existing `operations_leads` shape, `operations_service_events`, `operations_handoff_rules`, existing assignment eligibility (`can_receive_operations_leads`).

## New database tables (with RLS + GRANTs)

1. `operations_process_templates` — name, description, default_owner_rule (`unassigned|single|round_robin`), default_owner_id, default_service_duration_days, is_active, created_by.
2. `operations_template_checklist_items` — template_id, label, is_required, sort_order, is_active, note.
3. `operations_template_fields` — template_id, field_key, label, field_type (`text|number|date|dropdown|checkbox|link|textarea`), options (jsonb for dropdown), is_required, sort_order.
4. `operations_communication_templates` — name, subject, body, template_type (`email|form_link|call_link|instruction`), is_active.
5. `operations_lead_checklist_state` — operations_lead_id, checklist_item_id, is_checked, checked_by, checked_at, note. Unique(lead, item).
6. `operations_lead_custom_values` — operations_lead_id, field_id, value_text/value_number/value_date/value_bool. Unique(lead, field).
7. `operations_intake_imports` — source (`csv|sheet_link|manual|crm_handoff|paid_handoff`), file_name, imported_count, skipped_count, updated_count, created_by, raw_summary jsonb.

## Existing columns added to `operations_leads`
- `process_template_id uuid` (nullable, FK)
- `intake_status text` default `intake` — values: `intake|ready|active|paused|completed`. Intake tab filters `intake_status='intake'`.
- `readiness_override_reason text`, `readiness_override_by uuid`, `readiness_override_at timestamptz`
- `brand_name text`, `program_name text` (only if missing — reuse if present)

Existing `service_status` and pause/resume/complete logic untouched. `intake_status` is additive — once Start Operations Process runs, it flips to `active` and existing service flow takes over.

## RLS model
- Admin/manager: full CRUD on all 7 new tables.
- Eligible operations team (`can_receive_operations_leads=true` or has manager role): SELECT templates/checklist/fields/comm templates; INSERT/UPDATE state + custom values for leads assigned to them.
- Plain authenticated: SELECT operations_communication_templates only when their lead references them.
- Service role: ALL.

## UI work

### OperationsCrm.tsx — tabs
Add tabs: **Intake | Active | Paused | Completed | Settings**. Existing Kanban stays under Active. Intake/Paused/Completed are filtered list views of `operations_leads` by `intake_status`/`service_status`.

### Intake tab
- Header: "Import" button (opens `OperationsImportModal`), "Add manually" button.
- Cards: client name, source badge, process template chip, readiness % bar, owner avatar, next-action label, Open button.

### OperationsImportModal (new)
Three tabs:
1. **CSV upload** — file picker, parse with PapaParse (already used elsewhere if present, otherwise add).
2. **Google Sheet link** — paste public CSV export URL, fetch via edge function `ops-fetch-sheet-csv` (to avoid CORS).
3. **Manual add** — single record form.

Column auto-detect via fuzzy header match (`name|full_name`, `email`, `phone|mobile`, `brand|business`, `product|program`, `batch|source`, `notes`). Preview table → confirm → insert. Dedup: email exact (lowercased), else phone last-10. If duplicate active ops lead exists, update only NULL fields; never overwrite. Show `imported/skipped/updated` summary and write `operations_intake_imports` row.

### Settings tab (admin-only)
- **Process Templates** list → edit drawer: name, description, default owner rule, default duration, checklist items (drag to reorder, required toggle), custom fields editor, default communication templates picker.
- **Communication Templates** list → edit modal with subject/body and variable hint chips.

Seed once on first load (idempotent): "IPC Diamond Member Operations" template with the IPC checklist + 3 sample comm templates, all marked editable. No hardcoded behavior keyed off this name.

### OperationsLeadDrawer.tsx — additions
Reorder body to:
1. Client profile (existing)
2. Process template selector (dropdown of active templates; changing it resets checklist state with confirm)
3. Readiness checklist (from template; check/uncheck writes `operations_lead_checklist_state`; shows checker + timestamp + note)
4. Custom fields (from template; renders per `field_type`; writes `operations_lead_custom_values`)
5. Quick notes (existing LeadNotesSection)
6. **Start Operations Process** button (disabled unless all required checked OR admin override w/ reason) → opens StartProcessModal
7. **Send Client Instructions** button → opens CommTemplatePickerModal (pick template, variables interpolated, copy to clipboard; if `send-email` edge function exists, also show "Send Email")
8. Service controls (existing)
9. Timeline (existing)

### StartProcessModal
Fields: template (prefilled), assigned owner (eligible list), start date, service duration (prefilled), first call date/time (optional), note, "Send welcome email" checkbox (only if template has email comm), "Create follow-up" checkbox.

On confirm: set `intake_status='active'`, set `service_status='active'`, insert `operations_service_events` row (`event_type='service_started'`), write activity log, optionally insert follow-up reminder, optionally call send-email edge function.

## Assignment
Reuse existing eligibility query. Round-robin = pick eligible user with fewest active ops leads at confirm time. No change to existing handoff rules.

## Edge functions
- `ops-fetch-sheet-csv` (new): validates URL is a docs.google.com export link, fetches CSV server-side, returns text. JWT-validated.

## Files I'll add
- `supabase/functions/ops-fetch-sheet-csv/index.ts`
- `src/lib/operationsTemplates.ts` — fetch templates, checklist, fields, comm templates.
- `src/lib/operationsIntake.ts` — CSV parse, dedup, import.
- `src/components/operations/OperationsIntakeTab.tsx`
- `src/components/operations/OperationsImportModal.tsx`
- `src/components/operations/OperationsSettingsTab.tsx`
- `src/components/operations/ProcessTemplateEditor.tsx`
- `src/components/operations/CommunicationTemplateEditor.tsx`
- `src/components/operations/StartProcessModal.tsx`
- `src/components/operations/CommTemplatePickerModal.tsx`
- `src/components/operations/ReadinessChecklist.tsx`
- `src/components/operations/CustomFieldsPanel.tsx`

## Files I'll edit
- `src/pages/OperationsCrm.tsx` — add tabs.
- `src/components/operations/OperationsLeadDrawer.tsx` — drawer reorder + new sections.
- `supabase/config.toml` — register new edge function (default verify_jwt).

## Scope confirmation
This is roughly: 1 migration (7 tables + alter), 1 edge function, ~10 new components, 2 edited components. Estimated 2–3 review cycles.

**Reply "go" to proceed, or tell me what to cut.** Suggested optional cuts if you want a smaller V1:
- Skip Google Sheet link (CSV upload + manual only)
- Skip Communication Templates (defer to V2)
- Skip Custom Fields (defer to V2)
