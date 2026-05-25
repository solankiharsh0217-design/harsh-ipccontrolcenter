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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: claims, error: claimErr } = await userClient.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (claimErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const userId = claims.claims.sub as string;

    const body = await req.json();
    const {
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
    } = body || {};

    if (!member_email || !member_name) {
      return new Response(JSON.stringify({ error: 'member_name and member_email required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const admin = createClient(SUPABASE_URL, SERVICE);

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
      return new Response(JSON.stringify({ error: 'No active Code of Conduct template configured. Add one in Admin Center → Code of Conduct.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Find or create request
    let requestRow: any = null;
    if (request_id) {
      const { data } = await admin.from('code_of_conduct_requests').select('*').eq('id', request_id).maybeSingle();
      requestRow = data;
    }
    // Duplicate guard: existing non-final request for same lead/template
    if (!requestRow && (paid_pipeline_lead_id || crm_lead_id)) {
      let q = admin.from('code_of_conduct_requests').select('*').eq('template_id', templateRow.id).in('status', ['draft','ready_to_send','sent','viewed']);
      if (paid_pipeline_lead_id) q = q.eq('paid_pipeline_lead_id', paid_pipeline_lead_id);
      else q = q.eq('crm_lead_id', crm_lead_id);
      const { data } = await q.order('created_at', { ascending: false }).limit(1);
      if (data && data.length) requestRow = data[0];
    }

    const token = randomToken();
    const tokenHash = await sha256(token);
    const expiryDays = templateRow.expiry_days || 7;
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 3600 * 1000).toISOString();

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
        created_by: userId,
      }).select().single();
      if (error) throw error;
      requestRow = data;
    } else {
      const { data, error } = await admin.from('code_of_conduct_requests').update({
        token_hash: tokenHash,
        token_expires_at: expiresAt,
        member_name, member_email, member_phone: member_phone || requestRow.member_phone,
        status: 'ready_to_send',
      }).eq('id', requestRow.id).select().single();
      if (error) throw error;
      requestRow = data;
    }

    // Build signing link
    const baseUrl = (origin || req.headers.get('origin') || '').replace(/\/$/, '');
    const signingLink = `${baseUrl}/code-of-conduct/sign/${token}`;
    const expiryDate = new Date(expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    const companyName = templateRow.party_a_name || "India Photographers' Club";

    const subject = (templateRow.email_subject || `Action Required: Sign Your ${templateRow.document_title || 'Code of Conduct'}`)
      .replaceAll('{{member_name}}', member_name)
      .replaceAll('{{program_name}}', templateRow.program_name || '')
      .replaceAll('{{company_name}}', companyName);

    const bodyTemplate = templateRow.email_body || `Hi {{member_name}},

Welcome to {{program_name}}.

Before we activate your full program access, please review and acknowledge your Code of Conduct using the secure link below:

{{signing_link}}

This link is private and will expire on {{expiry_date}}.

Regards,
Team {{company_name}}`;

    const bodyText = bodyTemplate
      .replaceAll('{{member_name}}', member_name)
      .replaceAll('{{program_name}}', templateRow.program_name || 'IPC Diamond Membership')
      .replaceAll('{{signing_link}}', signingLink)
      .replaceAll('{{expiry_date}}', expiryDate)
      .replaceAll('{{company_name}}', companyName);

    const htmlBody = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f6f7f9;padding:24px;color:#111">
<div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:28px">
<h2 style="margin:0 0 8px;font-size:18px">${templateRow.document_title || 'Code of Conduct'}</h2>
<p style="color:#475569;font-size:13px;margin:0 0 20px">${companyName}</p>
${bodyText.split('\n').map(l => l.includes(signingLink) ? '' : `<p style="font-size:14px;line-height:1.6;margin:0 0 12px">${l.replace(/</g,'&lt;')}</p>`).join('')}
<p style="margin:24px 0"><a href="${signingLink}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:14px;font-weight:600">Review & Sign</a></p>
<p style="font-size:11.5px;color:#94a3b8;margin:20px 0 0">If the button does not work, copy this link: <br/>${signingLink}</p>
<p style="font-size:11.5px;color:#94a3b8;margin:8px 0 0">This link expires on ${expiryDate}.</p>
</div></body></html>`;

    // Send via Resend
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const fromEmail = templateRow.from_email || 'onboarding@resend.dev';
    const fromName = templateRow.from_name || 'IPC Control Center';
    let emailError: string | null = null;
    if (!RESEND_API_KEY) {
      emailError = 'RESEND_API_KEY not configured';
    } else {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: `${fromName} <${fromEmail}>`,
          to: [member_email],
          subject,
          html: htmlBody,
          text: bodyText,
        }),
      });
      if (!resp.ok) {
        emailError = `Resend ${resp.status}: ${await resp.text()}`;
      }
    }

    if (emailError) {
      await admin.from('code_of_conduct_requests').update({ email_error: emailError }).eq('id', requestRow.id);
      await admin.from('code_of_conduct_events').insert({ request_id: requestRow.id, event_type: 'email_failed', metadata: { error: emailError }, created_by: userId });
      return new Response(JSON.stringify({ error: emailError, signing_link: signingLink, request_id: requestRow.id }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const nowIso = new Date().toISOString();
    await admin.from('code_of_conduct_requests').update({ status: 'sent', sent_at: nowIso, email_error: null }).eq('id', requestRow.id);
    await admin.from('code_of_conduct_events').insert({ request_id: requestRow.id, event_type: 'email_sent', metadata: { to: member_email }, created_by: userId });

    // Mirror onto linked leads
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

    return new Response(JSON.stringify({ ok: true, request_id: requestRow.id, signing_link: signingLink, expires_at: expiresAt }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message || 'Unknown error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
