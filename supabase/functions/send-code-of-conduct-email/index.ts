import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function randomToken() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function fail(error_code: string, message: string, details?: unknown, status = 400) {
  return jsonResponse({ ok: false, error_code, message, details: details ?? null }, status);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  let admin: any = null;
  let requestRow: any = null;
  let userId: string | null = null;

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return fail('UNAUTHORIZED', 'Missing or invalid Authorization header', null, 401);
    }
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: claims, error: claimErr } = await userClient.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (claimErr || !claims?.claims?.sub) {
      return fail('UNAUTHORIZED', 'Invalid session', null, 401);
    }
    userId = claims.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const {
      action,
      request_id,
      paid_pipeline_lead_id,
      crm_lead_id,
      template_id,
      member_name,
      member_email,
      member_phone,
      program_name,
      deal_value,
      origin,
      is_test,
    } = body || {};

    // Lightweight diagnostics — no secret values leaked.
    if (action === 'diagnostics') {
      const diagAdmin = createClient(SUPABASE_URL, SERVICE);
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
      return jsonResponse({
        ok: true,
        provider: 'resend',
        has_resend_api_key: !!Deno.env.get('RESEND_API_KEY'),
        has_email_from_address: !!envFrom,
        has_email_from_name: !!envName,
        has_email_reply_to: !!envReply,
        resolved_from_email: resolvedFromEmail,
        resolved_from_name: resolvedFromName,
        resolved_reply_to: resolvedReplyTo,
        sender_source: tpl?.from_email ? 'template' : (envFrom ? 'secret' : 'none'),
        template: tpl || null,
        last_attempt: lastReq || null,
      });
    }

    if (!member_email || typeof member_email !== 'string' || !member_email.includes('@')) {
      return fail('MISSING_RECIPIENT_EMAIL', 'A valid recipient email is required.');
    }
    if (!member_name) {
      return fail('MISSING_RECIPIENT_EMAIL', 'Member name is required.');
    }

    admin = createClient(SUPABASE_URL, SERVICE);

    // Resolve template
    let templateRow: any = null;
    if (template_id) {
      const { data } = await admin.from('code_of_conduct_templates').select('*').eq('id', template_id).maybeSingle();
      templateRow = data;
    }
    if (!templateRow) {
      const { data } = await admin.from('code_of_conduct_templates').select('*').eq('is_active', true).order('created_at', { ascending: false }).limit(1).maybeSingle();
      templateRow = data;
    }
    if (!templateRow) {
      return fail('NO_TEMPLATE_CONFIGURED', 'No active Code of Conduct template configured. Add one in Admin Center → Code of Conduct.');
    }
    if (!templateRow.email_subject || !templateRow.email_body) {
      return fail('TEMPLATE_MISSING_EMAIL_BODY', 'Template is missing email subject or body.');
    }
    if (!templateRow.from_email) {
      return fail('MISSING_FROM_EMAIL', 'Template has no From email configured.');
    }

    // Find or reuse request (skip for test sends)
    if (!is_test) {
      if (request_id) {
        const { data } = await admin.from('code_of_conduct_requests').select('*').eq('id', request_id).maybeSingle();
        requestRow = data;
      }
      if (!requestRow && (paid_pipeline_lead_id || crm_lead_id)) {
        let q = admin.from('code_of_conduct_requests').select('*').eq('template_id', templateRow.id).in('status', ['draft','ready_to_send','sent','viewed']);
        if (paid_pipeline_lead_id) q = q.eq('paid_pipeline_lead_id', paid_pipeline_lead_id);
        else q = q.eq('crm_lead_id', crm_lead_id);
        const { data } = await q.order('created_at', { ascending: false }).limit(1);
        if (data && data.length) requestRow = data[0];
      }
    }

    const token = randomToken();
    const tokenHash = await sha256(token);
    const expiryDays = templateRow.expiry_days || 7;
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 3600 * 1000).toISOString();
    const nowIso = new Date().toISOString();

    if (!is_test) {
      if (!requestRow) {
        const { data, error } = await admin.from('code_of_conduct_requests').insert({
          template_id: templateRow.id,
          template_version: templateRow.version,
          crm_lead_id: crm_lead_id || null,
          paid_pipeline_lead_id: paid_pipeline_lead_id || null,
          member_name, member_email, member_phone: member_phone || null,
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
        await admin.from('code_of_conduct_events').insert({ request_id: requestRow.id, event_type: 'request_created', created_by: userId });
      } else {
        const { data, error } = await admin.from('code_of_conduct_requests').update({
          token_hash: tokenHash,
          token_expires_at: expiresAt,
          member_name, member_email, member_phone: member_phone || requestRow.member_phone,
          status: 'ready_to_send',
          last_email_attempt_at: nowIso,
        }).eq('id', requestRow.id).select().single();
        if (error) return fail('REQUEST_CREATION_FAILED', error.message, error, 500);
        requestRow = data;
      }
      await admin.from('code_of_conduct_events').insert({ request_id: requestRow.id, event_type: 'email_send_attempted', metadata: { to: member_email }, created_by: userId });
    }

    const baseUrl = (origin || req.headers.get('origin') || '').replace(/\/$/, '');
    const signingLink = is_test ? `${baseUrl}/code-of-conduct/sign/${token}` : `${baseUrl}/code-of-conduct/sign/${token}`;
    const expiryDate = new Date(expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    const companyName = templateRow.party_a_name || "India Photographers' Club";

    const subject = (templateRow.email_subject || '')
      .replaceAll('{{member_name}}', member_name)
      .replaceAll('{{program_name}}', templateRow.program_name || '')
      .replaceAll('{{company_name}}', companyName);

    const bodyText = (templateRow.email_body || '')
      .replaceAll('{{member_name}}', member_name)
      .replaceAll('{{program_name}}', templateRow.program_name || 'IPC Diamond Membership')
      .replaceAll('{{signing_link}}', signingLink)
      .replaceAll('{{expiry_date}}', expiryDate)
      .replaceAll('{{company_name}}', companyName);

    const htmlBody = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f6f7f9;padding:24px;color:#111">
<div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:28px">
${is_test ? '<div style="background:#fef3c7;border:1px solid #fcd34d;color:#92400e;padding:8px 12px;border-radius:6px;font-size:12px;margin-bottom:16px">TEST EMAIL — link is for diagnostics only</div>' : ''}
<h2 style="margin:0 0 8px;font-size:18px">${templateRow.document_title || 'Code of Conduct'}</h2>
<p style="color:#475569;font-size:13px;margin:0 0 20px">${companyName}</p>
${bodyText.split('\n').map((l: string) => l.includes(signingLink) ? '' : `<p style="font-size:14px;line-height:1.6;margin:0 0 12px">${l.replace(/</g,'&lt;')}</p>`).join('')}
<p style="margin:24px 0"><a href="${signingLink}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:14px;font-weight:600">Review & Sign</a></p>
<p style="font-size:11.5px;color:#94a3b8;margin:20px 0 0">If the button does not work, copy this link: <br/>${signingLink}</p>
<p style="font-size:11.5px;color:#94a3b8;margin:8px 0 0">This link expires on ${expiryDate}.</p>
</div></body></html>`;

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const fromEmail = templateRow.from_email;
    const fromName = templateRow.from_name || 'IPC Control Center';

    if (!RESEND_API_KEY) {
      const msg = 'RESEND_API_KEY is not configured in backend secrets.';
      if (requestRow) {
        await admin.from('code_of_conduct_requests').update({ last_email_error: msg, last_email_error_code: 'MISSING_RESEND_API_KEY', email_error: msg }).eq('id', requestRow.id);
        await admin.from('code_of_conduct_events').insert({ request_id: requestRow.id, event_type: 'email_failed', metadata: { error_code: 'MISSING_RESEND_API_KEY', error: msg }, created_by: userId });
      }
      return fail('MISSING_RESEND_API_KEY', msg, null, 400);
    }

    const replyTo = (templateRow as any).reply_to_email || undefined;
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
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
        await admin.from('code_of_conduct_requests').update({
          last_email_error: errMsg,
          last_email_error_code: code,
          email_error: errMsg,
        }).eq('id', requestRow.id);
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
      await admin.from('code_of_conduct_events').insert({ request_id: requestRow.id, event_type: 'email_sent', metadata: { to: member_email, provider_message_id: providerMessageId }, created_by: userId });

      if (paid_pipeline_lead_id) {
        await admin.from('paid_pipeline_leads').update({
          code_of_conduct_status: 'sent',
          code_of_conduct_request_id: requestRow.id,
          code_of_conduct_sent_at: nowIso,
        }).eq('id', paid_pipeline_lead_id);
      }
      if (crm_lead_id) {
        await admin.from('leads').update({
          code_of_conduct_status: 'sent',
          code_of_conduct_request_id: requestRow.id,
          code_of_conduct_sent_at: nowIso,
        }).eq('id', crm_lead_id);
      }
    }

    return jsonResponse({
      ok: true,
      request_id: requestRow?.id || null,
      status: 'sent',
      recipient_email: member_email,
      signing_url: is_test ? null : signingLink,
      provider_message_id: providerMessageId,
      sent_at: nowIso,
      is_test: !!is_test,
    });
  } catch (e) {
    console.error('send-code-of-conduct-email error', e);
    const msg = (e as Error)?.message || 'Unknown error';
    try {
      if (admin && requestRow) {
        await admin.from('code_of_conduct_requests').update({
          last_email_error: msg, last_email_error_code: 'UNKNOWN_EDGE_ERROR', email_error: msg,
        }).eq('id', requestRow.id);
        await admin.from('code_of_conduct_events').insert({ request_id: requestRow.id, event_type: 'email_failed', metadata: { error_code: 'UNKNOWN_EDGE_ERROR', error: msg }, created_by: userId });
      }
    } catch { /* swallow */ }
    return fail('UNKNOWN_EDGE_ERROR', msg, null, 500);
  }
});
