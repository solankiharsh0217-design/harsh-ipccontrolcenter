# Safe Archive & Delete System

A non-destructive cleanup workflow for Calling CRM and Paid Pipeline. Soft archive is the default; permanent delete is admin-only and blocked when linked payment/operations/conversion data exists.

## 1. Schema (additive migration)

Add nullable columns — no data loss, no destructive changes.

**`crm_leads`** (and **`paid_pipeline_leads`** for Part 7):
- `archived_at timestamptz`
- `archived_by uuid`
- `archive_reason text`
- `deleted_at timestamptz`
- `deleted_by uuid`
- `delete_reason text`

**New table `crm_batch_archives`** (batches are derived from `webinar_source` + `pipeline_id`, no separate batch table exists):
- `pipeline_id`, `batch_name`, `archived_at`, `archived_by`, `archive_reason`, `affected_lead_count`

RLS: admins full access; managers/sales executives bounded by existing module access patterns. Restore = clear the archive columns.

## 2. Calling CRM — Batches view

Replace the lone edit pencil on each batch card with a `⋯` menu:
- View leads
- Rename batch (existing)
- Archive batch (amber)
- Permanent delete (admin only, red, hidden if unsafe)

**Archive batch**: confirm modal showing affected lead count, mixed-link summary (X total / Y linked to Paid Pipeline / Z linked to Operations CRM), optional reason. Soft-archives all active leads in batch + writes a `crm_batch_archives` row. Audit log `crm_batch_archived`.

**Permanent delete batch**: only enabled when no leads in batch have `paid_pipeline_lead_id`, no linked operations records, no conversions/rewards. Otherwise shows "Archive instead" notice. Requires typing `DELETE`.

Add `Show archived batches` toggle in the Batches view header; archived batch cards render muted with `Restore batch` button.

## 3. Calling CRM — Kanban bulk bar

Add `Archive Selected` action between Assign and Clear. Confirm modal with count + optional reason. Bulk soft-archive + audit `crm_leads_bulk_archived`. Permanent delete intentionally not exposed here.

## 4. Individual lead actions

In `LeadDrawer` and the lead card `⋯` menu:
- Archive lead (amber)
- Restore lead (visible only when viewing archived)
- Permanent delete (admin only, blocked when linked to Paid Pipeline / Operations / payments)

Confirmation copy adapts when the lead has `paid_pipeline_lead_id` or operations link — explicitly states the linked record is preserved.

## 5. Show archived / restore

Add `Show archived` toggle in the CRM filter row. Default off. When on:
- Archived leads appear muted, no drag/drop, show archived date + reason
- Restore button per lead and per batch
- Restore writes `crm_lead_restored` / `crm_batch_restored`

## 6. Paid Pipeline safety

`src/pages/PaidPipeline.tsx` `RowActionsMenu` gains `Archive Buyer` action (amber). Soft-archive only — payments, finance history, activity preserved. Add `Show archived` filter. Permanent delete blocked whenever payment rows exist; shows the "Archive instead" message. Audit `paid_pipeline_buyer_archived` / `_restored`.

## 7. Import duplicate handling

`ImportLeadsModal` duplicate check: queries active leads first. If email/phone matches only archived leads, prompts per-row: Restore existing | Import as new | Skip. Fresh imports work after archiving wrong batches.

## 8. Permissions

- **Admin**: archive, restore, permanent delete (with safety checks)
- **Manager**: archive/restore if has CRM module
- **Sales exec**: archive own leads only (existing assignment logic)
- **Media buyer**: no archive/delete UI

Unauthorized actions are hidden, not disabled.

## 9. Audit logs

All actions go through `logActivity()` with module `calling_crm` / `paid_pipeline`:
`crm_lead_archived`, `crm_lead_restored`, `crm_leads_bulk_archived`, `crm_batch_archived`, `crm_batch_restored`, `crm_lead_permanently_deleted`, `crm_batch_permanently_deleted`, `paid_pipeline_buyer_archived`, `paid_pipeline_buyer_restored`. Metadata includes lead/batch ids, counts, reason, linked counts.

## 10. UI rules

- Archive = amber confirm dialog with plain copy
- Permanent delete = red dialog requiring typed `DELETE`
- All active CRM list/kanban/batches queries exclude `archived_at IS NOT NULL` by default

## Technical sections

**Files to add**:
- `supabase/migrations/<ts>_crm_archive_system.sql`
- `src/lib/crmArchive.ts` — archive/restore/permanent-delete helpers + safety checks
- `src/components/crm/ArchiveConfirmModal.tsx` + `PermanentDeleteModal.tsx`

**Files to edit**:
- `src/pages/Crm.tsx` — batch card menu, `Show archived` toggle, exclude archived by default, bulk bar action
- `src/components/LeadDrawer.tsx` — individual archive/restore/delete
- `src/components/ImportLeadsModal.tsx` — archived-duplicate prompt
- `src/pages/PaidPipeline.tsx` — `RowActionsMenu` archive entry + show-archived filter
- `src/lib/auditLog.ts` — register new action labels (optional, generic insert already works)

**Out of scope**: schema changes to Operations CRM, payments, conversions, reports. None of those are touched.
