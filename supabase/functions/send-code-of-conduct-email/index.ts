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

const SELECTION_LABELS: Record<string, string> = {
  same_day: 'Same day',
  next_day_or_later: 'Next day or later',
  // Legacy selections kept for historical requests.
  one_day: '1 day',
  two_days: '2 days',
  three_days: '3 days',
  four_to_seven_days: '4–7 days',
  more_than_seven_days: 'More than 7 days',
  custom: 'a custom duration',
};

function humanizeSelection(selection: string | null) {
  if (!selection) return '—';
  return SELECTION_LABELS[selection] || selection.replace(/_/g, ' ');
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
    const { action, request_id, paid_pipeline_lead_id, crm_lead_id, template_id, member_name, member_email, member_phone, program_name, deal_value, origin, is_test, completion, change_variant_for_resend } = body || {};

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
      const previousTokenHash = existing.token_hash && existing.token_hash !== tokenHash ? existing.token_hash : null;
      const previousTokenExpiresAt = previousTokenHash ? new Date(Date.now() + 48 * 3600 * 1000).toISOString() : null;
      const updatePayload: Record<string, unknown> = { token_hash: tokenHash, token_expires_at: expiresAt };
      if (previousTokenHash) {
        updatePayload.previous_token_hash = previousTokenHash;
        updatePayload.previous_token_expires_at = previousTokenExpiresAt;
      }
      const { data: updated, error: updErr } = await admin.from('code_of_conduct_requests').update(updatePayload).eq('id', existing.id).select('id,status,token_expires_at').single();
      if (updErr) return fail('TOKEN_GENERATION_FAILED', updErr.message, updErr, 500);
      const signingLink = `${baseUrl}/code-of-conduct-guide/${token}`;
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

    // ── Completion-time email variant resolution ───────────────────────────
    // First send: the client passes `completion` (selection + condition_key).
    // Resend/retry: the condition saved on the request wins, unless an admin
    // explicitly changes it for this resend.
    const savedConditionKey: string | null = requestRow?.completion_condition_key || null;
    const conditionKey: string | null = change_variant_for_resend
      ? (completion?.condition_key || null)
      : (savedConditionKey || completion?.condition_key || null);

    let variantRow: any = null;
    if (conditionKey) {
      const { data: v } = await admin.from('code_of_conduct_email_variants').select('*').eq('condition_key', conditionKey).maybeSingle();
      if (!v) return fail('NO_MATCHING_EMAIL_VARIANT', 'A matching email template could not be found.', { condition_key: conditionKey });
      if (!v.is_active) return fail('EMAIL_VARIANT_INACTIVE', 'The selected email template is inactive.', { condition_key: conditionKey });
      if (!String(v.subject || '').trim() || !String(v.html_body || '').trim()) {
        return fail('EMAIL_VARIANT_INCOMPLETE', 'The matched Code of Conduct email template is incomplete. Please update it in Admin Center.', { condition_key: conditionKey });
      }
      if (!String(v.html_body).includes('{{signing_link}}')) {
        return fail('EMAIL_VARIANT_MISSING_LINK', 'The template must include the Code of Conduct link.', { condition_key: conditionKey });
      }
      variantRow = v;
    }
    // A resend override (admin-only) uses a different variant for THIS send only —
    // the original first-send snapshot must stay exactly as it was.
    const isResendOverride = !!change_variant_for_resend && !!savedConditionKey;
    if (isResendOverride) {
      const { data: overrideIsAdmin } = await admin.rpc('has_role', { _user_id: userId, _role: 'admin' });
      if (!overrideIsAdmin) return fail('FORBIDDEN', 'Only an admin can change the template for a resend.', null, 403);
      if (!String(completion?.override_reason || '').trim()) {
        return fail('OVERRIDE_REASON_REQUIRED', 'A reason is required to change the template for this resend.');
      }
    }
    // Snapshot timing fields only on the first send. Never rewrite history of a
    // request that already carries a condition.
    const writeTimingSnapshot = !!variantRow && !savedConditionKey;



    const nowIso = new Date().toISOString();
    const expiryDays = Number(templateRow.expiry_days || 7);
    const graceMs = 48 * 3600 * 1000; // old link stays valid for 48h after rotation

    // Reuse the existing token when it is still valid (not expired, not cancelled).
    // Only rotate when there is no token yet, when it is expired, or when admin
    // explicitly changes the recipient email (member_email differs and old token is stale).
    let token: string;
    let tokenHash: string;
    let expiresAt: string;
    let previousTokenHash: string | null = null;
    let previousTokenExpiresAt: string | null = null;
    let reusedExistingToken = false;

    const existingHash: string | null = requestRow?.token_hash || null;
    const existingExpiresAt: string | null = requestRow?.token_expires_at || null;
    const existingStillValid = !!existingHash && (!existingExpiresAt || new Date(existingExpiresAt) > new Date()) && requestRow?.status !== 'cancelled';

    if (existingStillValid) {
      // Cannot reuse the raw token (we only store the hash); keep the same hash and
      // extend expiry. The unchanged token in the previously-sent email keeps working.
      tokenHash = existingHash!;
      token = ''; // signals: reuse — do not build a new URL from a fresh token
      expiresAt = new Date(Date.now() + expiryDays * 24 * 3600 * 1000).toISOString();
      reusedExistingToken = true;
    } else {
      token = randomToken();
      if (!token || token.length < 32) return fail('TOKEN_GENERATION_FAILED', 'Could not generate a secure signing token.', null, 500);
      tokenHash = await sha256(token);
      expiresAt = new Date(Date.now() + expiryDays * 24 * 3600 * 1000).toISOString();
      // Preserve the old hash for a short grace window so any link already delivered still works.
      if (existingHash && existingHash !== tokenHash) {
        previousTokenHash = existingHash;
        previousTokenExpiresAt = new Date(Date.now() + graceMs).toISOString();
      }
    }

    const timingFields: Record<string, unknown> = writeTimingSnapshot ? {
      process_started_at: completion?.process_started_at || null,
      process_completed_at: completion?.process_completed_at || null,
      completion_duration_hours: completion?.duration_hours ?? null,
      completion_duration_days: completion?.duration_days ?? null,
      completion_selection: completion?.selection || null,
      completion_condition_key: variantRow.condition_key,
      email_variant_id: variantRow.id,
      email_variant_version: variantRow.version,
      email_subject_snapshot: variantRow.subject,
      email_body_snapshot: variantRow.html_body,
      timing_override_reason: completion?.override_reason || null,
    } : {};

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
        email_status: 'pending',
        email_sent_to: member_email,
        email_attempt_count: 1,
        created_by: userId,
        ...timingFields,
      }).select().single();
      if (error) return fail('REQUEST_CREATION_FAILED', error.message, error, 500);
      requestRow = data;
      await admin.from('code_of_conduct_events').insert({ request_id: requestRow.id, event_type: 'request_created', metadata: { is_test: !!is_test, condition_key: conditionKey }, created_by: userId });
    } else {
      const nextStatus = requestRow.status === 'signed' ? 'signed' : 'ready_to_send';
      const nextAttempts = Number(requestRow.email_attempt_count || 0) + 1;
      const updatePayload: Record<string, unknown> = {
        token_hash: tokenHash,
        token_expires_at: expiresAt,
        member_name,
        member_email,
        member_phone: member_phone || requestRow.member_phone,
        status: nextStatus,
        last_email_attempt_at: nowIso,
        email_status: 'pending',
        email_sent_to: member_email,
        email_attempt_count: nextAttempts,
        ...timingFields,
      };
      if (previousTokenHash) {
        updatePayload.previous_token_hash = previousTokenHash;
        updatePayload.previous_token_expires_at = previousTokenExpiresAt;
      }
      const { data, error } = await admin.from('code_of_conduct_requests').update(updatePayload).eq('id', requestRow.id).select().single();
      if (error) return fail('REQUEST_CREATION_FAILED', error.message, error, 500);
      requestRow = data;
    }


    // If we reused the existing token we cannot rebuild the raw URL (only hash is stored).
    // In that case we mint a *new* token and record the old hash under previous_token_hash
    // so both the freshly-emailed link and any previously-delivered link resolve.
    if (reusedExistingToken) {
      const freshToken = randomToken();
      const freshHash = await sha256(freshToken);
      const oldHash = requestRow.token_hash;
      const freshExpires = new Date(Date.now() + expiryDays * 24 * 3600 * 1000).toISOString();
      const freshPrevExpires = new Date(Date.now() + graceMs).toISOString();
      const { data: reUpd, error: reUpdErr } = await admin.from('code_of_conduct_requests').update({
        token_hash: freshHash,
        token_expires_at: freshExpires,
        previous_token_hash: oldHash,
        previous_token_expires_at: freshPrevExpires,
      }).eq('id', requestRow.id).select().single();
      if (reUpdErr) return fail('TOKEN_GENERATION_FAILED', reUpdErr.message, reUpdErr, 500);
      requestRow = reUpd;
      token = freshToken;
      tokenHash = freshHash;
    }


    // The new destination is the guided page (video gate + signature + group join).
    // The old direct signature route `/code-of-conduct/sign/${token}` still works
    // with the same token for backward compatibility.
    const signingLink = `${baseUrl}/code-of-conduct-guide/${token}`;
    await admin.from('code_of_conduct_events').insert({ request_id: requestRow.id, event_type: 'token_generated', metadata: { expires_at: expiresAt, is_test: !!is_test }, created_by: userId });
    await admin.from('code_of_conduct_events').insert({ request_id: requestRow.id, event_type: 'email_send_attempted', metadata: { to: member_email, is_test: !!is_test }, created_by: userId });
    if (isResendOverride) {
      await admin.from('code_of_conduct_events').insert({
        request_id: requestRow.id,
        event_type: 'email_variant_override_resend',
        metadata: {
          original_condition_key: savedConditionKey,
          original_variant_version: requestRow.email_variant_version ?? null,
          override_condition_key: variantRow?.condition_key ?? null,
          override_variant_id: variantRow?.id ?? null,
          override_variant_version: variantRow?.version ?? null,
          reason: String(completion?.override_reason || '').slice(0, 300),
        },
        created_by: userId,
      });
    }

    const envReplyTo = Deno.env.get('EMAIL_REPLY_TO') || '';
    const replyTo = ((templateRow as any).reply_to_email && String((templateRow as any).reply_to_email).trim()) || envReplyTo || '';
    const companyName = templateRow.party_a_name || "India Photographers' Club";
    const supportEmail = replyTo || Deno.env.get('EMAIL_FROM_ADDRESS') || (templateRow.from_email ? String(templateRow.from_email) : '');
    const expiryDate = new Date(expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    const resolvedProgram = program_name || templateRow.program_name || 'IPC Diamond Membership';
    const completionTimeLabel = humanizeSelection(requestRow?.completion_selection || completion?.selection || null);
    const completionConditionLabel = variantRow?.condition_name
      || (requestRow?.completion_condition_key === 'completed_within_1_day' ? 'Completed Within 1 Day'
        : requestRow?.completion_condition_key === 'completed_after_1_day' ? 'Completed After 1 Day' : '—');
    const vars = {
      member_name: String(member_name),
      program_name: String(resolvedProgram),
      signing_link: signingLink,
      expiry_days: String(expiryDays),
      expiry_date: expiryDate,
      company_name: companyName,
      support_email: supportEmail,
      completion_time: completionTimeLabel,
      completion_condition: completionConditionLabel,
    };

    // Resends reuse the exact snapshot captured on the original send, so later
    // template edits never rewrite an already-sent request's copy.
    const useSnapshot = !writeTimingSnapshot && !isResendOverride && !!requestRow?.email_body_snapshot;
    const rawSubject = useSnapshot ? String(requestRow.email_subject_snapshot || '')
      : variantRow ? String(variantRow.subject || '')
      : String(templateRow.email_subject || '');
    const rawBody = useSnapshot ? String(requestRow.email_body_snapshot || '')
      : variantRow ? String(variantRow.html_body || '')
      : String(templateRow.email_body || '');

    const subject = renderTemplate(rawSubject, vars).trim();
    const bodyText = renderTemplate(rawBody, vars).trim();

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
        await admin.from('code_of_conduct_requests').update({
          last_email_error: msg,
          last_email_error_code: code,
          email_error: msg,
          email_status: 'failed',
          email_last_error_at: nowIso,
        }).eq('id', requestRow.id);
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
        await admin.from('code_of_conduct_requests').update({
          last_email_error: errMsg,
          last_email_error_code: code,
          email_error: errMsg,
          email_status: 'failed',
          email_last_error_at: nowIso,
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
        email_status: 'sent',
        email_sent_at: nowIso,
        email_sent_to: member_email,
      }).eq('id', requestRow.id);
      await admin.from('code_of_conduct_events').insert({ request_id: requestRow.id, event_type: 'email_sent', metadata: { to: member_email, provider_message_id: providerMessageId, is_test: !!is_test }, created_by: userId });
      if (!is_test && paid_pipeline_lead_id) await admin.from('paid_pipeline_leads').update({ code_of_conduct_status: 'sent', code_of_conduct_request_id: requestRow.id, code_of_conduct_sent_at: nowIso }).eq('id', paid_pipeline_lead_id);
      if (!is_test && crm_lead_id) await admin.from('leads').update({ code_of_conduct_status: 'sent', code_of_conduct_request_id: requestRow.id, code_of_conduct_sent_at: nowIso }).eq('id', crm_lead_id);
    }

    return jsonResponse({
      ok: true,
      request_id: requestRow?.id || null,
      status: 'sent',
      recipient_email: member_email,
      signing_url: signingLink,
      provider_message_id: providerMessageId,
      sent_at: nowIso,
      is_test: !!is_test,
      condition_key: requestRow?.completion_condition_key || conditionKey || null,
      condition_name: completionConditionLabel,
      email_variant_id: isResendOverride ? (variantRow?.id || null) : (requestRow?.email_variant_id || variantRow?.id || null),
      email_variant_version: isResendOverride ? (variantRow?.version || null) : (requestRow?.email_variant_version || variantRow?.version || null),
      used_snapshot: useSnapshot,
      resend_override_condition_key: isResendOverride ? (variantRow?.condition_key || null) : null,
    });

  } catch (e) {
    console.error('send-code-of-conduct-email error', e);
    const msg = (e as Error)?.message || 'Unknown error';
    try {
      if (admin && requestRow) {
        await admin.from('code_of_conduct_requests').update({
          last_email_error: msg,
          last_email_error_code: 'UNKNOWN_EDGE_ERROR',
          email_error: msg,
          email_status: 'failed',
          email_last_error_at: new Date().toISOString(),
        }).eq('id', requestRow.id);
        await admin.from('code_of_conduct_events').insert({ request_id: requestRow.id, event_type: 'email_failed', metadata: { error_code: 'UNKNOWN_EDGE_ERROR', error: msg }, created_by: userId });
      }
    } catch { /* swallow */ }
    return fail('UNKNOWN_EDGE_ERROR', msg, null, 500);
  }
});