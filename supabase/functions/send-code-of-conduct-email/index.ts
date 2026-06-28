import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomToken() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function fail(error_code: string, message: string, details?: unknown, status = 400) {
  return jsonResponse({ ok: false, error_code, message, details: details ?? null }, status);
}

function isSafeAppOrigin(value: string) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:') return false;
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return false;
    return u.hostname.endsWith('.lovable.app') || u.hostname === 'ipccontrolcenter.lovable.app';
  } catch {
    return false;
  }
}

function resolveBaseUrl(bodyOrigin: string | null | undefined, headerOrigin: string | null) {
  const candidates = [Deno.env.get('PUBLIC_APP_URL'), bodyOrigin, headerOrigin].filter(Boolean) as string[];
  const base = candidates.map((v) => v.trim().replace(/\/+$/, '')).find(isSafeAppOrigin);
  return base || '';
}

function escapeHtml(s: string) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderTemplate(raw: string, vars: Record<string, string>) {
  return Object.entries(vars).reduce((acc, [key, value]) => acc.replaceAll(`{{${key}}}`, value), raw || '');
}

function findUnresolvedVars(value: string) {
  return Array.from(new Set((value.match(/{{\s*[^}]+\s*}}/g) || []).map((v) => v.trim())));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  let admin: any = null;
  let requestRow: any = null;
  let userId: string | null = null;

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return fail('UNAUTHORIZED', 'Missing or invalid Authorization header', null, 401);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: claimErr } = await userClient.auth.getUser();
    if (claimErr || !userData?.user?.id) return fail('UNAUTHORIZED', 'Invalid session', null, 401);
    userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const { action, request_id, paid_pipeline_lead_id, crm_lead_id, template_id, member_name, member_email, member_phone, program_name, deal_value, origin, is_test } = body || {};

    if (action === 'diagnostics') {
      const diagAdmin = createClient(SUPABASE_URL, SERVICE);
      const { data: isAdmin } = await diagAdmin.rpc('has_role', { _user_id: userId, _role: 'admin' });
      if (!isAdmin) return jsonResponse({ ok: false, error: { code: 'FORBIDDEN', message: 'Admin only' } }, 403);
      const { data: tpl } = await diagAdmin.from('code_of_conduct_templates')
        .select('id,name,from_email,from_name,reply_to_email,email_subject,email_body,template_pdf_url,html_content,whatsapp_redirect_url,test_recipient_email,updated_at')
        .eq('is_active', true).order('created_at', { ascending: false }).limit(1).maybeSingle();
      const { data: lastReq } = await diagAdmin.from('code_of_conduct_requests')
        .select('id,member_email,status,sent_at,last_email_attempt_at,last_email_error,last_email_error_code,provider_message_id')
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      const envFrom = Deno.env.get('EMAIL_FROM_ADDRESS') || '';
      const envName = Deno.env.get('EMAIL_FROM_NAME') || '';
      const envReply = Deno.env.get('EMAIL_REPLY_TO') || '';
      const resolvedFromEmail = (tpl?.from_email && tpl.from_email.trim()) || envFrom || '';
      const resolvedFromName = (tpl?.from_name && tpl.from_name.trim()) || envName || '';
      const resolvedReplyTo = (tpl?.reply_to_email && tpl.reply_to_email.trim()) || envReply || '';
      const resolvedBaseUrl = resolveBaseUrl(origin, req.headers.get('origin'));
      return jsonResponse({
        ok: true,
        provider: 'resend',
        has_resend_api_key: !!Deno.env.get('RESEND_API_KEY'),
        has_email_from_address: !!envFrom,
        has_email_from_name: !!envName,
        has_email_reply_to: !!envReply,
        has_public_app_url: !!Deno.env.get('PUBLIC_APP_URL'),
        resolved_public_app_url: resolvedBaseUrl || null,
        resolved_from_email: resolvedFromEmail,
        resolved_from_name: resolvedFromName,
        resolved_reply_to: resolvedReplyTo,
        sender_source: tpl?.from_email ? 'template' : (envFrom ? 'secret' : 'none'),
        template: tpl || null,
        last_attempt: lastReq || null,
      });
    }

    if (action === 'generate_signing_link') {
      if (!request_id) return fail('MISSING_REQUEST_ID', 'Request ID is required to generate a signing link.');
      admin = createClient(SUPABASE_URL, SERVICE);
      const { data: existing, error: existingErr } = await admin.from('code_of_conduct_requests').select('*').eq('id', request_id).maybeSingle();
      if (existingErr) return fail('REQUEST_LOOKUP_FAILED', existingErr.message, existingErr, 500);
      if (!existing) return fail('REQUEST_NOT_FOUND', 'Code of Conduct request not found.', null, 404);
      if (existing.status === 'cancelled') return fail('REQUEST_CANCELLED', 'This request is no longer active.', null, 410);
      const baseUrl = resolveBaseUrl(origin, req.headers.get('origin'));
      if (!baseUrl) return fail('MISSING_PUBLIC_APP_URL', 'Public app URL is not configured. Set PUBLIC_APP_URL or send from the deployed Lovable app.', { origin: origin || null }, 400);
      let expiryDays = 7;
      if (existing.template_id) {
        const { data: t } = await admin.from('code_of_conduct_templates').select('expiry_days').eq('id', existing.template_id).maybeSingle();
        expiryDays = Number(t?.expiry_days || 7);
      }
      const token = randomToken();
      const tokenHash = await sha256(token);
      const expiresAt = new Date(Date.now() + expiryDays * 24 * 3600 * 1000).toISOString();
      const { data: updated, error: updErr } = await admin.from('code_of_conduct_requests').update({ token_hash: tokenHash, token_expires_at: expiresAt }).eq('id', existing.id).select('id,status,token_expires_at').single();
      if (updErr) return fail('TOKEN_GENERATION_FAILED', updErr.message, updErr, 500);
      const signingLink = `${baseUrl}/code-of-conduct/sign/${token}`;
      await admin.from('code_of_conduct_events').insert({ request_id: existing.id, event_type: 'token_generated', metadata: { expires_at: expiresAt, source: 'admin_copy_link' }, created_by: userId });
      return jsonResponse({ ok: true, request_id: existing.id, signing_url: signingLink, token_expires_at: updated.token_expires_at, status: updated.status });
    }

    if (!member_email || typeof member_email !== 'string' || !member_email.includes('@')) return fail('MISSING_RECIPIENT_EMAIL', 'A valid recipient email is required.');
    if (!member_name || typeof member_name !== 'string') return fail('MISSING_MEMBER_NAME', 'Member name is required.');

    admin = createClient(SUPABASE_URL, SERVICE);

    let templateRow: any = null;
    if (template_id) {
      const { data } = await admin.from('code_of_conduct_templates').select('*').eq('id', template_id).maybeSingle();
      templateRow = data;
    }
    if (!templateRow) {
      const { data } = await admin.from('code_of_conduct_templates').select('*').eq('is_active', true).order('created_at', { ascending: false }).limit(1).maybeSingle();
      templateRow = data;
    }
    if (!templateRow) return fail('NO_TEMPLATE_CONFIGURED', 'No active Code of Conduct template configured. Add one in Admin Center → Code of Conduct.');
    if (!templateRow.email_subject || !templateRow.email_body) return fail('TEMPLATE_MISSING_EMAIL_BODY', 'Template is missing email subject or body.');

    const baseUrl = resolveBaseUrl(origin, req.headers.get('origin'));
    if (!baseUrl) return fail('MISSING_PUBLIC_APP_URL', 'Public app URL is not configured. Set PUBLIC_APP_URL or send from the deployed Lovable app.', { origin: origin || null }, 400);

    if (request_id) {
      const { data } = await admin.from('code_of_conduct_requests').select('*').eq('id', request_id).maybeSingle();
      requestRow = data;
    }
    if (!requestRow && !is_test && (paid_pipeline_lead_id || crm_lead_id)) {
      let q = admin.from('code_of_conduct_requests').select('*').eq('template_id', templateRow.id).in('status', ['draft', 'ready_to_send', 'sent', 'viewed']);
      if (paid_pipeline_lead_id) q = q.eq('paid_pipeline_lead_id', paid_pipeline_lead_id);
      else q = q.eq('crm_lead_id', crm_lead_id);
      const { data } = await q.order('created_at', { ascending: false }).limit(1);
      if (data && data.length) requestRow = data[0];
    }

    const token = randomToken();
    if (!token || token.length < 32) return fail('TOKEN_GENERATION_FAILED', 'Could not generate a secure signing token.', null, 500);
    const tokenHash = await sha256(token);
    const expiryDays = Number(templateRow.expiry_days || 7);
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 3600 * 1000).toISOString();
    const nowIso = new Date().toISOString();

    if (!requestRow) {
      const { data, error } = await admin.from('code_of_conduct_requests').insert({
        template_id: templateRow.id,
        template_version: templateRow.version,
        crm_lead_id: is_test ? null : (crm_lead_id || null),
        paid_pipeline_lead_id: is_test ? null : (paid_pipeline_lead_id || null),
        member_name: is_test ? `TEST — ${member_name}` : member_name,
        member_email,
        member_phone: member_phone || null,
        program_name: program_name || templateRow.program_name || null,
        deal_value: deal_value || null,
        status: 'ready_to_send',
        token_hash: tokenHash,
        token_expires_at: expiresAt,
        last_email_attempt_at: nowIso,
        created_by: userId,
      }).select().single();
      if (error) return fail('REQUEST_CREATION_FAILED', error.message, error, 500);
      requestRow = data;
      await admin.from('code_of_conduct_events').insert({ request_id: requestRow.id, event_type: 'request_created', metadata: { is_test: !!is_test }, created_by: userId });
    } else {
      const nextStatus = requestRow.status === 'signed' ? 'signed' : 'ready_to_send';
      const { data, error } = await admin.from('code_of_conduct_requests').update({
        token_hash: tokenHash,
        token_expires_at: expiresAt,
        member_name,
        member_email,
        member_phone: member_phone || requestRow.member_phone,
        status: nextStatus,
        last_email_attempt_at: nowIso,
      }).eq('id', requestRow.id).select().single();
      if (error) return fail('REQUEST_CREATION_FAILED', error.message, error, 500);
      requestRow = data;
    }

    // The new destination is the guided page (video gate + signature + group join).
    // The old direct signature route `/code-of-conduct/sign/${token}` still works
    // with the same token for backward compatibility.
    const signingLink = `${baseUrl}/code-of-conduct-guide/${token}`;
    await admin.from('code_of_conduct_events').insert({ request_id: requestRow.id, event_type: 'token_generated', metadata: { expires_at: expiresAt, is_test: !!is_test }, created_by: userId });
    await admin.from('code_of_conduct_events').insert({ request_id: requestRow.id, event_type: 'email_send_attempted', metadata: { to: member_email, is_test: !!is_test }, created_by: userId });

    const envReplyTo = Deno.env.get('EMAIL_REPLY_TO') || '';
    const replyTo = ((templateRow as any).reply_to_email && String((templateRow as any).reply_to_email).trim()) || envReplyTo || '';
    const companyName = templateRow.party_a_name || "India Photographers' Club";
    const supportEmail = replyTo || Deno.env.get('EMAIL_FROM_ADDRESS') || (templateRow.from_email ? String(templateRow.from_email) : '');
    const expiryDate = new Date(expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    const resolvedProgram = program_name || templateRow.program_name || 'IPC Diamond Membership';
    const vars = {
      member_name: String(member_name),
      program_name: String(resolvedProgram),
      signing_link: signingLink,
      expiry_days: String(expiryDays),
      expiry_date: expiryDate,
      company_name: companyName,
      support_email: supportEmail,
    };

    const subject = renderTemplate(templateRow.email_subject || '', vars).trim();
    const bodyText = renderTemplate(templateRow.email_body || '', vars).trim();
    if (!subject) return fail('SUBJECT_NOT_RENDERED', 'Email subject could not be rendered.');
    if (!bodyText) return fail('BODY_NOT_RENDERED', 'Email body could not be rendered.');
    if (bodyText.includes('{{signing_link}}') || !bodyText.includes(signingLink)) return fail('SIGNING_LINK_NOT_RENDERED', 'The signing link was not rendered into the email body.');
    const unresolved = [...findUnresolvedVars(subject), ...findUnresolvedVars(bodyText)];
    if (unresolved.length) return fail('EMAIL_VARIABLE_NOT_RESOLVED', `Email still contains unresolved variables: ${unresolved.join(', ')}`, { unresolved });

    const htmlLines = bodyText.split('\n').map((line: string) => line.trim() ? `<p style="font-size:14px;line-height:1.6;margin:0 0 12px">${escapeHtml(line)}</p>` : '<div style="height:8px"></div>').join('');
    const htmlBody = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f6f7f9;padding:24px;color:#111">
<div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:28px">
${is_test ? '<div style="background:#fef3c7;border:1px solid #fcd34d;color:#92400e;padding:8px 12px;border-radius:6px;font-size:12px;margin-bottom:16px">TEST EMAIL — this creates a real test signing request.</div>' : ''}
<h2 style="margin:0 0 8px;font-size:18px">${escapeHtml(templateRow.document_title || 'Code of Conduct')}</h2>
<p style="color:#475569;font-size:13px;margin:0 0 20px">${escapeHtml(companyName)}</p>
${htmlLines}
<p style="margin:24px 0"><a href="${signingLink}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:14px;font-weight:600">Complete Your Access Steps</a></p>
<p style="font-size:11.5px;color:#94a3b8;margin:20px 0 0">If the button does not work, copy this link: <br/>${signingLink}</p>
<p style="font-size:11.5px;color:#94a3b8;margin:8px 0 0">This link expires on ${escapeHtml(expiryDate)}.</p>
</div></body></html>`;

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const envFromEmail = Deno.env.get('EMAIL_FROM_ADDRESS') || '';
    const envFromName = Deno.env.get('EMAIL_FROM_NAME') || '';
    const fromEmail = (templateRow.from_email && String(templateRow.from_email).trim()) || envFromEmail;
    const fromName = (templateRow.from_name && String(templateRow.from_name).trim()) || envFromName || 'IPC Control Center';

    const recordSetupError = async (code: string, msg: string) => {
      if (requestRow) {
        await admin.from('code_of_conduct_requests').update({ last_email_error: msg, last_email_error_code: code, email_error: msg }).eq('id', requestRow.id);
        await admin.from('code_of_conduct_events').insert({ request_id: requestRow.id, event_type: 'email_failed', metadata: { error_code: code, error: msg }, created_by: userId });
      }
    };

    if (!RESEND_API_KEY) {
      const msg = 'RESEND_API_KEY is not configured. Please add it in secure secrets.';
      await recordSetupError('MISSING_RESEND_API_KEY', msg);
      return fail('MISSING_RESEND_API_KEY', msg);
    }
    if (!fromEmail) {
      const msg = 'Sender email is not configured. Please add EMAIL_FROM_ADDRESS in secure secrets (or set a template From email).';
      await recordSetupError('MISSING_EMAIL_FROM_ADDRESS', msg);
      return fail('MISSING_EMAIL_FROM_ADDRESS', msg);
    }
    if (!fromName) {
      const msg = 'Sender name is not configured. Please add EMAIL_FROM_NAME in secure secrets.';
      await recordSetupError('MISSING_EMAIL_FROM_NAME', msg);
      return fail('MISSING_EMAIL_FROM_NAME', msg);
    }

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: [member_email],
        subject: is_test ? `[TEST] ${subject}` : subject,
        html: htmlBody,
        text: bodyText,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });

    const respText = await resp.text();
    let respJson: any = null;
    try { respJson = JSON.parse(respText); } catch { /* keep text */ }

    if (!resp.ok) {
      const errMsg: string = respJson?.message || respJson?.error || respText || `Resend HTTP ${resp.status}`;
      let code = 'EMAIL_PROVIDER_REJECTED';
      const lower = errMsg.toLowerCase();
      if (lower.includes('domain') && (lower.includes('verif') || lower.includes('not found'))) code = 'RESEND_DOMAIN_NOT_VERIFIED';
      else if (lower.includes('from') || lower.includes('sender')) code = 'RESEND_DOMAIN_NOT_VERIFIED';
      else if (lower.includes('invalid') && lower.includes('api')) code = 'MISSING_RESEND_API_KEY';
      if (requestRow) {
        await admin.from('code_of_conduct_requests').update({ last_email_error: errMsg, last_email_error_code: code, email_error: errMsg }).eq('id', requestRow.id);
        await admin.from('code_of_conduct_events').insert({ request_id: requestRow.id, event_type: 'email_failed', metadata: { error_code: code, error: errMsg, status: resp.status }, created_by: userId });
      }
      return fail(code, errMsg, { provider_status: resp.status }, 502);
    }

    const providerMessageId = respJson?.id || null;
    if (requestRow) {
      await admin.from('code_of_conduct_requests').update({
        status: 'sent',
        sent_at: nowIso,
        provider_message_id: providerMessageId,
        last_email_error: null,
        last_email_error_code: null,
        email_error: null,
      }).eq('id', requestRow.id);
      await admin.from('code_of_conduct_events').insert({ request_id: requestRow.id, event_type: 'email_sent', metadata: { to: member_email, provider_message_id: providerMessageId, is_test: !!is_test }, created_by: userId });
      if (!is_test && paid_pipeline_lead_id) await admin.from('paid_pipeline_leads').update({ code_of_conduct_status: 'sent', code_of_conduct_request_id: requestRow.id, code_of_conduct_sent_at: nowIso }).eq('id', paid_pipeline_lead_id);
      if (!is_test && crm_lead_id) await admin.from('leads').update({ code_of_conduct_status: 'sent', code_of_conduct_request_id: requestRow.id, code_of_conduct_sent_at: nowIso }).eq('id', crm_lead_id);
    }

    return jsonResponse({ ok: true, request_id: requestRow?.id || null, status: 'sent', recipient_email: member_email, signing_url: signingLink, provider_message_id: providerMessageId, sent_at: nowIso, is_test: !!is_test });
  } catch (e) {
    console.error('send-code-of-conduct-email error', e);
    const msg = (e as Error)?.message || 'Unknown error';
    try {
      if (admin && requestRow) {
        await admin.from('code_of_conduct_requests').update({ last_email_error: msg, last_email_error_code: 'UNKNOWN_EDGE_ERROR', email_error: msg }).eq('id', requestRow.id);
        await admin.from('code_of_conduct_events').insert({ request_id: requestRow.id, event_type: 'email_failed', metadata: { error_code: 'UNKNOWN_EDGE_ERROR', error: msg }, created_by: userId });
      }
    } catch { /* swallow */ }
    return fail('UNKNOWN_EDGE_ERROR', msg, null, 500);
  }
});