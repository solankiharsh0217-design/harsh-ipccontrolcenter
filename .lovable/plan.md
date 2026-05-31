# Universal Lead Visibility + Cross-Pipeline Movement + Paid Onboarding Sync

Scope strictly limited to: universal search, drawer linked-records UX, cross-pipeline move/copy/link, paid pipeline ↔ paid onboarding invariant, paid onboarding Kanban visibility. **Untouched:** invoices, daily reporting, qualifier, CoC signed PDFs, payments, financial amounts, import logic, report data.

## 1. Universal search — show ALL linked records (Parts 1, 2, 10, 11)

`src/lib/universalSearch.ts` — keep current direct text matching, then add a **link-expansion pass**:

1. After the initial parallel search returns rows from `leads`, `paid_pipeline_leads`, `operations_leads`, collect all linked IDs found in any result:
   - `paid_pipeline_leads.crm_lead_id`, `paid_pipeline_leads.source_unpaid_lead_id`
   - `leads.paid_pipeline_lead_id`, `leads.converted_to_crm_lead_id`, `leads.converted_to_paid_pipeline_lead_id`
   - `operations_leads.crm_lead_id`, `operations_leads.paid_pipeline_lead_id`
2. Run a second batched fetch by id (3 parallel `in("id", …)` queries) for any linked records not already in the result set.
3. Merge in (dedup by id) and re-classify Sales vs Paid Onboarding using `pipeline_id` resolved to the Paid — Onboarding pipeline name (not just `lead_type`).
4. Build a **`linkBundles`** map keyed by a stable identity key (last-10 phone or normalized email or paid_pipeline_lead_id) so each `UniversalSearchResult` knows the IDs of its sibling source/paid-onboarding/paid-buyer/operations records.
5. Surface **missing-record warnings** on each result: e.g. paid-pipeline result with no paid-onboarding sibling → `missing: "paid_onboarding_crm"` with a "Repair CRM Link" action; converted source with no paid-onboarding sibling → `missing: "paid_onboarding_from_source"` with a "Create Paid Onboarding CRM" action.
6. Admin debug payload extended with `linkExpansion: { extraFetched, bundles }`.

`UniversalSearchPanel.tsx` — render missing-record chips inline on the relevant card, plus quick actions: **Open Source Lead**, **Open Paid Onboarding**, **Open Paid Buyer**, **Jump to Card**. Per-card actions already exist; this PR fills in the cross-links using `linkBundles`.

Audit: log `universal_search_linked_records_expanded` once per query (counts only, no PII).

## 2. Paid Pipeline ↔ Paid Onboarding invariant + Kanban repair (Parts 3, 4, 8, 9)

`src/lib/paidCrmMirror.ts` already implements the invariant (`crm_lead_id` must point at a lead in the Paid — Onboarding pipeline, not the source unpaid lead). Two follow-ups:

1. **New helper** `auditPaidPipelineVisibility(paidPipelineLeadId)` → returns
   ```
   {
     paidPipelineLeadId, crmLeadId, sourceUnpaidLeadId,
     linkedPipelineId, linkedPipelineName, linkedStageId, linkedStageName,
     isArchived, isDeleted, hiddenFromSales, ownerId,
     status: "included" | "wrong_pipeline" | "archived" | "soft_deleted"
           | "points_to_source_unpaid" | "missing_link" | "lead_not_found",
     reason: string,
     repairable: boolean
   }
   ```
   Reuses `ensurePaidPipelineCrmLead` for repair. **No filter logic here** — Kanban-filter exclusion is reported by the panel that knows the active filter set (see point 3 below).
2. **Paid Pipeline drawer** (file: locate inside `src/pages/PaidPipeline.tsx` or `src/components/paid-pipeline/*`) — admin-only "Visibility Debug" disclosure beside "Linked Calling CRM Stage" calling the audit helper and rendering each field plus a "Repair link" button when `repairable && status !== "included"`. Stage chip already shown; only add the disclosure + repair CTA.
3. **Paid Onboarding Kanban query** (file inside `src/pages/Crm.tsx` paid-onboarding view): remove any `hide_from_sales_workload` filter for the Paid — Onboarding pipeline (it only applies to Sales). Confirm filter is: `pipeline_id = paidOnboarding && archived_at IS NULL && deleted_at IS NULL`. RLS already gates per role. Add a one-liner audit log when this filter drops a card that was specifically referenced by `focusLead` or repair (`paid_onboarding_card_filtered_out`).

Audit (admin-triggered only): `paid_pipeline_crm_stage_mismatch_detected`, `paid_pipeline_crm_stage_mismatch_repaired`, `paid_onboarding_visibility_repaired`, `paid_onboarding_card_created_from_source`.

## 3. Drawer "Linked Records" panel + simplified header (Parts 5, 12)

`src/components/LeadDrawer.tsx`:

- New component `src/components/crm/LinkedRecordsPanel.tsx` rendered directly under name/phone/email + status chips, **above** the existing payment / tags / stage / CoC / follow-up sections (no removal — keep everything in the existing order, just collapse the noisy top buttons into a single "Primary actions" row).
- Resolves siblings using the same identity-bundle logic as universal search (extracted into a shared `src/lib/leadLinks.ts`):
  - **Source Sales Lead** card if `lead_type=unpaid` for this lead OR if `paid_pipeline_leads.source_unpaid_lead_id` points here from a sibling.
  - **Paid Onboarding Lead** card if a `leads` row exists in Paid — Onboarding pipeline for the same identity / via `paid_pipeline_leads.crm_lead_id`.
  - **Paid Pipeline Buyer** card via `leads.paid_pipeline_lead_id` or reverse lookup.
  - Each card: pipeline + stage + status chip + Open + Jump button.
- Missing-record states render a single "Create / Repair Paid Onboarding CRM Link" button that calls `ensurePaidPipelineCrmLead` (admin / authorized roles only).
- Top buttons consolidated into one row: `Linked Records ▼` (anchors panel), `Move / Copy to Pipeline`, `Add Payment`, `Send to Operations`. Existing edit / archive / convert buttons move into an overflow `⋯` menu — no behavior change.

## 4. Cross-pipeline Move / Copy / Link modal (Parts 6, 7, 11)

`src/components/crm/MoveCopyLinkPipelineModal.tsx` — 5-step wizard:

1. **Intent**: Move / Copy / Link to existing.
2. **Destination**: pipeline + stage select (uses existing `pipelines` + `stages` data; same picker logic as `CrmStagePicker`).
3. **Existing-link scan**: runs `runUniversalSearch({ scope: "all" })` for this lead's identity; renders each existing sibling so the user can choose **Link existing** instead of duplicating. Defaults to Link when any match found.
4. **Behavior preview** based on intent:
   - Move → `update leads set pipeline_id, stage_id`; preserve payments / CoC / follow-ups (these are FK-linked, no copy needed); update activity log.
   - Copy → insert new lead row in destination pipeline; set `linked_source_lead_id` on the new row pointing back to original; **no** copy of payments / invoices / CoC.
   - Link → no insert, write linkage column(s): `paid_pipeline_lead_id` / `converted_to_crm_lead_id` / `converted_to_paid_pipeline_lead_id` as applicable; never overwrites an existing non-null link without admin confirm.
5. **Review** sentence summarizing the action.

**Send to Paid Onboarding** quick-action on unpaid-source drawers calls the same modal pre-filled with destination = Paid — Onboarding, intent = Link if a paid-onboarding sibling exists, else Copy (with the source-lead choice: keep as history / move / copy).

Duplicate guard: before creating any new lead, identity check by email + phone + linked IDs. If a match exists, modal forces the Link path unless an admin explicitly toggles "Create anyway".

Audit: `crm_cross_pipeline_move_started`, `crm_cross_pipeline_move_completed`, `crm_cross_pipeline_copy_created`, `crm_records_linked` with full metadata (source_lead_id, destination_lead_id, paid_pipeline_lead_id, old/new pipeline+stage, action_type, performed_by).

## 5. Files

- **New**
  - `src/lib/leadLinks.ts` — shared identity-bundle resolver (used by universal search, drawer, modal).
  - `src/lib/paidPipelineVisibility.ts` — `auditPaidPipelineVisibility` helper.
  - `src/components/crm/LinkedRecordsPanel.tsx`
  - `src/components/crm/MoveCopyLinkPipelineModal.tsx`
- **Edited**
  - `src/lib/universalSearch.ts` (link-expansion pass + missing-record warnings)
  - `src/components/crm/UniversalSearchPanel.tsx` (render warnings + sibling actions)
  - `src/components/LeadDrawer.tsx` (consolidate header, mount LinkedRecordsPanel + modal)
  - `src/pages/PaidPipeline.tsx` (or the paid drawer component) — admin Visibility Debug disclosure
  - `src/pages/Crm.tsx` — Paid Onboarding Kanban query: drop `hide_from_sales_workload` filter for that pipeline; mount Move/Copy modal from drawer event.

No DB migrations required. No changes to RLS, invoices, payments, CoC, follow-ups, or report data. Hard-delete prohibited throughout.

## 6. QA — Dayanand scenario

Verify with `vu3ge@gmail.com` / `8652436666`:

1. Universal search returns 3 cards: Sales/Conversion Successful, Paid Onboarding/Give Access, Paid Pipeline/Payment Confirmed.
2. Paid Pipeline drawer admin debug shows `status: "included"` after repair runs (or specific reason if not).
3. Paid Onboarding Kanban → Give Access column contains the card; Jump-to-Card focuses + pulses.
4. Source unpaid drawer shows Linked Records with all 3 siblings + working Open/Jump buttons.
5. Move/Copy modal blocks duplicate creation when an identity match exists.
6. Build passes; no hook-order errors; no blank screen.
