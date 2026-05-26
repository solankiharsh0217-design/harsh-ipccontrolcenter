import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function publicError(error_code: string, message: string, status = 400, extra: Record<string, unknown> = {}) {
  return jsonResponse({ ok: false, error_code, error: message, message, ...extra }, status);
}

function escapeHtml(s: any) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function extractBucketPath(publicOrAnyUrl: string | null, bucket = 'code-of-conduct'): string | null {
  if (!publicOrAnyUrl) return null;
  const re = new RegExp(`/storage/v1/object/(?:public|sign)/${bucket}/([^?]+)`);
  const m = publicOrAnyUrl.match(re);
  return m ? decodeURIComponent(m[1]) : null;
}

async function resolvePdfUrl(admin: any, rawUrl: string | null): Promise<string | null> {
  if (!rawUrl) return null;
  const path = extractBucketPath(rawUrl, 'code-of-conduct');
  if (!path) return rawUrl;
  const { data } = await admin.storage.from('code-of-conduct').createSignedUrl(path, 60 * 60);
  return data?.signedUrl || null;
}

async function resolveSignedReceiptUrl(admin: any, rawUrl: string | null): Promise<string | null> {
  if (!rawUrl) return null;
  const path = extractBucketPath(rawUrl, 'signed-code-of-conduct');
  if (!path) return rawUrl;
  const { data } = await admin.storage.from('signed-code-of-conduct').createSignedUrl(path, 60 * 60 * 24 * 7);
  return data?.signedUrl || null;
}

function publicRequestPayload(r: any, t: any, signedPdfUrl: string | null, signedReceiptHtmlUrl: string | null) {
  return {
    ok: true,
    request: {
      id: r.id,
      status: r.status,
      member_name: r.member_name,
      member_email: r.member_email,
      program_name: r.program_name,
      sent_at: r.sent_at,
      viewed_at: r.viewed_at,
      signed_at: r.signed_at,
      token_expires_at: r.token_expires_at,
      whatsapp_redirect_url_visible: r.status === 'signed' ? (t?.whatsapp_redirect_url || null) : null,
      signed_receipt_url: r.status === 'signed' ? signedReceiptHtmlUrl : null,
    },
    template: t ? {
      name: t.name,
      document_title: t.document_title,
      program_name: t.program_name,
      version: t.version,
      party_a_name: t.party_a_name,
      template_pdf_url: signedPdfUrl,
      html_content: t.html_content,
      success_page_message: t.success_page_message,
    } : null,
  };
}

async function loadRequest(admin: any, token: string, req: Request) {
  if (!token || typeof token !== 'string' || token.length < 32 || token.length > 256 || !/^[A-Za-z0-9._~:-]+$/.test(token)) {
    return { error: publicError('INVALID_TOKEN', 'Invalid token', 400) };
  }
  const tokenHash = await sha256(token);
  const { data: reqRow, error } = await admin.from('code_of_conduct_requests').select('*').eq('token_hash', tokenHash).maybeSingle();
  if (error) throw error;
  if (!reqRow) {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('cf-connecting-ip') || null;
    const ua = req.headers.get('user-agent') || null;
    await admin.from('code_of_conduct_events').insert({ request_id: null, event_type: 'invalid_signing_link_opened', metadata: { token_hash: tokenHash, ip, ua } });
    return { error: publicError('REQUEST_NOT_FOUND', 'Link not found or invalid.', 404) };
  }
  if (reqRow.status === 'cancelled') return { error: publicError('REQUEST_CANCELLED', 'This request is no longer active.', 410, { status: 'cancelled' }) };
  if (reqRow.token_expires_at && new Date(reqRow.token_expires_at) < new Date() && reqRow.status !== 'signed') {
    if (reqRow.status !== 'expired') {
      await admin.from('code_of_conduct_requests').update({ status: 'expired' }).eq('id', reqRow.id);
      await admin.from('code_of_conduct_events').insert({ request_id: reqRow.id, event_type: 'request_expired' });
      if (reqRow.paid_pipeline_lead_id) await admin.from('paid_pipeline_leads').update({ code_of_conduct_status: 'expired' }).eq('id', reqRow.paid_pipeline_lead_id);
      if (reqRow.crm_lead_id) await admin.from('leads').update({ code_of_conduct_status: 'expired' }).eq('id', reqRow.crm_lead_id);
    }
    return { error: publicError('TOKEN_EXPIRED', 'This link has expired. Please contact Team IPC.', 410, { status: 'expired' }) };
  }
  return { reqRow };
}

function buildReceiptHtml(opts: {
  r: any; t: any; ip: string | null; ua: string | null; acks: string[]; signature_data_url: string | null;
}) {
  const { r, t, ip, ua, acks, signature_data_url } = opts;
  const signedAt = r.signed_at ? new Date(r.signed_at).toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'medium' }) : '—';
  const ackList = acks.map((label, i) => `<li>${escapeHtml(label)} <span style="color:#16a34a;font-weight:600">✓</span></li>`).join('');
  const sigBlock = signature_data_url
    ? `<img src="${signature_data_url}" alt="Signature" style="max-width:280px;max-height:120px;border:1px solid #e5e7eb;border-radius:6px;padding:6px;background:#fff"/>`
    : `<div style="color:#94a3b8;font-size:12px">No drawn signature provided.</div>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><title>Signed Acknowledgement Receipt — ${escapeHtml(r.member_name)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  @page { size: A4; margin: 18mm; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; background:#f8fafc; color:#0f172a; margin:0; padding:24px; }
  .paper { max-width: 780px; margin: 0 auto; background:#fff; border:1px solid #e2e8f0; border-radius:14px; padding:36px 40px; box-shadow:0 1px 4px rgba(15,23,42,.04); }
  h1 { font-size:20px; margin:0 0 4px; }
  .sub { color:#64748b; font-size:13px; margin:0 0 24px; }
  h2 { font-size:13px; text-transform:uppercase; letter-spacing:.06em; color:#475569; margin:24px 0 8px; }
  table { width:100%; border-collapse:collapse; font-size:13px; }
  td { padding:6px 0; vertical-align:top; }
  td.k { color:#64748b; width:35%; }
  td.v { color:#0f172a; font-weight:500; word-break:break-word; }
  ul { padding-left:18px; margin:4px 0; font-size:13px; line-height:1.55; }
  .footer { margin-top:32px; padding-top:16px; border-top:1px solid #e2e8f0; font-size:11.5px; color:#94a3b8; line-height:1.55; }
  .stamp { display:inline-block; padding:4px 10px; border-radius:999px; background:#dcfce7; color:#166534; font-size:11px; font-weight:600; letter-spacing:.04em; }
  @media print { body { background:#fff; padding:0; } .paper { box-shadow:none; border:none; } }
</style></head>
<body><div class="paper">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
    <div>
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#64748b">${escapeHtml(t?.party_a_name || "India Photographers' Club")}</div>
      <h1>${escapeHtml(t?.document_title || 'Code of Conduct')} — Signed Acknowledgement Receipt</h1>
    </div>
    <div class="stamp">SIGNED</div>
  </div>
  <p class="sub">${escapeHtml(t?.program_name || r.program_name || 'IPC Diamond Membership')} · Template v${escapeHtml(t?.version || r.template_version || '1.0')}${t?.name ? ` (${escapeHtml(t.name)})` : ''}</p>

  <h2>Member Details</h2>
  <table>
    <tr><td class="k">Member name</td><td class="v">${escapeHtml(r.signed_member_name || r.member_name)}</td></tr>
    <tr><td class="k">Member email (used for signing)</td><td class="v">${escapeHtml(r.signed_member_email || r.member_email)}</td></tr>
    ${r.member_phone ? `<tr><td class="k">Member phone</td><td class="v">${escapeHtml(r.member_phone)}</td></tr>` : ''}
    ${r.paid_pipeline_lead_id ? `<tr><td class="k">Paid pipeline lead</td><td class="v">${escapeHtml(r.paid_pipeline_lead_id)}</td></tr>` : ''}
    ${r.crm_lead_id ? `<tr><td class="k">Calling CRM lead</td><td class="v">${escapeHtml(r.crm_lead_id)}</td></tr>` : ''}
    <tr><td class="k">Request ID</td><td class="v">${escapeHtml(r.id)}</td></tr>
  </table>

  <h2>Signature Evidence</h2>
  <table>
    <tr><td class="k">Signed at</td><td class="v">${escapeHtml(signedAt)}</td></tr>
    <tr><td class="k">Typed signature name</td><td class="v">${escapeHtml(r.signature_name || '—')}</td></tr>
    <tr><td class="k">IP address</td><td class="v">${escapeHtml(ip || r.acknowledgement_ip || '—')}</td></tr>
    <tr><td class="k">User agent</td><td class="v" style="font-size:11.5px;color:#475569">${escapeHtml(ua || r.acknowledgement_user_agent || '—')}</td></tr>
    <tr><td class="k">Acknowledgement checkbox</td><td class="v">${r.acknowledgement_checkbox ? 'Confirmed' : 'Not confirmed'}</td></tr>
  </table>
  <div style="margin-top:12px">${sigBlock}</div>

  <h2>Acknowledgement Checklist</h2>
  <ul>${ackList}</ul>

  ${t?.template_pdf_url ? `<h2>Original Agreement Document</h2><p style="font-size:12.5px"><a href="${escapeHtml(t.template_pdf_url)}" style="color:#2563eb;text-decoration:underline">View original PDF reference</a></p>` : ''}

  <div class="footer">
    This receipt confirms that the member acknowledged the Code of Conduct
    digitally through the secure IPC signing link. The typed name, drawn
    signature (if provided), IP address, user agent, timestamp and
    acknowledgement checklist above are stored as evidence of this
    acknowledgement. This is a digital acknowledgement record and is not a
    substitute for legal counsel.
  </div>
</div></body></html>`;
}

async function generateAndStoreReceipt(admin: any, reqRow: any, tpl: any, ip: string | null, ua: string | null) {
  const ackLabels = Array.isArray(reqRow.acknowledgement_checklist) ? reqRow.acknowledgement_checklist : [
    "I have read and understood the Code of Conduct.",
    "I agree to the responsibilities and terms of the Diamond Membership.",
    "I understand that group/program access may be provided only after acknowledgement.",
    "I confirm that the name and email shown belong to me.",
  ];
  await admin.from('code_of_conduct_events').insert({ request_id: reqRow.id, event_type: 'signed_receipt_generation_started' });
  try {
    const html = buildReceiptHtml({ r: reqRow, t: tpl, ip, ua, acks: ackLabels, signature_data_url: reqRow.signature_data_url });
    const path = `${reqRow.id}/signed-receipt.html`;
    const { error: upErr } = await admin.storage.from('signed-code-of-conduct').upload(path, new Blob([html], { type: 'text/html' }), { upsert: true, contentType: 'text/html; charset=utf-8' });
    if (upErr) throw upErr;
    const storedUrl = `storage:signed-code-of-conduct/${path}`;
    const nowIso = new Date().toISOString();
    await admin.from('code_of_conduct_requests').update({
      signed_html_url: storedUrl,
      signed_receipt_url: storedUrl,
      signed_receipt_generated_at: nowIso,
    }).eq('id', reqRow.id);
    await admin.from('code_of_conduct_events').insert({ request_id: reqRow.id, event_type: 'signed_receipt_generated', metadata: { path } });
    return { ok: true, path, storedUrl };
  } catch (e) {
    await admin.from('code_of_conduct_events').insert({ request_id: reqRow.id, event_type: 'signed_receipt_generation_failed', metadata: { error: (e as Error).message } });
    return { ok: false, error: (e as Error).message };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  let admin: any = null;
  let activeRequest: any = null;
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    admin = createClient(SUPABASE_URL, SERVICE);

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const url = new URL(req.url);
    const token = body.token || url.searchParams.get('token');
    const action = body.action || url.searchParams.get('action') || (req.method === 'POST' ? 'sign' : 'fetch');

    const loaded = await loadRequest(admin, token, req);
    if (loaded.error) return loaded.error;
    activeRequest = loaded.reqRow;
    const reqRow = activeRequest;

    let tpl: any = null;
    if (reqRow.template_id) {
      const { data } = await admin.from('code_of_conduct_templates').select('*').eq('id', reqRow.template_id).maybeSingle();
      tpl = data;
    }
    if (!tpl) {
      await admin.from('code_of_conduct_events').insert({ request_id: reqRow.id, event_type: `${action}_failed`, metadata: { error_code: 'TEMPLATE_NOT_FOUND' } });
      return publicError('TEMPLATE_NOT_FOUND', 'The Code of Conduct template is no longer available.', 404);
    }

    if (action === 'fetch') {
      if (reqRow.status === 'sent') {
        const now = new Date().toISOString();
        await admin.from('code_of_conduct_requests').update({ status: 'viewed', viewed_at: now }).eq('id', reqRow.id);
        await admin.from('code_of_conduct_events').insert({ request_id: reqRow.id, event_type: 'link_opened' });
        await admin.from('code_of_conduct_events').insert({ request_id: reqRow.id, event_type: 'document_viewed' });
        if (reqRow.paid_pipeline_lead_id) await admin.from('paid_pipeline_leads').update({ code_of_conduct_status: 'viewed' }).eq('id', reqRow.paid_pipeline_lead_id);
        if (reqRow.crm_lead_id) await admin.from('leads').update({ code_of_conduct_status: 'viewed' }).eq('id', reqRow.crm_lead_id);
        reqRow.status = 'viewed';
        reqRow.viewed_at = now;
      } else {
        await admin.from('code_of_conduct_events').insert({ request_id: reqRow.id, event_type: 'document_viewed' });
      }
      const signedPdf = await resolvePdfUrl(admin, tpl?.template_pdf_url || null);
      if (!signedPdf && !tpl?.html_content) return publicError('DOCUMENT_NOT_FOUND', 'The agreement document is not configured yet.', 404);
      const receiptUrl = await resolveSignedReceiptUrl(admin, reqRow.signed_html_url || reqRow.signed_receipt_url || null);
      return jsonResponse(publicRequestPayload(reqRow, tpl, signedPdf, receiptUrl));
    }

    if (action === 'whatsapp_click') {
      if (reqRow.status !== 'signed') return publicError('ALREADY_SIGNED', 'Not signed yet', 403);
      await admin.from('code_of_conduct_requests').update({ whatsapp_redirect_opened_at: new Date().toISOString() }).eq('id', reqRow.id);
      await admin.from('code_of_conduct_events').insert({ request_id: reqRow.id, event_type: 'redirected_to_whatsapp' });
      return jsonResponse({ ok: true });
    }

    if (action !== 'sign') return publicError('INVALID_ACTION', 'Unsupported action.', 400);

    await admin.from('code_of_conduct_events').insert({ request_id: reqRow.id, event_type: 'sign_attempted' });
    if (reqRow.status === 'signed') {
      const signedPdf = await resolvePdfUrl(admin, tpl?.template_pdf_url || null);
      const receiptUrl = await resolveSignedReceiptUrl(admin, reqRow.signed_html_url || reqRow.signed_receipt_url || null);
      return jsonResponse({ already_signed: true, ...publicRequestPayload(reqRow, tpl, signedPdf, receiptUrl) });
    }

    const signatureName = body.signature_name || body.typed_name;
    const signatureDataUrl = body.signature_data_url || null;
    const acknowledgements = body.acknowledgements || body.acknowledgement_checkbox_values;
    const acknowledgementLabels = Array.isArray(body.acknowledgement_labels) ? body.acknowledgement_labels.slice(0, 12).map((s: any) => String(s).slice(0, 300)) : null;
    if (!signatureName || typeof signatureName !== 'string' || signatureName.trim().length < 2) {
      await admin.from('code_of_conduct_events').insert({ request_id: reqRow.id, event_type: 'sign_failed', metadata: { error_code: 'SIGNATURE_REQUIRED' } });
      return publicError('SIGNATURE_REQUIRED', 'Typed full name is required.', 400);
    }
    if (!acknowledgements || !Array.isArray(acknowledgements) || acknowledgements.length < 4 || acknowledgements.some((b: any) => b !== true)) {
      await admin.from('code_of_conduct_events').insert({ request_id: reqRow.id, event_type: 'sign_failed', metadata: { error_code: 'ACKNOWLEDGEMENT_REQUIRED' } });
      return publicError('ACKNOWLEDGEMENT_REQUIRED', 'All acknowledgements must be checked.', 400);
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('cf-connecting-ip') || null;
    const ua = req.headers.get('user-agent') || null;
    const now = new Date().toISOString();
    const sigTrim = (signatureDataUrl && typeof signatureDataUrl === 'string' && signatureDataUrl.length < 500_000) ? signatureDataUrl : null;
    const trimmedName = signatureName.trim().slice(0, 200);
    const signedEmail = (body.email || reqRow.member_email || '').toString().trim().slice(0, 200);

    const { data: updated, error: updErr } = await admin.from('code_of_conduct_requests').update({
      status: 'signed',
      signed_at: now,
      signature_name: trimmedName,
      signature_data_url: sigTrim,
      acknowledgement_ip: ip,
      acknowledgement_user_agent: ua?.slice(0, 500) || null,
      acknowledgement_email: signedEmail,
      acknowledgement_checkbox: true,
      acknowledgement_checklist: acknowledgementLabels,
      signed_member_email: signedEmail,
      signed_member_name: trimmedName,
    }).eq('id', reqRow.id).select().single();
    if (updErr) throw updErr;

    await admin.from('code_of_conduct_events').insert({ request_id: reqRow.id, event_type: 'signed', metadata: { ip, ua } });
    if (reqRow.paid_pipeline_lead_id) await admin.from('paid_pipeline_leads').update({ code_of_conduct_status: 'signed', code_of_conduct_signed_at: now, code_of_conduct_request_id: reqRow.id }).eq('id', reqRow.paid_pipeline_lead_id);
    if (reqRow.crm_lead_id) await admin.from('leads').update({ code_of_conduct_status: 'signed', code_of_conduct_signed_at: now, code_of_conduct_request_id: reqRow.id }).eq('id', reqRow.crm_lead_id);

    // Generate signed receipt HTML and store it
    const receiptResult = await generateAndStoreReceipt(admin, updated, tpl, ip, ua);

    // Fire-and-forget signed copy email
    try {
      await admin.functions.invoke('send-coc-signed-copy', { body: { request_id: updated.id } });
    } catch (e) { console.warn('signed copy dispatch fail', e); }

    try {
      await admin.from('notifications').insert({
        recipient_role: 'admin',
        module_key: 'paid_pipeline',
        notification_type: 'code_of_conduct_signed',
        title: `${updated.member_name} signed the Code of Conduct`,
        message: 'Ready for Diamond group/access review.',
        entity_type: 'code_of_conduct_request',
        entity_id: updated.id,
        entity_label: updated.member_name,
        priority: 'normal',
        status: 'unread',
        source: 'system',
      });
    } catch (e) { console.warn('notify fail', e); }

    // Re-read after receipt
    const { data: finalRow } = await admin.from('code_of_conduct_requests').select('*').eq('id', updated.id).maybeSingle();
    const signedPdf = await resolvePdfUrl(admin, tpl?.template_pdf_url || null);
    const receiptUrl = await resolveSignedReceiptUrl(admin, finalRow?.signed_html_url || finalRow?.signed_receipt_url || null);
    return jsonResponse({ ...publicRequestPayload(finalRow || updated, tpl, signedPdf, receiptUrl), receipt_generated: receiptResult.ok });
  } catch (e) {
    console.error('code-of-conduct-public error', e);
    try {
      if (admin && activeRequest?.id) await admin.from('code_of_conduct_events').insert({ request_id: activeRequest.id, event_type: 'sign_failed', metadata: { error_code: 'SIGN_SUBMIT_FAILED', error: (e as Error).message } });
    } catch { /* ignore */ }
    return publicError('SIGN_SUBMIT_FAILED', (e as Error).message || 'Server error', 500);
  }
});
