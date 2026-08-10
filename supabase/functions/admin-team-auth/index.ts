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

    const body = await req.json().catch(() => ({}));
    const op = String(body?.op || "").toLowerCase();
    // Self-service password reset from the login screen: no admin session exists.
    const selfService = op === "reset" && body?.selfService === true;

    // --- Rate Limiting for Self-Service ---
    if (selfService && body?.email) {
      const email = String(body.email).toLowerCase().trim();
      const redis = Deno.env.get("UPSTASH_REDIS_REST_URL");
      const redisToken = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");

      if (redis && redisToken) {
        try {
          // Simple rate limit: 3 requests per email per hour
          const key = `ratelimit:auth-reset:${email}`;
          const now = Math.floor(Date.now() / 1000);
          const window = 3600; // 1 hour
          
          const res = await fetch(`${redis}/pipeline`, {
            method: "POST",
            headers: { Authorization: `Bearer ${redisToken}` },
            body: JSON.stringify([
              ["ZREMRANGEBYSCORE", key, 0, now - window],
              ["ZADD", key, now, now],
              ["ZCARD", key],
              ["EXPIRE", key, window],
            ]),
          });
          
          if (res.ok) {
            const results = await res.json();
            const count = results[2]?.result;
            if (count > 3) {
              console.warn(`[ratelimit] Reset limit exceeded for ${email}`);
              // Neutral success to prevent enumeration/denial of service discovery
              return json({ ok: true, via: "ratelimited" });
            }
          }
        } catch (e) {
          console.error("[ratelimit] Redis error", e);
          // Fail open to avoid blocking users if Redis is down, but log it.
        }
      }
    }


    const admin = createClient(url, service);

    if (!selfService) {
      // 1) Authenticate caller
      const authHeader = req.headers.get("Authorization") ?? "";
      if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
      const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
      const { data: { user }, error: uErr } = await userClient.auth.getUser();
      if (uErr || !user) return json({ error: "Unauthorized" }, 401);

      // 2) Authorize as admin
      const { data: isAdmin, error: rErr } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
      if (rErr || !isAdmin) return json({ error: "Admin only" }, 403);
    }

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
        if (linkErr) {
          // Never reveal whether an account exists for a self-service request.
          if (selfService) { console.warn("[self-reset] generateLink failed:", linkErr.message); return json({ ok: true, via: "resend" }); }
          return json({ error: linkErr.message }, 400);
        }
        const actionLink = (linkData as any)?.properties?.action_link
          ?? (linkData as any)?.action_link;
        if (!actionLink) {
          if (selfService) return json({ ok: true, via: "resend" });
          return json({ error: "Could not generate recovery link" }, 500);
        }

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
          // Neutral success for self-service even if Resend fails (to prevent timing/error-based enumeration)
          if (selfService) return json({ ok: true, via: "resend-fail" });
          return json({ error: `Email send failed: ${errText}` }, resendRes.status);
        }
        return json({ ok: true, via: "resend" });

      }

      // Fallback: Supabase built-in recovery email (rate-limited, often undelivered).
      // Surface this clearly so the admin knows Resend was NOT used.
      const missing = [
        !resendKey ? "RESEND_API_KEY" : null,
        !fromAddr ? "EMAIL_FROM_ADDRESS" : null,
      ].filter(Boolean).join(", ");
      const anonClient = createClient(url, anon);
      const { error } = await anonClient.auth.resetPasswordForEmail(
        email,
        redirectTo ? { redirectTo } : undefined,
      );
      if (error && !selfService) return json({ error: error.message }, 400);
      if (error) console.warn("[self-reset] fallback failed:", error.message);
      return json({
        ok: true,
        via: "supabase-fallback",
        warning: `Resend is not configured (missing: ${missing}). The reset email was sent through Supabase's built-in SMTP, which is rate-limited (~2/hour) and frequently undelivered. Configure Resend secrets for reliable delivery.`,
      });
    }


    return json({ error: "Unknown op" }, 400);
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
