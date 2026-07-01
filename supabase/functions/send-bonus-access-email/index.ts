import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
function fail(code: string, msg: string, status = 400) { return jsonResponse({ ok: false, error_code: code, message: msg }, status); }
function esc(s: any) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

interface BonusResource { id: string; title: string; description?: string; url?: string; type?: string; active?: boolean }

function applyPlaceholders(text: string, ctx: Record<string, string>) {
  return String(text || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => ctx[k] ?? '');
}

function renderHtml(opts: { subject: string; bodyText: string; resources: BonusResource[]; supportEmail: string; subscriptionDuration: string }) {
  const links = (opts.resources || []).filter((r) => r.active !== false).map((r) => `
    <li style="margin:10px 0">
      <div style="font-weight:600;color:#111">${esc(r.title)}${r.type ? ` <span style="font-weight:400;color:#64748b;font-size:11px">· ${esc(r.type)}</span>` : ''}</div>
      ${r.description ? `<div style="color:#475569;font-size:12.5px;margin:2px 0 4px">${esc(r.description)}</div>` : ''}
      ${r.url ? `<a href="${esc(r.url)}" style="color:#2563eb;font-size:12.5px;word-break:break-all">${esc(r.url)}</a>` : '<span style="color:#94a3b8;font-size:12px">Link pending</span>'}
    </li>`).join('');
  const bodyHtml = esc(opts.bodyText).replace(/\n/g, '<br/>');
  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f6f7f9;padding:24px;color:#111">
<div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:28px">
<h2 style="margin:0 0 12px;font-size:18px">${esc(opts.subject)}</h2>
<div style="color:#334155;font-size:14px;line-height:1.6">${bodyHtml}</div>
<h3 style="margin:24px 0 6px;font-size:14px">Your Bonus Resources</h3>
<ul style="padding-left:18px;margin:0">${links || '<li style="color:#94a3b8">No bonus resources configured yet.</li>'}</ul>
<p style="font-size:12px;color:#64748b;margin-top:24px">Support: <a href="mailto:${esc(opts.supportEmail)}" style="color:#2563eb">${esc(opts.supportEmail)}</a><br/>Subscription: ${esc(opts.subscriptionDuration)}</p>
</div></body></html>`;
}

function renderText(opts: { subject: string; bodyText: string; resources: BonusResource[]; supportEmail: string; subscriptionDuration: string }) {
  const links = (opts.resources || []).filter((r) => r.active !== false).map((r) => `• ${r.title}${r.type ? ` (${r.type})` : ''}${r.url ? `\n  ${r.url}` : ''}${r.description ? `\n  ${r.description}` : ''}`).join('\n');
  return `${opts.bodyText}\n\nYour Bonus Resources:\n${links || '(none configured)'}\n\nSupport: ${opts.supportEmail}\nSubscription: ${opts.subscriptionDuration}`;
}

async function validateCaller(admin: any, req: Request, serviceKey: string) {
  const auth = req.headers.get('Authorization') || '';
  if (auth === `Bearer ${serviceKey}`) return { ok: true as const, service: true, user_id: null as string | null };
  if (!auth.startsWith('Bearer ')) return { ok: false as const, response: fail('UNAUTHORIZED', 'Missing Authorization', 401) };
  const token = auth.replace('Bearer ', '');
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user?.id) return { ok: false as const, response: fail('UNAUTHORIZED', 'Invalid session', 401) };
  const { data: isAdmin } = await admin.rpc('has_role', { _user_id: data.user.id, _role: 'admin' });
  if (!isAdmin) return { ok: false as const, response: fail('FORBIDDEN', 'Admin only', 403) };
  return { ok: true as const, user_id: data.user.id as string };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const envFrom = Deno.env.get('EMAIL_FROM_ADDRESS') || '';
    const envFromName = Deno.env.get('EMAIL_FROM_NAME') || 'IPC Control Center';
    const envReply = Deno.env.get('EMAIL_REPLY_TO') || '';
    const admin = createClient(SUPABASE_URL, SERVICE);

    const caller = await validateCaller(admin, req, SERVICE);
    if (!caller.ok) return caller.response as Response;

    const body = await req.json().catch(() => ({}));
    const { request_id, mode = 'auto', test_email } = body || {};
    // mode: 'auto' (post-CoC; respects duplicate guard), 'resend' (admin), 'test' (sends to test_email only; no DB writes)

    const { data: cs } = await admin.from('company_settings').select('*').order('created_at', { ascending: true }).limit(1).maybeSingle();
    if (!cs) return fail('NO_SETTINGS', 'Company settings not configured');
    const subjectTpl: string = cs.bonus_email_subject || 'Your Special Bonuses Are Now Activated';
    const bodyTpl: string = cs.bonus_email_body || '';
    const supportEmail: string = cs.bonus_email_support_email || cs.support_email || '';
    const subDur: string = cs.bonus_email_subscription_duration || '';
    const resources: BonusResource[] = Array.isArray(cs.bonus_resources) ? cs.bonus_resources : [];
    const templateVersion: number = Number(cs.bonus_terms_version || 1);

    if (!RESEND_API_KEY || !envFrom) return fail('EMAIL_SETUP_INCOMPLETE', 'RESEND_API_KEY or EMAIL_FROM_ADDRESS missing');

    // TEST MODE
    if (mode === 'test') {
      if (!test_email) return fail('MISSING_TEST_EMAIL', 'test_email required');
      const ctx = {
        member_name: 'Sample Member',
        support_email: supportEmail,
        activation_date: new Date().toLocaleDateString('en-IN', { dateStyle: 'long' }),
        subscription_duration: subDur,
      };
      const subject = `[TEST] ${applyPlaceholders(subjectTpl, ctx)}`;
      const bodyText = applyPlaceholders(bodyTpl, ctx);
      const html = renderHtml({ subject, bodyText, resources, supportEmail, subscriptionDuration: subDur });
      const text = renderText({ subject, bodyText, resources, supportEmail, subscriptionDuration: subDur });
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: `${envFromName} <${envFrom}>`, to: [test_email], subject, html, text, ...(envReply ? { reply_to: envReply } : {}) }),
      });
      const t = await resp.text();
      if (!resp.ok) return fail('EMAIL_PROVIDER_REJECTED', `Resend ${resp.status}: ${t}`, 502);
      return jsonResponse({ ok: true, mode, to: test_email, template_version: templateVersion });
    }

    // AUTO / RESEND require request_id + a member email
    if (!request_id) return fail('MISSING_REQUEST_ID', 'request_id required');
    const { data: r } = await admin.from('code_of_conduct_requests').select('*').eq('id', request_id).maybeSingle();
    if (!r) return fail('REQUEST_NOT_FOUND', 'Request not found', 404);
    const memberName: string = r.signed_member_name || r.member_name || 'Member';
    const memberEmail: string | null = r.signed_member_email || r.member_email || null;
    if (!memberEmail) return fail('MISSING_RECIPIENT', 'Member email missing');

    // Duplicate guard for auto mode
    if (mode === 'auto' && r.bonus_email_sent_at) {
      return jsonResponse({ ok: true, skipped: true, reason: 'already_sent', sent_at: r.bonus_email_sent_at });
    }
    if (mode === 'auto' && r.status !== 'signed') {
      return fail('NOT_SIGNED', 'Code of Conduct not signed yet');
    }
    if (mode === 'resend' && !caller.user_id) return fail('FORBIDDEN', 'Resend requires admin session', 403);

    const ctx = {
      member_name: memberName,
      support_email: supportEmail,
      activation_date: new Date().toLocaleDateString('en-IN', { dateStyle: 'long' }),
      subscription_duration: subDur,
    };
    const subject = applyPlaceholders(subjectTpl, ctx);
    const bodyText = applyPlaceholders(bodyTpl, ctx);
    const html = renderHtml({ subject, bodyText, resources, supportEmail, subscriptionDuration: subDur });
    const text = renderText({ subject, bodyText, resources, supportEmail, subscriptionDuration: subDur });

    const sentAt = new Date().toISOString();
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `${envFromName} <${envFrom}>`, to: [memberEmail], subject, html, text, ...(envReply ? { reply_to: envReply } : {}) }),
    });
    const t = await resp.text();
    if (!resp.ok) {
      await admin.from('code_of_conduct_events').insert({ request_id: r.id, event_type: 'bonus_email_failed', metadata: { mode, error: t, status: resp.status } });
      try {
        await admin.from('code_of_conduct_requests').update({
          bonus_email_last_error: `Resend ${resp.status}: ${t}`.slice(0, 500),
          bonus_email_last_error_at: new Date().toISOString(),
        }).eq('id', r.id);
      } catch { /* ignore */ }
      return fail('EMAIL_PROVIDER_REJECTED', `Resend ${resp.status}: ${t}`, 502);
    }
    let providerId: string | null = null;
    try { providerId = JSON.parse(t)?.id || null; } catch { /* ignore */ }

    const patch: Record<string, unknown> = { bonus_email_template_version: templateVersion, bonus_email_last_error: null, bonus_email_last_error_at: null };
    if (mode === 'auto' || !r.bonus_email_sent_at) {
      patch.bonus_email_sent_at = sentAt;
    }
    if (mode === 'resend') {
      patch.last_bonus_email_resent_at = sentAt;
    }
    await admin.from('code_of_conduct_requests').update(patch).eq('id', r.id);
    await admin.from('code_of_conduct_events').insert({
      request_id: r.id,
      event_type: mode === 'resend' ? 'bonus_email_resent' : 'bonus_email_sent',
      metadata: { to: memberEmail, provider_message_id: providerId, sent_at: sentAt, template_version: templateVersion, actor_user_id: caller.user_id },
    });

    return jsonResponse({ ok: true, mode, to: memberEmail, provider_message_id: providerId, sent_at: sentAt, template_version: templateVersion });
  } catch (e) {
    console.error('send-bonus-access-email error', e);
    return fail('SEND_FAILED', (e as Error).message || 'Server error', 500);
  }
});
