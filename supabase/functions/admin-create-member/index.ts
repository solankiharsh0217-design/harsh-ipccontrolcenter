import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });

    const admin = createClient(url, service);
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    if (!roles?.some((r: any) => r.role === "admin"))
      return new Response(JSON.stringify({ error: "Admin only" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });

    const body = await req.json();
    const { email, password, full_name, role, department, payroll } = body;
    if (!email || !password || !full_name || !role)
      return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });

    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { full_name, role, department },
    });
    if (cErr) return new Response(JSON.stringify({ error: cErr.message }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });

    const newId = created.user!.id;
    await admin.from("profiles").update({ status: "active", full_name, role, department: department ?? null }).eq("id", newId);

    if (payroll && typeof payroll === "object") {
      const p = payroll as any;
      await admin.from("team_payroll_profiles").upsert({
        team_member_id: newId,
        full_name_snapshot: full_name,
        role_snapshot: role,
        department_snapshot: department ?? null,
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
        created_by: user.id,
        updated_by: user.id,
      }, { onConflict: "team_member_id" });
    }

    return new Response(JSON.stringify({ ok: true, id: newId }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
