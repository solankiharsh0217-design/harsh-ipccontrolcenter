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

function extractBucketPath(publicOrAnyUrl: string | null): string | null {
  if (!publicOrAnyUrl) return null;
  const m = publicOrAnyUrl.match(/\/storage\/v1\/object\/(?:public|sign)\/code-of-conduct\/([^?]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

async function resolvePdfUrl(admin: any, rawUrl: string | null): Promise<string | null> {
  if (!rawUrl) return null;
  const path = extractBucketPath(rawUrl);
  if (!path) return rawUrl;
  const { data } = await admin.storage.from('code-of-conduct').createSignedUrl(path, 60 * 60);
  return data?.signedUrl || null;
}

function publicRequestPayload(r: any, t: any, signedPdfUrl: string | null) {
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
      return jsonResponse(publicRequestPayload(reqRow, tpl, signedPdf));
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
      return jsonResponse({ already_signed: true, ...publicRequestPayload(reqRow, tpl, signedPdf) });
    }

    const signatureName = body.signature_name || body.typed_name;
    const signatureDataUrl = body.signature_data_url || null;
    const acknowledgements = body.acknowledgements || body.acknowledgement_checkbox_values;
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

    const { data: updated, error: updErr } = await admin.from('code_of_conduct_requests').update({
      status: 'signed',
      signed_at: now,
      signature_name: signatureName.trim().slice(0, 200),
      signature_data_url: sigTrim,
      acknowledgement_ip: ip,
      acknowledgement_user_agent: ua?.slice(0, 500) || null,
      acknowledgement_email: body.email || reqRow.member_email,
      acknowledgement_checkbox: true,
    }).eq('id', reqRow.id).select().single();
    if (updErr) throw updErr;

    await admin.from('code_of_conduct_events').insert({ request_id: reqRow.id, event_type: 'signed', metadata: { ip, ua } });
    if (reqRow.paid_pipeline_lead_id) await admin.from('paid_pipeline_leads').update({ code_of_conduct_status: 'signed', code_of_conduct_signed_at: now, code_of_conduct_request_id: reqRow.id }).eq('id', reqRow.paid_pipeline_lead_id);
    if (reqRow.crm_lead_id) await admin.from('leads').update({ code_of_conduct_status: 'signed', code_of_conduct_signed_at: now, code_of_conduct_request_id: reqRow.id }).eq('id', reqRow.crm_lead_id);

    try {
      await admin.from('notifications').insert({
        recipient_role: 'admin',
        module_key: 'paid_pipeline',
        notification_type: 'code_of_conduct_signed',
        title: `${reqRow.member_name} signed the Code of Conduct`,
        message: 'Ready for Diamond group/access review.',
        entity_type: 'code_of_conduct_request',
        entity_id: reqRow.id,
        entity_label: reqRow.member_name,
        priority: 'normal',
        status: 'unread',
        source: 'system',
      });
    } catch (e) { console.warn('notify fail', e); }

    const signedPdf = await resolvePdfUrl(admin, tpl?.template_pdf_url || null);
    return jsonResponse(publicRequestPayload(updated, tpl, signedPdf));
  } catch (e) {
    console.error('code-of-conduct-public error', e);
    try {
      if (admin && activeRequest?.id) await admin.from('code_of_conduct_events').insert({ request_id: activeRequest.id, event_type: 'sign_failed', metadata: { error_code: 'SIGN_SUBMIT_FAILED', error: (e as Error).message } });
    } catch { /* ignore */ }
    return publicError('SIGN_SUBMIT_FAILED', (e as Error).message || 'Server error', 500);
  }
});