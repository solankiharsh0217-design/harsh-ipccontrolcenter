// Admin-only edge function for team login access:
//   op=status  → returns auth state for given emails
//   op=invite  → sends a Supabase invite email
//   op=reset   → sends a Supabase password reset email
// Service role key is only used server-side. Caller must be an active admin.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 1) Authenticate caller
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: uErr } = await userClient.auth.getUser();
    if (uErr || !user) return json({ error: "Unauthorized" }, 401);

    // 2) Authorize as admin
    const admin = createClient(url, service);
    const { data: isAdmin, error: rErr } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (rErr || !isAdmin) return json({ error: "Admin only" }, 403);

    const body = await req.json().catch(() => ({}));
    const op = String(body?.op || "").toLowerCase();

    // ─────────── STATUS ───────────
    if (op === "status") {
      const wanted: string[] = Array.isArray(body?.emails)
        ? body.emails.map((e: unknown) => String(e || "").toLowerCase().trim()).filter(Boolean)
        : [];
      const wantedSet = new Set(wanted);

      // Page through users (up to ~10k). Stop early once all wanted emails are found.
      const results: Record<string, { state: string; last_sign_in_at: string | null; user_id: string | null; email_confirmed_at: string | null }> = {};
      const perPage = 1000;
      for (let page = 1; page <= 10; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
        if (error) return json({ error: error.message }, 500);
        const users = data?.users ?? [];
        for (const u of users) {
          const em = (u.email || "").toLowerCase();
          if (wantedSet.size && !wantedSet.has(em)) continue;
          const invited = (u as any).invited_at as string | null | undefined;
          const confirmed = (u as any).email_confirmed_at as string | null | undefined;
          const lastSignIn = (u as any).last_sign_in_at as string | null | undefined;
          let state: string;
          if (lastSignIn) state = "active";
          else if (confirmed) state = "confirmed";
          else if (invited) state = "invited";
          else state = "unconfirmed";
          results[em] = {
            state,
            last_sign_in_at: lastSignIn ?? null,
            user_id: u.id,
            email_confirmed_at: confirmed ?? null,
          };
        }
        if (users.length < perPage) break;
      }
      // Anything wanted but not in results = no auth user
      for (const em of wantedSet) {
        if (!results[em]) results[em] = { state: "no_auth", last_sign_in_at: null, user_id: null, email_confirmed_at: null };
      }
      return json({ ok: true, statuses: results });
    }

    // ─────────── INVITE ───────────
    if (op === "invite") {
      const email = String(body?.email || "").trim();
      if (!email) return json({ error: "Email required" }, 400);
      const redirectTo = String(body?.redirectTo || "");
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, redirectTo ? { redirectTo } : undefined);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true, user_id: data?.user?.id ?? null });
    }

    // ─────────── RESET ───────────
    if (op === "reset") {
      const email = String(body?.email || "").trim();
      if (!email) return json({ error: "Email required" }, 400);
      const redirectTo = String(body?.redirectTo || "");

      const resendKey = Deno.env.get("RESEND_API_KEY");
      const fromAddr = Deno.env.get("EMAIL_FROM_ADDRESS");
      const fromName = Deno.env.get("EMAIL_FROM_NAME") || "IPC Control Center";
      const replyTo = Deno.env.get("EMAIL_REPLY_TO");

      // Prefer sending via Resend using an admin-generated recovery link,
      // so we don't depend on Supabase's built-in SMTP.
      if (resendKey && fromAddr) {
        const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
          type: "recovery",
          email,
          options: redirectTo ? { redirectTo } : undefined,
        });
        if (linkErr) return json({ error: linkErr.message }, 400);
        const actionLink = (linkData as any)?.properties?.action_link
          ?? (linkData as any)?.action_link;
        if (!actionLink) return json({ error: "Could not generate recovery link" }, 500);

        const html = `
          <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111">
            <h2 style="font-weight:600;font-size:18px;margin:0 0 12px">Reset your Control Center password</h2>
            <p style="font-size:14px;line-height:1.55;color:#333">
              An administrator requested a password reset for your India Photographers Club — Control Center account.
              Click the button below to set a new password. This link expires shortly for your security.
            </p>
            <p style="margin:22px 0">
              <a href="${actionLink}" style="background:#000;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:14px;display:inline-block">Set new password</a>
            </p>
            <p style="font-size:12px;color:#666">If the button doesn't work, copy and paste this URL into your browser:</p>
            <p style="font-size:12px;color:#666;word-break:break-all">${actionLink}</p>
            <p style="font-size:12px;color:#999;margin-top:24px">If you didn't expect this email, you can safely ignore it.</p>
          </div>`;

        const fromHeader = `${fromName} <${fromAddr}>`;
        const resendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: fromHeader,
            to: [email],
            subject: "Reset your Control Center password",
            html,
            ...(replyTo ? { reply_to: replyTo } : {}),
          }),
        });
        if (!resendRes.ok) {
          const errText = await resendRes.text();
          console.error("Resend send failed", resendRes.status, errText);
          return json({ error: `Email send failed: ${errText}` }, resendRes.status);
        }
        return json({ ok: true, via: "resend" });
      }

      // Fallback: Supabase built-in recovery email
      const anonClient = createClient(url, anon);
      const { error } = await anonClient.auth.resetPasswordForEmail(
        email,
        redirectTo ? { redirectTo } : undefined,
      );
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true, via: "supabase" });
    }


    return json({ error: "Unknown op" }, 400);
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
