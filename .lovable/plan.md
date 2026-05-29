# Lead Qualifier Dedup + Batch Cleanup — Implementation Plan

This is a large, cross-cutting change. I'll deliver it in 4 phased PRs so we can verify each phase before moving on, rather than a single massive change that risks breaking the CRM, Paid Pipeline, CoC, invoices, or follow-ups (all explicitly off-limits).

I want your sign-off on this plan and the phasing before I start writing code.

## Out of scope (will not touch)
Invoices, Code of Conduct, payments, follow-ups (preserved only), Team Directory schema, Operations CRM, existing CRM stage rules, Paid Pipeline finance.

---

## Phase 1 — Identity normalization + Lead Qualifier dedup (Parts 1–8, 20, 21)

**Goal:** Stop raw attendee rows from becoming leads. Show a preflight with real counts before Send to CRM.

1. New shared module `src/lib/identity.ts`
   - `normalizeEmail`, `normalizePhone` (last 10 digits), `normalizeName`, `identityKey`, `isWeakIdentity`, `flagSuspiciousEmailDomain` (warn-only).
2. Refactor `src/lib/qualifier.ts` to use these helpers everywhere.
3. New `src/lib/qualifier/aggregate.ts`
   - Aggregates attendee rows by `identityKey`: `total_join_rows`, `session_count`, `first_join`, `last_leave`, `total_raw_minutes`, `capped_minutes` (per-day cap = configured session duration), `attended_days`, multi-day support.
   - Registration dedup using "best row" rule (email+phone > email > phone > most complete > latest).
   - True absentees = registered − attended identities. Unmatched attendees listed separately, default ignored.
4. New `src/components/qualifier/PreflightDialog.tsx`
   - Shown before "Send to CRM" in `LeadQualifier.tsx`.
   - Sections: Registration (raw/unique/dups), Attendance (raw/unique/merged + top duplicates), Qualification (hot/warm/cold/absent/unmatched/final), CRM matches (by email/phone), Conflicts.
   - Collapsible "Duplicate Breakdown" table.
5. `Send to CRM` only sends unique qualified identities; uses existing duplicate policy (`skip` default, never `move`).
6. Performance: aggregation runs in a Web Worker (`src/workers/qualifierDedup.worker.ts`) with progress events for 400–1,200 row sheets.

**QA targets from your message:** 402 registration rows clean; 1,249 attendee rows → ~419 unique; final CRM count = deduped count.

---

## Phase 2 — Database protection + audit logging (Parts 9, 18)

Single migration:
- `webinar_imports` (id, webinar_id, source_type, raw/unique/duplicate/final counts, created_by, metadata).
- `webinar_import_people` (import_id, identity_key, normalized_email/phone, name, raw_row_count, total_raw_minutes, capped_minutes, grade, metadata) with `UNIQUE (import_id, identity_key)`.
- Reuse existing `activity_logs` table for new event types listed in Part 18 (no schema change there).
- GRANTs + RLS: admin full, authenticated read-own-import.

---

## Phase 3 — Existing batch repair + safe delete/archive (Parts 10–12, 16, 19)

1. New `src/lib/crmBatchRepair.ts`
   - `dryRunRepair(batchId)` → groups by normalized email/phone, picks "best record" (paid link > invoice/CoC/follow-up > assigned owner > latest activity > most complete), returns plan.
   - `applyRepair(batchId, plan)` → merges safe data, archives losers (hard-delete only if zero linked history: no paid pipeline, payment, invoice, CoC, follow-up, activity log).
2. `BatchRepairModal.tsx` — three-dot menu entry "Deduplicate / Repair Batch" on Calling CRM batches. Shows dry-run table, requires confirmation, shows result report + CSV download.
3. Batch archive/delete/restore actions:
   - Archive Batch: sets flag, hides from sales-exec views (RLS already respects `assigned_agent_id`; we add `archived_at` filter to batch queries).
   - Delete Batch: typed `DELETE BATCH` confirmation, blocked if protected links exist → prompts archive.
4. Recompute batch counts after every cleanup op.

---

## Phase 4 — De-assign controls + team-member cleanup (Parts 13–15, 17)

1. Bulk "De-assign" in Calling CRM selection bar (sets `assigned_agent_id = null`, syncs paid pipeline owner via existing trigger `sync_crm_owner_to_paid_pipeline`).
2. Batch action: "De-assign entire batch" / "De-assign all from member in batch".
3. Team Directory member drawer: new "Assigned CRM Leads" section with pipeline/batch/stage/grade/source filters and de-assign / reassign-all actions.
4. "Remove from assigned user" single-lead action (de-assigns, preserves CRM data).

---

## Technical details

- **Files created:** `src/lib/identity.ts`, `src/lib/qualifier/aggregate.ts`, `src/lib/crmBatchRepair.ts`, `src/components/qualifier/PreflightDialog.tsx`, `src/components/qualifier/DuplicateBreakdownTable.tsx`, `src/components/crm/BatchRepairModal.tsx`, `src/components/crm/BatchArchiveModal.tsx`, `src/components/team/AssignedLeadsManager.tsx`, `src/workers/qualifierDedup.worker.ts`.
- **Files edited:** `src/pages/LeadQualifier.tsx`, `src/lib/qualifier.ts`, `src/pages/Crm.tsx`, `src/components/AssignModal.tsx`, `src/components/crm/MoveBatchModal.tsx`, `src/pages/Team.tsx`.
- **Migrations:** one for `webinar_imports` / `webinar_import_people` + GRANTs + RLS + audit event-type whitelist update; one for `paid_pipeline_batches.archived_at` if missing (check first).
- **No edits to:** `src/integrations/supabase/*`, invoice/CoC/payment modules, Operations CRM, finance triggers.

## Risks
- Web Worker bundling with Vite — will verify with a smoke test.
- "Best record" merge logic is the most error-prone step; Phase 3 ships with a mandatory dry-run + CSV diff, no auto-apply.
- Hard delete is gated; default everywhere is archive.

---

## Two questions before I start

1. **Phasing OK?** Can I ship Phase 1 (the actual root cause — dedup before CRM) first today, then 2/3/4 in follow-ups? Or do you want everything in one shot?
2. **For the existing 681-lead batch:** want me to run the dry-run repair as part of Phase 3 and share the report before applying, or auto-apply with archive (no hard delete) since it's clearly a duplicate-heavy import?