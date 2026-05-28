import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
function fail(code: string, msg: string, status = 400) { return jsonResponse({ ok: false, error_code: code, message: msg }, status); }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return fail('UNAUTHORIZED', 'Missing Authorization', 401);
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: claimErr } = await userClient.auth.getUser();
    if (claimErr || !userData?.user?.id) return fail('UNAUTHORIZED', 'Invalid session', 401);
    const userId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE);
    const body = await req.json().catch(() => ({}));
    const { request_id, new_email, reason, resend = false, also_update_lead = true } = body || {};

    if (!request_id) return fail('MISSING_REQUEST_ID', 'request_id required');
    if (!new_email || typeof new_email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(new_email)) return fail('INVALID_EMAIL', 'Valid email required');
    const normEmail = new_email.trim().toLowerCase().slice(0, 200);
    const reasonText = (typeof reason === 'string' ? reason : '').slice(0, 500);

    const { data: r } = await admin.from('code_of_conduct_requests').select('*').eq('id', request_id).maybeSingle();
    if (!r) return fail('REQUEST_NOT_FOUND', 'Request not found', 404);

    const oldEmail = r.member_email;
    const history = Array.isArray(r.email_change_history) ? r.email_change_history : [];
    const entry = { at: new Date().toISOString(), by: userId, old: oldEmail, new: normEmail, reason: reasonText, post_sign: r.status === 'signed' };

    if (r.status === 'signed') {
      // Immutable: never overwrite signed_member_email. Only update corrected_contact_email.
      await admin.from('code_of_conduct_requests').update({
        corrected_contact_email: normEmail,
        email_change_history: [...history, entry],
      }).eq('id', r.id);
      await admin.from('code_of_conduct_events').insert({ request_id: r.id, event_type: 'code_of_conduct_member_email_updated', metadata: { ...entry, immutable_signed: true }, created_by: userId });
      if (also_update_lead) {
        if (r.paid_pipeline_lead_id) await admin.from('paid_pipeline_leads').update({ email: normEmail }).eq('id', r.paid_pipeline_lead_id);
        if (r.crm_lead_id) await admin.from('leads').update({ email: normEmail }).eq('id', r.crm_lead_id);
      }
      return jsonResponse({ ok: true, mode: 'post_sign_contact_update', corrected_contact_email: normEmail });
    }

    // Pre-sign: update member_email; optionally cancel old token and issue a new signing link via send function
    await admin.from('code_of_conduct_requests').update({
      member_email: normEmail,
      email_change_history: [...history, entry],
    }).eq('id', r.id);

    if (also_update_lead) {
      if (r.paid_pipeline_lead_id) await admin.from('paid_pipeline_leads').update({ email: normEmail }).eq('id', r.paid_pipeline_lead_id);
      if (r.crm_lead_id) await admin.from('leads').update({ email: normEmail }).eq('id', r.crm_lead_id);
    }

    await admin.from('code_of_conduct_events').insert({ request_id: r.id, event_type: 'code_of_conduct_member_email_updated', metadata: { ...entry }, created_by: userId });

    if (resend) {
      // Cancel old token by clearing token_hash, then invoke send to issue a fresh one and email it.
      await admin.from('code_of_conduct_requests').update({ token_hash: null }).eq('id', r.id);
      await admin.from('code_of_conduct_events').insert({ request_id: r.id, event_type: 'code_of_conduct_old_token_cancelled_after_email_change', created_by: userId });

      const { data: sendRes, error: sendErr } = await userClient.functions.invoke('send-code-of-conduct-email', {
        body: {
          request_id: r.id,
          paid_pipeline_lead_id: r.paid_pipeline_lead_id,
          crm_lead_id: r.crm_lead_id,
          member_name: r.member_name,
          member_email: normEmail,
          member_phone: r.member_phone,
          program_name: r.program_name,
          origin: body.origin,
        },
      });
      if (sendErr) {
        await admin.from('code_of_conduct_events').insert({ request_id: r.id, event_type: 'code_of_conduct_email_updated_and_resend_failed', metadata: { error: sendErr.message }, created_by: userId });
        return fail('RESEND_FAILED', sendErr.message || 'Resend failed', 502);
      }
      await admin.from('code_of_conduct_events').insert({ request_id: r.id, event_type: 'code_of_conduct_email_updated_and_resent', metadata: { to: normEmail }, created_by: userId });
      return jsonResponse({ ok: true, mode: 'pre_sign_resent', new_email: normEmail, send_result: sendRes });
    }

    return jsonResponse({ ok: true, mode: 'pre_sign_updated', new_email: normEmail });
  } catch (e) {
    console.error('coc-update-email error', e);
    return fail('UPDATE_FAILED', (e as Error).message || 'Server error', 500);
  }
});
