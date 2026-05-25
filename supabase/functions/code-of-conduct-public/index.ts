import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function extractBucketPath(publicOrAnyUrl: string | null): string | null {
  if (!publicOrAnyUrl) return null;
  // Matches both .../object/public/code-of-conduct/<path> and .../object/sign/code-of-conduct/<path>
  const m = publicOrAnyUrl.match(/\/storage\/v1\/object\/(?:public|sign)\/code-of-conduct\/([^?]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

async function resolvePdfUrl(admin: any, rawUrl: string | null): Promise<string | null> {
  if (!rawUrl) return null;
  const path = extractBucketPath(rawUrl);
  if (!path) return rawUrl; // external URL, return as-is
  const { data } = await admin.storage.from('code-of-conduct').createSignedUrl(path, 60 * 60); // 1h
  return data?.signedUrl || null;
}

function publicRequestPayload(r: any, t: any, signedPdfUrl: string | null) {
  return {
    request: {
      id: r.id,
      status: r.status,
      member_name: r.member_name,
      member_email: r.member_email,
      program_name: r.program_name,
      sent_at: r.sent_at,
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(SUPABASE_URL, SERVICE);

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const url = new URL(req.url);
    const token = body.token || url.searchParams.get('token');
    const action = body.action || url.searchParams.get('action') || (req.method === 'POST' ? 'sign' : 'fetch');

    if (!token || typeof token !== 'string' || token.length < 32) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const tokenHash = await sha256(token);

    const { data: reqRow, error } = await admin.from('code_of_conduct_requests').select('*').eq('token_hash', tokenHash).maybeSingle();
    if (error || !reqRow) {
      return new Response(JSON.stringify({ error: 'Link not found or invalid.' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (reqRow.status === 'cancelled') {
      return new Response(JSON.stringify({ error: 'This request has been cancelled.', status: 'cancelled' }), { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (reqRow.token_expires_at && new Date(reqRow.token_expires_at) < new Date() && reqRow.status !== 'signed') {
      if (reqRow.status !== 'expired') {
        await admin.from('code_of_conduct_requests').update({ status: 'expired' }).eq('id', reqRow.id);
        await admin.from('code_of_conduct_events').insert({ request_id: reqRow.id, event_type: 'request_expired' });
      }
      return new Response(JSON.stringify({ error: 'This link has expired. Please contact Team IPC.', status: 'expired' }), { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let tpl: any = null;
    if (reqRow.template_id) {
      const { data } = await admin.from('code_of_conduct_templates').select('*').eq('id', reqRow.template_id).maybeSingle();
      tpl = data;
    }

    if (action === 'fetch') {
      // Mark as viewed if first view
      if (reqRow.status === 'sent') {
        const now = new Date().toISOString();
        await admin.from('code_of_conduct_requests').update({ status: 'viewed', viewed_at: now }).eq('id', reqRow.id);
        await admin.from('code_of_conduct_events').insert({ request_id: reqRow.id, event_type: 'link_opened' });
        if (reqRow.paid_pipeline_lead_id) await admin.from('paid_pipeline_leads').update({ code_of_conduct_status: 'viewed' }).eq('id', reqRow.paid_pipeline_lead_id);
        if (reqRow.crm_lead_id) await admin.from('leads').update({ code_of_conduct_status: 'viewed' }).eq('id', reqRow.crm_lead_id);
        reqRow.status = 'viewed';
        reqRow.viewed_at = now;
      }
      return new Response(JSON.stringify(publicRequestPayload(reqRow, tpl)), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'whatsapp_click') {
      if (reqRow.status !== 'signed') {
        return new Response(JSON.stringify({ error: 'Not signed yet' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      await admin.from('code_of_conduct_requests').update({ whatsapp_redirect_opened_at: new Date().toISOString() }).eq('id', reqRow.id);
      await admin.from('code_of_conduct_events').insert({ request_id: reqRow.id, event_type: 'redirected_to_whatsapp' });
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // action === 'sign'
    if (reqRow.status === 'signed') {
      return new Response(JSON.stringify({ ok: true, already_signed: true, ...publicRequestPayload(reqRow, tpl) }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { signature_name, signature_data_url, acknowledgements } = body;
    if (!signature_name || typeof signature_name !== 'string' || signature_name.trim().length < 2) {
      return new Response(JSON.stringify({ error: 'Typed full name is required.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!acknowledgements || !Array.isArray(acknowledgements) || acknowledgements.length < 4 || acknowledgements.some((b: any) => b !== true)) {
      return new Response(JSON.stringify({ error: 'All acknowledgements must be checked.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('cf-connecting-ip') || null;
    const ua = req.headers.get('user-agent') || null;
    const now = new Date().toISOString();

    const sigTrim = (signature_data_url && typeof signature_data_url === 'string' && signature_data_url.length < 500_000) ? signature_data_url : null;

    const { data: updated, error: updErr } = await admin.from('code_of_conduct_requests').update({
      status: 'signed',
      signed_at: now,
      signature_name: signature_name.trim().slice(0, 200),
      signature_data_url: sigTrim,
      acknowledgement_ip: ip,
      acknowledgement_user_agent: ua?.slice(0, 500) || null,
      acknowledgement_email: reqRow.member_email,
      acknowledgement_checkbox: true,
    }).eq('id', reqRow.id).select().single();
    if (updErr) throw updErr;

    await admin.from('code_of_conduct_events').insert({ request_id: reqRow.id, event_type: 'signed', metadata: { ip, ua } });

    if (reqRow.paid_pipeline_lead_id) {
      await admin.from('paid_pipeline_leads').update({
        code_of_conduct_status: 'signed', code_of_conduct_signed_at: now, code_of_conduct_request_id: reqRow.id,
      }).eq('id', reqRow.paid_pipeline_lead_id);
    }
    if (reqRow.crm_lead_id) {
      await admin.from('leads').update({
        code_of_conduct_status: 'signed', code_of_conduct_signed_at: now, code_of_conduct_request_id: reqRow.id,
      }).eq('id', reqRow.crm_lead_id);
    }

    // Notify admins
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

    return new Response(JSON.stringify({ ok: true, ...publicRequestPayload(updated, tpl) }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message || 'Server error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
