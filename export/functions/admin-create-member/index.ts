import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Always return 200 with a structured body so `supabase.functions.invoke`
// surfaces the message to the admin UI (non-2xx responses hide the body
// behind a generic "non-2xx status code" error).
function reply(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
function fail(error_code: string, message: string, details?: string, http = 200) {
  return reply({ ok: false, error: message, error_code, message, details }, http);
}

function normEmail(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}
function toRoleKey(label: string): string {
  return label.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "custom";
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
    if (!isAdmin) return fail("FORBIDDEN", "Only admins can add team members.");

    let body: any;
    try { body = await req.json(); } catch { return fail("BAD_JSON", "Request body must be JSON."); }

    const full_name = String(body?.full_name ?? "").trim();
    const email = normEmail(body?.email);
    const password = String(body?.password ?? "");
    const role = String(body?.role ?? "").trim();
    const department = body?.department ? String(body.department).trim() : null;
    const isAdminFlag = !!body?.is_admin;
    const modulesInput: string[] = Array.isArray(body?.modules) ? body.modules.map((m: any) => String(m)).filter(Boolean) : [];
    const payroll = body?.payroll && typeof body.payroll === "object" ? body.payroll : null;

    if (!full_name) return fail("MISSING_FIELD", "Full name is required.");
    if (!email) return fail("MISSING_FIELD", "Email is required.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("INVALID_EMAIL", "Email is not a valid address.");
    if (!password || password.length < 6) return fail("WEAK_PASSWORD", "Password must be at least 6 characters.");
    if (!role) return fail("INVALID_ROLE", "Role is required.");
    if (!isAdminFlag && modulesInput.length === 0) return fail("NO_MODULES", "Select at least one module or enable admin access.");

    // Ensure role exists in company_role_catalog (create if new).
    const role_key = toRoleKey(role);
    try {
      await admin.from("company_role_catalog")
        .upsert({ role_key, role_label: role, is_active: true }, { onConflict: "role_key", ignoreDuplicates: true });
    } catch (_) { /* non-fatal */ }

    // Create or reuse auth user.
    let newId: string | null = null;
    let created_new = false;
    const { data: createRes, error: cErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { full_name, role, department },
    });
    if (cErr) {
      const msg = cErr.message || "";
      const already = /registered|exists|duplicate/i.test(msg);
      if (!already) return fail("AUTH_CREATE_FAILED", "Failed to create login user.", msg);
      // Look up existing user by email.
      const { data: list, error: lErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      if (lErr) return fail("AUTH_LOOKUP_FAILED", "Email may already exist but lookup failed.", lErr.message);
      const existing = list?.users?.find((u) => (u.email || "").toLowerCase() === email);
      if (!existing) return fail("EMAIL_EXISTS", "Email is already registered but user could not be located. Ask the person to reset password.");
      newId = existing.id;
    } else {
      newId = createRes.user!.id;
      created_new = true;
    }

    // Upsert profile (handle_new_user trigger inserts a row on auth create,
    // but we upsert to be safe when reusing an existing user).
    const { error: pErr } = await admin.from("profiles").upsert({
      id: newId,
      full_name,
      email,
      role,
      department,
      status: "active",
    }, { onConflict: "id" });
    if (pErr) return fail("PROFILE_FAILED", created_new
      ? "Login user created but profile could not be saved. Use repair to complete."
      : "Profile could not be updated.", pErr.message);

    // Admin role assignment.
    if (isAdminFlag) {
      const { error: arErr } = await admin.from("user_roles")
        .upsert({ user_id: newId, role: "admin" }, { onConflict: "user_id,role" });
      if (arErr) return fail("ROLE_ASSIGN_FAILED", "Failed to grant admin role.", arErr.message);
    }

    // Module access: replace-flow when caller sends explicit list.
    let module_access_count = 0;
    if (!isAdminFlag) {
      // Deduplicate and coerce to strings.
      const modules = Array.from(new Set(modulesInput));
      // Wipe old rows first for a clean replace on re-invite scenarios.
      const { error: delErr } = await admin.from("user_module_access").delete().eq("user_id", newId);
      if (delErr) return fail("MODULE_CLEAR_FAILED", "Could not reset module access.", delErr.message);
      if (modules.length) {
        const rows = modules.map((k) => ({ user_id: newId, module_key: k, granted_by: caller.id }));
        const { error: mErr } = await admin.from("user_module_access").insert(rows);
        if (mErr) return fail("MODULE_ASSIGN_FAILED", "Failed to assign module access.", mErr.message);
        module_access_count = rows.length;
      }
    }

    // Optional payroll profile.
    if (payroll) {
      const p = payroll as any;
      const { error: payErr } = await admin.from("team_payroll_profiles").upsert({
        team_member_id: newId,
        full_name_snapshot: full_name,
        role_snapshot: role,
        department_snapshot: department,
        business_unit: p.business_unit ?? "IPC",
        payroll_applicable: !!p.payroll_applicable,
        pay_type: p.pay_type ?? "Monthly Salary",
        monthly_salary: Number(p.monthly_salary) || 0,
        one_time_pay: Number(p.one_time_pay) || 0,
        daily_wage: Number(p.daily_wage) || 0,
        hourly_rate: Number(p.hourly_rate) || 0,
        joining_date: p.joining_date || null,
        exit_date: p.exit_date || null,
        salary_expense_category: p.salary_expense_category || null,
        pnl_cost_classification: p.pnl_cost_classification || null,
        salary_cycle: p.salary_cycle || "Calendar Month: 1st to Last Day",
        disbursement_start_day: Number(p.disbursement_start_day) || 7,
        disbursement_end_day: Number(p.disbursement_end_day) || 10,
        notes: p.notes || null,
        created_by: caller.id,
        updated_by: caller.id,
      }, { onConflict: "team_member_id" });
      if (payErr) {
        // Payroll is non-blocking — return warning but overall success.
        return reply({
          ok: true, id: newId, user_id: newId, profile_created: true,
          module_access_count, created_new,
          message: "Team member added, but payroll profile could not be saved.",
          warning: payErr.message,
        });
      }
    }

    return reply({
      ok: true,
      id: newId,
      user_id: newId,
      profile_created: true,
      module_access_count,
      created_new,
      message: "Team member added successfully.",
    });
  } catch (e) {
    return fail("UNEXPECTED", "Unexpected server error.", String(e?.message ?? e));
  }
});
