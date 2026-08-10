// Team Performance OS — Demo Data seeder & reset (admin-only).
// Creates/tears down a self-contained demo dataset that is safe to run in
// production. All demo records are identified either by the "@ipc-demo.local"
// email suffix (users) or by the "[DEMO] " name prefix (KPI defs/templates),
// so reset never touches real users, real KPIs, or real attendance/rewards.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEMO_DOMAIN = "@ipc-demo.local";
const DEMO_PREFIX = "[DEMO] ";
const DEMO_PASSWORD = "DemoPass!2026";

type StatusCode = "approved" | "submitted" | "missed" | "rejected";

interface DemoUserSpec {
  key: string;
  full_name: string;
  email: string;
  role: string;
  department: string;
  modules: string[];
  daily_pattern: StatusCode[];      // 7 statuses (one per weekday, oldest → newest)
  active_minutes_range: [number, number];
  scorecard: { score: number; label: string };
  reward?: { badge: string; points: number; status: "approved" | "pending_approval"; period: "weekly" | "monthly" };
  rejected_note?: string;
}

// Common modules every demo user gets.
const BASE_MODULES = ["team_performance", "notifications", "tasks"];

const DEMO_USERS: DemoUserSpec[] = [
  {
    key: "aarav",
    full_name: "Aarav Mehta",
    email: `aarav.media${DEMO_DOMAIN}`,
    role: "Media Buyer",
    department: "Marketing",
    modules: [...BASE_MODULES, "roas", "daily-reporting"],
    daily_pattern: ["approved","approved","missed","approved","approved","submitted","approved"],
    active_minutes_range: [330, 390],
    scorecard: { score: 85, label: "Consistent — 1 missed KPI" },
    reward: { badge: "Weekly Consistency Performer", points: 25, status: "pending_approval", period: "weekly" },
  },
  {
    key: "sana",
    full_name: "Sana Khan",
    email: `sana.sales${DEMO_DOMAIN}`,
    role: "Sales Executive",
    department: "Sales",
    modules: [...BASE_MODULES, "calling_crm", "follow_up_command_center"],
    daily_pattern: ["approved","submitted","rejected","approved","approved","submitted","approved"],
    active_minutes_range: [300, 370],
    scorecard: { score: 76, label: "Needs CRM note quality improvement" },
    rejected_note: "CRM notes were incomplete. Please update call remarks properly.",
  },
  {
    key: "rohan",
    full_name: "Rohan Verma",
    email: `rohan.video${DEMO_DOMAIN}`,
    role: "Video Editor",
    department: "Content",
    modules: [...BASE_MODULES],
    daily_pattern: ["approved","approved","approved","approved","approved","approved","approved"],
    active_minutes_range: [360, 420],
    scorecard: { score: 92, label: "Gold Performer" },
    reward: { badge: "Monthly Gold Performer", points: 100, status: "approved", period: "monthly" },
  },
  {
    key: "nisha",
    full_name: "Nisha Sharma",
    email: `nisha.ops${DEMO_DOMAIN}`,
    role: "Backend Operations",
    department: "Operations",
    modules: [...BASE_MODULES, "operations_crm"],
    daily_pattern: ["approved","approved","approved","submitted","approved","approved","approved"],
    active_minutes_range: [340, 390],
    scorecard: { score: 88, label: "Strong operations discipline" },
    reward: { badge: "Weekly Consistency Performer", points: 25, status: "approved", period: "weekly" },
  },
  {
    key: "kabir",
    full_name: "Kabir Malhotra",
    email: `kabir.finance${DEMO_DOMAIN}`,
    role: "Finance",
    department: "Finance",
    modules: [...BASE_MODULES],
    daily_pattern: ["approved","missed","submitted","approved","approved","submitted","missed"],
    active_minutes_range: [280, 340],
    scorecard: { score: 70, label: "Needs payment verification follow-up" },
  },
];

// KPI list per role (5 KPIs each, all daily manual_proof).
const KPI_LIBRARY: Record<string, string[]> = {
  "Media Buyer": [
    "Submit Daily Ad Report",
    "Check CPL and Lead Count",
    "Review Campaign Performance",
    "Upload Winning/Losing Ad Notes",
    "Submit Daily 3 Creative Feedbacks",
  ],
  "Sales Executive": [
    "Complete 40 Follow-up Calls",
    "Update CRM Notes",
    "Move Hot Leads to Next Stage",
    "Payment Follow-up Completed",
    "Submit Daily Sales Summary",
  ],
  "Video Editor": [
    "Submit Daily 3 Videos (60s to 90s)",
    "Complete Assigned Edits",
    "Upload Video Proof Links",
    "Check Revision Requests",
    "Submit Daily Editing Report",
  ],
  "Backend Operations": [
    "Review Pending Access Cases",
    "Check Code of Conduct Status",
    "Update Bonus Access Delivery",
    "Clear Overdue Operations Items",
    "Submit Daily Ops Summary",
  ],
  "Finance": [
    "Update Payment Status",
    "Review Pending Invoice List",
    "Check EMI/Finance Pending Cases",
    "Submit Collection Summary",
    "Verify Payment Proofs",
  ],
};

const PROOF_URLS = [
  "https://drive.google.com/demo-video-proof",
  "https://docs.google.com/demo-report",
  "https://docs.google.com/demo-crm-notes",
];

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
// Return last N workdays (skip Sundays), oldest → newest, ending yesterday.
function lastWorkdays(n: number, endOffsetDays = 1): string[] {
  const out: string[] = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  let cursor = new Date(today.getTime() - endOffsetDays * 86400000);
  while (out.length < n) {
    if (cursor.getUTCDay() !== 0) out.unshift(fmtDate(cursor));
    cursor = new Date(cursor.getTime() - 86400000);
  }
  return out;
}

function makeTimestamp(dateStr: string, hour: number, minute = 0): string {
  return new Date(`${dateStr}T${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}:00Z`).toISOString();
}

function reply(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
function fail(code: string, message: string, details?: string) {
  return reply({ ok: false, error: message, error_code: code, message, details });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth) return fail("UNAUTHORIZED", "Sign-in required.");

    const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: userRes } = await userClient.auth.getUser();
    const caller = userRes?.user;
    if (!caller) return fail("UNAUTHORIZED", "Sign-in required.");

    const admin = createClient(url, service);
    const { data: isAdmin, error: roleErr } = await admin.rpc("has_role", { _user_id: caller.id, _role: "admin" });
    if (roleErr) return fail("ROLE_CHECK_FAILED", "Could not verify admin role.", roleErr.message);
    if (!isAdmin) return fail("FORBIDDEN", "Only admins can run demo tools.");

    let body: any = {};
    try { body = await req.json(); } catch { /* GET-style */ }
    const action = String(body?.action ?? "").trim();

    if (action === "seed") return await seed(admin, caller.id);
    if (action === "reset") return await reset(admin, caller.id);
    return fail("BAD_ACTION", "Unknown action. Use 'seed' or 'reset'.");
  } catch (e: any) {
    return fail("UNEXPECTED", "Unexpected server error.", String(e?.message ?? e));
  }
});

// ─────────────────────────── SEED ───────────────────────────
async function seed(admin: any, actorId: string) {
  const startTs = new Date().toISOString();
  await log(admin, actorId, "team_performance_demo_seed_started", { at: startTs });

  const counts = {
    users_created: 0,
    users_reused: 0,
    kpi_definitions: 0,
    templates: 0,
    assignments: 0,
    entries: 0,
    submissions: 0,
    attendance: 0,
    rewards: 0,
    modules_granted: 0,
    errors: [] as string[],
  };

  try {
    // 1) Users → auth + profile + modules
    const userIds: Record<string, string> = {};
    for (const u of DEMO_USERS) {
      const { data: cRes, error: cErr } = await admin.auth.admin.createUser({
        email: u.email,
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: u.full_name, role: u.role, department: u.department, demo: true },
      });
      let uid: string;
      if (cErr) {
        if (!/registered|exists|duplicate/i.test(cErr.message || "")) throw cErr;
        // Fetch existing by email
        const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
        const existing = list?.users?.find((x: any) => (x.email || "").toLowerCase() === u.email.toLowerCase());
        if (!existing) throw new Error(`Could not locate reused user ${u.email}`);
        uid = existing.id;
        counts.users_reused += 1;
      } else {
        uid = cRes.user!.id;
        counts.users_created += 1;
      }
      userIds[u.key] = uid;

      await admin.from("profiles").upsert({
        id: uid, full_name: u.full_name, email: u.email, role: u.role,
        department: u.department, status: "active",
      }, { onConflict: "id" });

      // Ensure role catalog entry
      const role_key = u.role.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
      await admin.from("company_role_catalog")
        .upsert({ role_key, role_label: u.role, is_active: true }, { onConflict: "role_key", ignoreDuplicates: true });

      // Modules
      await admin.from("user_module_access").delete().eq("user_id", uid);
      const rows = u.modules.map((k) => ({ user_id: uid, module_key: k, granted_by: actorId }));
      if (rows.length) {
        const { error } = await admin.from("user_module_access").insert(rows);
        if (error) counts.errors.push(`modules ${u.email}: ${error.message}`);
        else counts.modules_granted += rows.length;
      }
    }

    // 2) KPI definitions + templates per role
    const templateByRole: Record<string, string> = {};
    const kpiByRole: Record<string, string[]> = {};
    for (const role of Object.keys(KPI_LIBRARY)) {
      // Template
      const tplName = `${DEMO_PREFIX}${role} KPI Template`;
      const { data: tRow } = await admin.from("kpi_templates")
        .upsert({ name: tplName, role_label: role, department: DEMO_USERS.find(x => x.role === role)?.department ?? null, is_active: true }, { onConflict: "name" })
        .select("id").single();
      const tplId = tRow.id;
      templateByRole[role] = tplId;
      counts.templates += 1;

      // KPIs
      const kpiIds: string[] = [];
      let order = 0;
      for (const kpiName of KPI_LIBRARY[role]) {
        const name = `${DEMO_PREFIX}${kpiName}`;
        // upsert by name (no unique constraint on name — use lookup then insert/update)
        const { data: existing } = await admin.from("kpi_definitions").select("id").eq("name", name).maybeSingle();
        let kid: string;
        if (existing) {
          kid = existing.id;
        } else {
          const { data: ins, error } = await admin.from("kpi_definitions").insert({
            name, description: `Demo KPI for ${role}`,
            category: role, department: DEMO_USERS.find(x => x.role === role)?.department ?? null,
            owner_role: role, measurement_type: "manual_proof", cadence: "daily",
            weight: 1, proof_required: true, approval_required: true,
            reward_points: 5, is_active: true, created_by: actorId,
          }).select("id").single();
          if (error) throw error;
          kid = ins.id;
          counts.kpi_definitions += 1;
        }
        kpiIds.push(kid);
        await admin.from("kpi_template_items")
          .upsert({ template_id: tplId, kpi_id: kid, sort_order: order++, is_required: true }, { onConflict: "template_id,kpi_id", ignoreDuplicates: true });
      }
      kpiByRole[role] = kpiIds;
    }

    // 3) Assignments + entries + submissions + attendance
    const workdays = lastWorkdays(7); // 7 non-Sunday days ending yesterday
    const today = new Date(); today.setUTCHours(0,0,0,0);
    const startDate = fmtDate(new Date(today.getTime() - 7 * 86400000));

    for (const u of DEMO_USERS) {
      const uid = userIds[u.key];
      const tplId = templateByRole[u.role];
      const kpiIds = kpiByRole[u.role];

      // Assignment (one active per user)
      let assignmentId: string;
      const { data: existAssign } = await admin.from("kpi_assignments")
        .select("id").eq("user_id", uid).eq("template_id", tplId).eq("is_active", true).maybeSingle();
      if (existAssign) {
        assignmentId = existAssign.id;
      } else {
        const { data: aRow, error } = await admin.from("kpi_assignments").insert({
          user_id: uid, template_id: tplId, assignment_type: "template",
          assigned_by: actorId, start_date: startDate, is_active: true,
          notes: "Demo data seed",
        }).select("id").single();
        if (error) throw error;
        assignmentId = aRow.id;
        counts.assignments += 1;
      }

      // Attendance sessions
      for (const d of workdays) {
        const inHour = 9 + Math.floor(Math.random() * 2);        // 9–10
        const inMin = Math.floor(Math.random() * 45) + 15;       // :15–:59 → mostly 9:45–10:30
        const outHour = 18 + Math.floor(Math.random() * 2);      // 18–19
        const outMin = Math.floor(Math.random() * 60);
        const [lo, hi] = u.active_minutes_range;
        const active = lo + Math.floor(Math.random() * (hi - lo));
        const totalMin = (outHour * 60 + outMin) - (inHour * 60 + inMin);
        const { error } = await admin.from("attendance_sessions").upsert({
          user_id: uid, work_date: d,
          check_in_at: makeTimestamp(d, inHour, inMin),
          check_out_at: makeTimestamp(d, outHour, outMin),
          total_minutes: Math.max(0, totalMin),
          active_minutes: active, idle_minutes: Math.max(0, totalMin - active),
          source: "system", status: "present",
          activity_source: "demo",
          notes: "Demo session",
        }, { onConflict: "user_id,work_date" });
        if (!error) counts.attendance += 1;
        else counts.errors.push(`attendance ${u.email} ${d}: ${error.message}`);
      }

      // KPI entries + submissions
      for (let di = 0; di < workdays.length; di++) {
        const d = workdays[di];
        const status = u.daily_pattern[di] ?? "approved";
        for (const kid of kpiIds) {
          // Entry
          const entryStatus = status === "submitted" ? "submitted"
                            : status === "approved" ? "approved"
                            : status === "rejected" ? "rejected"
                            : "missed";
          const { data: entryRow, error: eErr } = await admin.from("kpi_entries").upsert({
            assignment_id: assignmentId, user_id: uid, kpi_id: kid,
            period_type: "daily", period_start: d, period_end: d,
            due_at: makeTimestamp(d, 19, 0), target_value: 1, status: entryStatus,
          }, { onConflict: "assignment_id,kpi_id,user_id,period_start,period_end" })
            .select("id").single();
          if (eErr) { counts.errors.push(`entry ${u.email} ${d}: ${eErr.message}`); continue; }
          counts.entries += 1;

          if (status === "missed") continue;
          const proof = PROOF_URLS[Math.floor(Math.random() * PROOF_URLS.length)];
          const submittedAt = makeTimestamp(d, 17, 30);
          const subStatus = status === "submitted" ? "submitted"
                          : status === "rejected" ? "rejected" : "approved";
          const reviewedAt = subStatus === "submitted" ? null : makeTimestamp(d, 18, 30);
          const reviewNotes = subStatus === "rejected" ? (u.rejected_note ?? "Needs improvement.") : null;
          const { error: sErr } = await admin.from("kpi_submissions").upsert({
            entry_id: entryRow.id, user_id: uid,
            submitted_value: 1, proof_url: proof,
            notes: subStatus === "rejected" ? "See review feedback." : "Completed as per plan.",
            submitted_at: submittedAt, status: subStatus,
            reviewed_by: subStatus === "submitted" ? null : actorId,
            reviewed_at: reviewedAt, review_notes: reviewNotes,
          }, { onConflict: "entry_id" });
          if (sErr) counts.errors.push(`submission ${u.email} ${d}: ${sErr.message}`);
          else counts.submissions += 1;
        }
      }

      // Reward earnings (delete demo rewards for user first, then insert if configured)
      await admin.from("kpi_reward_earnings").delete().eq("user_id", uid).is("reward_rule_id", null);
      if (u.reward) {
        const periodStart = u.reward.period === "monthly"
          ? fmtDate(new Date(today.getUTCFullYear(), today.getUTCMonth(), 1))
          : workdays[0];
        const periodEnd = u.reward.period === "monthly"
          ? fmtDate(new Date(today.getUTCFullYear(), today.getUTCMonth() + 1, 0))
          : workdays[workdays.length - 1];
        const { error } = await admin.from("kpi_reward_earnings").insert({
          user_id: uid, reward_rule_id: null,
          period_type: u.reward.period, period_start: periodStart, period_end: periodEnd,
          score: u.scorecard.score, reward_points: u.reward.points, cash_amount: 0,
          badge_name: u.reward.badge, recognition_label: u.reward.badge,
          status: u.reward.status,
          approved_by: u.reward.status === "approved" ? actorId : null,
          approved_at: u.reward.status === "approved" ? new Date().toISOString() : null,
          generated_by: actorId, payout_notes: "Demo reward",
        });
        if (error) counts.errors.push(`reward ${u.email}: ${error.message}`);
        else counts.rewards += 1;
      }
    }

    await log(admin, actorId, "team_performance_demo_seed_completed", counts);
    return reply({ ok: true, message: "Demo data seeded.", counts, demo_password: DEMO_PASSWORD });
  } catch (e: any) {
    await log(admin, actorId, "team_performance_demo_seed_failed", { error: String(e?.message ?? e), counts });
    return fail("SEED_FAILED", "Demo seed failed.", String(e?.message ?? e));
  }
}

// ─────────────────────────── RESET ───────────────────────────
async function reset(admin: any, actorId: string) {
  await log(admin, actorId, "team_performance_demo_reset_started", {});
  const counts = { users: 0, kpi_defs: 0, templates: 0, entries: 0, submissions: 0, attendance: 0, rewards: 0, assignments: 0, errors: [] as string[] };

  try {
    // Find demo users by email suffix
    const { data: profs } = await admin.from("profiles").select("id, email").ilike("email", `%${DEMO_DOMAIN}`);
    const demoIds: string[] = (profs ?? []).map((p: any) => p.id);

    if (demoIds.length) {
      // Rewards
      const { count: rc } = await admin.from("kpi_reward_earnings").delete({ count: "exact" }).in("user_id", demoIds);
      counts.rewards = rc ?? 0;
      // Reminders (cascade via entries would also drop these, but be explicit)
      await admin.from("team_performance_reminders").delete().in("user_id", demoIds);
      // Submissions
      const { count: sc } = await admin.from("kpi_submissions").delete({ count: "exact" }).in("user_id", demoIds);
      counts.submissions = sc ?? 0;
      // Entries
      const { count: ec } = await admin.from("kpi_entries").delete({ count: "exact" }).in("user_id", demoIds);
      counts.entries = ec ?? 0;
      // Assignments
      const { count: ac } = await admin.from("kpi_assignments").delete({ count: "exact" }).in("user_id", demoIds);
      counts.assignments = ac ?? 0;
      // Attendance
      const { count: attc } = await admin.from("attendance_sessions").delete({ count: "exact" }).in("user_id", demoIds);
      counts.attendance = attc ?? 0;
      // Module access, roles, profiles
      await admin.from("user_module_access").delete().in("user_id", demoIds);
      await admin.from("user_roles").delete().in("user_id", demoIds);
      await admin.from("profiles").delete().in("id", demoIds);
      // Auth users
      for (const id of demoIds) {
        const { error } = await admin.auth.admin.deleteUser(id);
        if (error) counts.errors.push(`auth delete ${id}: ${error.message}`);
        else counts.users += 1;
      }
    }

    // Demo KPI templates + items + definitions (name prefixed [DEMO])
    const { data: tpls } = await admin.from("kpi_templates").select("id").ilike("name", `${DEMO_PREFIX}%`);
    const tplIds = (tpls ?? []).map((t: any) => t.id);
    if (tplIds.length) {
      await admin.from("kpi_template_items").delete().in("template_id", tplIds);
      await admin.from("kpi_templates").delete().in("id", tplIds);
      counts.templates = tplIds.length;
    }
    const { data: defs } = await admin.from("kpi_definitions").select("id").ilike("name", `${DEMO_PREFIX}%`);
    const defIds = (defs ?? []).map((d: any) => d.id);
    if (defIds.length) {
      await admin.from("kpi_definitions").delete().in("id", defIds);
      counts.kpi_defs = defIds.length;
    }

    await log(admin, actorId, "team_performance_demo_reset_completed", counts);
    return reply({ ok: true, message: "Demo data reset.", counts });
  } catch (e: any) {
    return fail("RESET_FAILED", "Demo reset failed.", String(e?.message ?? e));
  }
}

async function log(admin: any, actorId: string, action_type: string, metadata: Record<string, unknown>) {
  try {
    await admin.from("audit_logs").insert({
      module_key: "team_performance", module_label: "Team Performance",
      action_type, actor_user_id: actorId,
      metadata, severity: "info", source: "app",
      summary: action_type.replace(/_/g, " "),
    });
  } catch { /* non-fatal */ }
}
