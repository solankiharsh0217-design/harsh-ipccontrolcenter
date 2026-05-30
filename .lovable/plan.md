# Lead Attendance Timeline + Cumulative Hotness Score

Build a per-lead attendance history with cumulative hotness scoring across sessions. Repeat Zoom rows merge; same person attending multiple webinars enriches the existing CRM lead instead of duplicating.

## Scope (do not touch)
Invoices, Code of Conduct, Payments, Paid Pipeline finance, Batch repair, Paid buyer link architecture. Follow-ups only get optional timeline visibility.

---

## Part A — Database (migration)

### Table: `lead_session_attendance`
Per-lead, per-session attendance record.

Columns:
- `id uuid pk`
- `lead_id uuid` → `public.leads(id)` ON DELETE CASCADE
- `batch_id uuid null` → `public.lead_qualifier_sessions(id)`
- `webinar_id text null`
- `webinar_name text`
- `session_name text null`
- `session_date date null`
- `session_day int null`
- `session_duration_minutes int`
- `attended_minutes_raw int default 0`
- `attended_minutes_capped int default 0`
- `attendance_percentage numeric(5,2) default 0`
- `join_count int default 1`
- `first_joined_at timestamptz null`
- `last_left_at timestamptz null`
- `attendance_grade text check in ('hot','warm','cold','absent')`
- `source text check in ('zoom','csv','google_sheet','manual')`
- `raw_identity_key text null`
- `normalized_email text null`
- `normalized_phone text null`
- `metadata_json jsonb default '{}'`
- `created_at, updated_at`

Unique index: `(lead_id, coalesce(webinar_id,''), coalesce(session_date::text,''), coalesce(session_day::text,''))` — re-import upserts.

Indexes: `lead_id`, `batch_id`, `(normalized_email)`, `(normalized_phone)`.

### Table: `lead_hotness_scores`
One row per lead (unique on lead_id).

Columns:
- `id uuid pk`
- `lead_id uuid unique` → leads
- `total_sessions_attended int default 0`
- `total_webinars_attended int default 0`
- `total_attended_minutes int default 0`
- `avg_attendance_percentage numeric(5,2) default 0`
- `highest_attendance_percentage numeric(5,2) default 0`
- `last_attended_at timestamptz null`
- `current_hotness text check in ('super_hot','hot','warm','cold','inactive') default 'inactive'`
- `score_numeric int default 0`
- `score_reason jsonb default '{}'`
- `manual_override boolean default false`
- `manual_grade text null`
- `override_reason text null`
- `overridden_by uuid null`
- `overridden_at timestamptz null`
- `updated_at`

### Function: `public.recalculate_lead_hotness(_lead_id uuid)`
SECURITY DEFINER, aggregates attendance, computes score per scoring rules in Part F, upserts `lead_hotness_scores`. Returns the new row.

### Function: `public.upsert_lead_session_attendance(...)`
SECURITY DEFINER. Accepts identity (lead_id, batch_id, webinar_id, session_date/day, duration, raw_minutes, join_count_delta, first_joined, last_left, source, email, phone, metadata). Upserts attendance via unique key — on conflict: sums raw minutes, recaps to duration, adds join_count, expands time bounds, refreshes grade. Then calls `recalculate_lead_hotness` and inserts activity_log.

### GRANT + RLS
Both tables: `GRANT SELECT, INSERT, UPDATE, DELETE … TO authenticated; GRANT ALL … TO service_role;` RLS ON. Policy: authenticated active users can SELECT/INSERT/UPDATE/DELETE (mirrors `leads`/`activity_logs` policies — read existing first).

---

## Part B — Identity matching + lead upsert

New module: `src/lib/leadAttendance.ts`

`findOrUpdateLeadByIdentity({ email, phone, name, pipeline_id_hint })` → returns `{ leadId, created, matchSource }`:
1. Normalize using `src/lib/identity.ts`.
2. Query `leads` by normalized email first, then phone (last 10), then fallback name + same pipeline hint.
3. If found:
   - Fill blank `email`/`phone` from new data (Part 13 rules).
   - If both filled but conflict → store alternate in `leads.metadata` JSON, do NOT overwrite.
   - Preserve current stage, pipeline, owner.
   - Return existing leadId.
4. If not found → create new lead in `pipeline_id_hint` (default first sales pipeline + first stage) with name/email/phone.

`recordSessionAttendance(leadId, sessionRecord)` → calls the SQL upsert function.

`processQualifierBatch(sessionId, leads[])` → loops leads, calls find-or-update + record-attendance, returns counts: `{ newLeads, updatedLeads, attendanceCreated, attendanceMerged, hotnessUpgrades:[{leadId,from,to}] }`.

---

## Part C — Send-to-CRM wiring

Update `src/components/SendToCrmModal.tsx` (and CRM batch import flow in `src/lib/crmRepair.ts` if it does inserts):
- Replace direct lead-insert path with `processQualifierBatch`.
- Show preflight summary returned by a dry-run mode of `processQualifierBatch` (skip writes; just simulate matches & projected hotness changes).
- Display: "X new · Y updated · Z attendance rows added · N merged · M hotness upgrades".

Preserve existing dedupe/owner/stage assignment for new leads only.

---

## Part D — CRM Drawer UI

`src/components/LeadDrawer.tsx` — add new collapsible section **"Session Attendance Timeline"** above follow-ups:

- Header row: hotness chip (color tokens), total sessions, total minutes, last attended, avg %.
- Timeline list (newest first): webinar/session · date · attended min (raw→capped if different) · % · joins · grade chip · source.
- Buttons: "View full attendance history" (expand all) and admin-only "Recalculate hotness" (calls `recalculate_lead_hotness` RPC).
- Manual override admin sub-panel: switch + grade select + reason; persists to `lead_hotness_scores`.

Pull data: `select * from lead_session_attendance where lead_id = ? order by session_date desc nulls last, created_at desc` and `lead_hotness_scores` single row.

---

## Part E — Kanban Card

`src/pages/Crm.tsx` lead card render: add compact line
`🔥 {grade label} · {sessions} sessions · {minutes} min` using `lead_hotness_scores` joined into the card query. Color via stage color tokens / new hotness token map.

---

## Part F — Hotness scoring (in SQL function)

Per attendance row:
- ≥80% → +40; 50–79 → +25; 20–49 → +10; 1–19 → +3; absent → 0.

Cumulative bonuses:
- +10 per extra session beyond first.
- +10 if `last_attended_at` within 7 days.
- +15 if attended ≥2 distinct `webinar_id`s.

Grade thresholds:
- ≥80 super_hot, 50–79 hot, 25–49 warm, 1–24 cold, 0 inactive.

If `manual_override = true`, store computed score in `score_reason.computed` but display `manual_grade`.

---

## Part G — Batch view

`src/pages/LeadQualifier.tsx` (or DedupPreflightPanel) — after import, display batch-level stats:
- Unique leads, existing updated, new created, repeat attendees (>1 prior session), avg attendance, top 5 hot leads, count upgraded.

Use `processQualifierBatch` return value (already aggregated).

---

## Part H — Activity logs

Inside the upsert function and hotness recalculation, insert into `activity_logs`:
- `lead_attendance_timeline_created` / `_updated`
- `lead_hotness_recalculated`, `lead_hotness_upgraded` (when grade changes upward)
- `existing_lead_updated_from_session`
- `duplicate_session_rows_merged`
- `repeat_attendee_detected`
- `lead_hotness_manual_override`

Metadata jsonb includes lead_id, batch_id, webinar_id, identity_key, old/new hotness, attended_minutes, %, join_count, performed_by.

---

## Files

**Create**
- `supabase/migrations/<ts>_lead_attendance_hotness.sql` — tables, indexes, GRANTs, RLS, `recalculate_lead_hotness`, `upsert_lead_session_attendance`.
- `src/lib/leadAttendance.ts` — identity match, upsert helpers, batch processor, dry-run preflight.
- `src/components/crm/SessionAttendanceTimeline.tsx` — drawer section UI.
- `src/components/crm/HotnessChip.tsx` — shared chip.

**Edit**
- `src/components/LeadDrawer.tsx` — mount timeline section + manual override panel.
- `src/components/SendToCrmModal.tsx` — wire to batch processor + preflight numbers.
- `src/lib/crmRepair.ts` — route imports through batch processor (only the create paths).
- `src/pages/Crm.tsx` — include hotness in card query + render chip line.
- `src/pages/LeadQualifier.tsx` — post-send batch stats panel.
- `src/integrations/supabase/types.ts` — regenerated automatically by migration; not hand-edited.

## QA
Run through the 18-item checklist (re-import same Zoom CSV → merge; same person new webinar → new row + upgrade; existing lead not duplicated; cap by duration; Kanban chip; drawer timeline; preflight numbers; conflict handling; manual override; audit logs; build passes).