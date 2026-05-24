# Calling CRM ↔ Paid Pipeline Refinement Plan

This is a large refinement spanning ~26 acceptance criteria. To keep it safe (no data loss, no rebuilds), I'll deliver it in **5 phases**. You approve this plan, then I ship Phase 1 and we review before continuing.

---

## Phase 1 — Data plumbing & auto-sync (foundation)

**Schema (safe, additive only):**
- `ALTER TABLE leads ADD COLUMN IF NOT EXISTS paid_pipeline_lead_id uuid`
- `ALTER TABLE paid_pipeline_leads ADD COLUMN IF NOT EXISTS crm_lead_id uuid`
- New `tags` table (id, name, color, module_scope, created_by, is_deleted)
- New `lead_tag_assignments` (tag_id, crm_lead_id nullable, paid_pipeline_lead_id nullable, assigned_by)
- New `quick_save_entries` scope `follow_up_type` (or extend existing quick-save table — I'll check first)
- Add `active_for_assignment`, `can_receive_paid_pipeline_leads`, `include_in_round_robin` to `profiles` **only if missing** (eligibleAssignees.ts already references them).

**Auto-sync logic (in `ImportLeadsModal.tsx`):**
- After paid leads insert/update into Paid — Onboarding pipeline, for each row: upsert into `paid_pipeline_leads` matched by `crm_lead_id → email → phone`. Never duplicate.
- Write `crm_lead_id ↔ paid_pipeline_lead_id` link both ways.
- Audit log: `paid_pipeline_record_created_from_crm`, `crm_lead_linked_to_paid_pipeline`.

---

## Phase 2 — Paid Pipeline UI (batches-first + table + payments)

- `PaidPipeline.tsx`: tabs become **Paid Batches (default)** + **All Paid Leads**. Remove the confusing Leads vs Batches duplication.
- Table columns per Part 16 spec (Buyer, Phone, Batch, CRM Stage, Deal, Token, Collected, Balance, Payment Stage, Finance, Priority, Tags, Next Follow-up, Owner, Actions).
- Summary cards (Part 17) recompute on filter change.
- Row-level quick actions: Add Token / Second Token / Finance / Balance / Full Payment / Finance Approved / Disbursed / Dropped — open existing `QuickAddPaymentModal` pre-filled.
- Payment math already correct in `paidPipeline.ts#recomputePaidLead` — verify token never inflates `deal_value`.

---

## Phase 3 — Tags + Fast Follow-up + Quick-save types

- New `<TagPicker>` component (multi-select, quick-create, color chip). Used in Calling CRM card+drawer and Paid Pipeline table+drawer.
- New `<FastFollowUpComposer>` (single combined date-time `<input type="datetime-local">` + type dropdown + note + Today/Tomorrow/3d/Next week chips + Save). Wires to existing follow-up tables; links both `crm_lead_id` and `paid_pipeline_lead_id` when present.
- Follow-up Type dropdown reads from `quick_save_entries` scope `follow_up_type` with "+ Save new" inline.
- Filter-by-tag on both modules.

---

## Phase 4 — Cross-navigation + Assignment modal fix

- **Cross-nav buttons** in both drawers + page headers ("Open in Paid Pipeline" / "Open in Calling CRM"). Routes carry `?leadId=...`.
- **WhatsApp button** normalized phone helper shared between drawers; disabled when phone missing.
- **Assignment modal rebuild (4 steps):**
  1. Pick **Role** (loaded distinct from `profiles.role` of active users — no hardcoded list)
  2. Pick **Users** under role, filtered by eligibility flag for the module (`can_receive_calling_crm_leads` or `can_receive_paid_pipeline_leads`); admins only if flagged
  3. Pick **method** (round-robin / one-agent / manual / least-active / least-follow-ups)
  4. Pick **scope** (unassigned / all in view / selected / current batch)
- Helper `getAssignableUsers({ module, role?, eligibilityFlag? })` added to `eligibleAssignees.ts`.
- Empty-state message references Team Directory eligibility flag exactly.

---

## Phase 5 — Master Settings + Stage sync + Notifications/Audit polish

- Master Settings sections: Payment Types, Modes, Finance Partners, Finance Statuses, Paid Pipeline Stages, CRM Paid Onboarding Stages, Lead Tags, Follow-up Types, Lead Priority, Balance Categories — all customizable, defaults seeded.
- Soft stage-sync suggestions (CRM ↔ Paid Pipeline) — non-forced; toast with "Apply suggestion" button.
- Notifications via existing `createNotification` for the events in Part 24, with dedup window.
- Audit logs for all events in Part 23.

---

## Guardrails (every phase)
- Additive migrations only (`IF NOT EXISTS`), no drops, no resets, no constraint removal.
- Soft delete pattern (`is_deleted` columns) — no hard deletes.
- Match-don't-duplicate on `crm_lead_id → email → phone`.
- No global CSS / font / sidebar / topbar changes.

---

## Technical notes
- DB writes batched; chunked inserts with per-row fallback (pattern already in `ImportLeadsModal`).
- New components colocated under `src/components/paid-pipeline/` and `src/components/crm/`.
- All new shared helpers (phone normalize, getAssignableUsers, tag CRUD) under `src/lib/`.
- RLS: tags + assignments scoped via existing `is_active(auth.uid())` pattern.

---

## What I need from you
1. **Approve this plan** → I start Phase 1 (DB migration + auto-sync). You'll get a migration approval prompt.
2. After each phase ships, you test and we move to the next.

Reply "go" (or pick a different starting phase) and I'll execute.