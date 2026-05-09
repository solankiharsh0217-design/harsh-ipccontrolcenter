## Goal

Add a **Direct Import** flow inside Calling CRM so leads can be imported from a CSV/sheet without first running Lead Qualifier — with full segmentation (webinar, batch name, segment label) and pipeline routing (existing or newly created).

Today the only way leads enter CRM is via Lead Qualifier → Send to CRM. Manually downloaded lists have no entry point. The Crm page also has no "Import" button.

---

## What gets built

### 1. New "Import Leads" button in CRM toolbar (`src/pages/Crm.tsx`)
Placed next to **Assign / Export**. Opens a new multi-step modal `ImportLeadsModal`.

### 2. New component: `src/components/ImportLeadsModal.tsx`
A 4-step wizard mirroring the polish of `SendToCrmModal`.

**Step 1 — Upload file**
- Drag/drop or click to upload `.csv` / `.xlsx`
- Parse with PapaParse (CSV) and SheetJS (xlsx) — SheetJS already not installed; use CSV-only first plus a "paste rows" fallback
- Show preview of first 5 rows + detected headers
- Column mapper: Name, Email, Phone, Country (auto-guess by header name; user can override)

**Step 2 — Segment & Webinar details**
- **Segment name** (free text, required) — stored on each lead as `webinar_source`. This is the batch label users will filter by.
- **Webinar** dropdown (existing webinars from `webinars` table) + "+ New" inline creator (same UX as SendToCrmModal)
- **Webinar date** (date picker)
- **Source notes** (optional textarea — saved to a new `import_notes` column or activity log)

**Step 3 — Pipeline & Lead type**
- Lead type: Unpaid / Paid (cards, same as existing modal)
- Target pipeline: dropdown of existing pipelines filtered by lead type, **plus** a "+ Create new pipeline" option
  - When chosen, inline form appears: pipeline **name**, **type** (unpaid/paid/custom), and a **Seed default stages** checkbox (reuses `DEFAULT_PIPELINE_TEMPLATES` + `ensurePipelineExists` logic already in `crmTypes.ts`)
- Default grade for imported rows: Hot / Warm / Cold / Super Hot (since no qualifier data exists, user picks one default; can be edited per lead later)
- Product name + Deal value (₹) — same fields as SendToCrmModal

**Step 4 — Assignment & Confirm**
- Assignment: Unassigned / Round-robin / Hot to top agents (reuse existing logic)
- Summary card: "X leads → [Pipeline] · Segment '[name]' · Webinar [name] [date]"
- Dedup detection: query existing `leads` by email, mark matches as Super Hot (same pattern as SendToCrmModal)
- Import button → bulk insert in chunks of 200, toast result

### 3. Reuse existing infrastructure
- `ensurePipelineExists` from `src/lib/crmTypes.ts` for new-pipeline creation
- `webinars` table + inline create flow from `SendToCrmModal`
- Lead insert payload shape from `SendToCrmModal.importNow`
- Existing dedup-by-email logic

### 4. No database changes required
All needed columns already exist on `leads`: `webinar_source`, `webinar_date`, `webinar_name`, `pipeline_id`, `stage_id`, `lead_type`, `program_name`, `deal_value`, `assigned_agent_id`, `grade`, `is_super_hot`. The "segment name" maps to `webinar_source` (which the Crm Kanban already groups/filters by as "webinar batches").

---

## Out of scope
- Editing the Lead Qualifier flow
- Changing existing pipelines or stages
- xlsx parsing (CSV only in v1; can add later if requested)

---

## Files touched

```text
NEW   src/components/ImportLeadsModal.tsx
EDIT  src/pages/Crm.tsx                 (add Import button + modal mount + reload on done)
```

No migrations. No new dependencies (PapaParse already used in `src/lib/roas/preview.ts`).