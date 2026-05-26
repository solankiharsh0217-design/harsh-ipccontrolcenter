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

function extractBucketPath(url: string | null, bucket: string) {
  if (!url) return null;
  const m = url.match(new RegExp(`/storage/v1/object/(?:public|sign)/${bucket}/([^?]+)`));
  if (m) return decodeURIComponent(m[1]);
  if (url.startsWith(`storage:${bucket}/`)) return url.slice(`storage:${bucket}/`.length);
  return null;
}

async function validateCaller(admin: any, req: Request, serviceKey: string) {
  const auth = req.headers.get('Authorization') || '';
  if (auth === `Bearer ${serviceKey}`) return { ok: true, service: true };
  if (!auth.startsWith('Bearer ')) return { ok: false, response: fail('UNAUTHORIZED', 'Missing Authorization', 401) };
  const token = auth.replace('Bearer ', '');
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user?.id) return { ok: false, response: fail('UNAUTHORIZED', 'Invalid session', 401) };
  const { data: isAdmin } = await admin.rpc('has_role', { _user_id: data.user.id, _role: 'admin' });
  if (!isAdmin) return { ok: false, response: fail('FORBIDDEN', 'Admin only', 403) };
  return { ok: true, user_id: data.user.id };
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
    const { request_id, mode = 'all' } = body || {};
    if (!request_id) return fail('MISSING_REQUEST_ID', 'request_id required');

    const { data: r } = await admin.from('code_of_conduct_requests').select('*').eq('id', request_id).maybeSingle();
    if (!r) return fail('REQUEST_NOT_FOUND', 'Request not found', 404);
    if (r.status !== 'signed') return fail('NOT_SIGNED', 'Request is not signed yet');

    const { data: tpl } = r.template_id ? await admin.from('code_of_conduct_templates').select('*').eq('id', r.template_id).maybeSingle() : { data: null } as any;

    const pdfPath = extractBucketPath(r.signed_pdf_url || null, 'signed-code-of-conduct');
    if (!pdfPath) {
      await admin.from('code_of_conduct_events').insert({ request_id: r.id, event_type: 'signed_pdf_email_send_attempted', metadata: { mode, ok: false, error_code: 'MISSING_SIGNED_PDF' } });
      return fail('MISSING_SIGNED_PDF', 'Signed PDF is missing. Regenerate the signed PDF before sending.', 400);
    }
    const { data: signed, error: signedErr } = await admin.storage.from('signed-code-of-conduct').createSignedUrl(pdfPath, 60 * 60 * 24 * 7);
    if (signedErr || !signed?.signedUrl) {
      await admin.from('code_of_conduct_events').insert({ request_id: r.id, event_type: 'signed_pdf_email_send_attempted', metadata: { mode, ok: false, error_code: 'SIGNED_URL_FAILED', error: signedErr?.message } });
      return fail('SIGNED_URL_FAILED', 'Could not generate signed PDF download link.', 500);
    }
    const pdfLink = signed.signedUrl;

    const fromEmail = (tpl?.from_email && String(tpl.from_email).trim()) || envFrom;
    const fromName = (tpl?.from_name && String(tpl.from_name).trim()) || envFromName;
    const replyTo = (tpl?.reply_to_email && String(tpl.reply_to_email).trim()) || envReply || '';

    if (!RESEND_API_KEY || !fromEmail) return fail('EMAIL_SETUP_INCOMPLETE', 'RESEND_API_KEY or EMAIL_FROM_ADDRESS missing');

    const recipientsAdmin: string[] = Array.isArray(tpl?.signed_copy_recipient_emails) ? tpl.signed_copy_recipient_emails.filter(Boolean) : [];
    if (recipientsAdmin.length === 0 && replyTo) recipientsAdmin.push(replyTo);

    const sendOne = async (to: string, subject: string, html: string, text: string) => {
      const sentAt = new Date().toISOString();
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to: [to], subject, html, text, ...(replyTo ? { reply_to: replyTo } : {}) }),
      });
      const t = await resp.text();
      if (!resp.ok) throw new Error(`Resend ${resp.status}: ${t}`);
      let id: string | null = null;
      try { id = JSON.parse(t)?.id || null; } catch { /* ignore */ }
      return { raw: t, provider_message_id: id, sent_at: sentAt };
    };

    const memberName = r.signed_member_name || r.member_name;
    const memberEmail = r.signed_member_email || r.member_email;
    const programName = r.program_name || tpl?.program_name || 'IPC Diamond Membership';
    const signedAt = r.signed_at ? new Date(r.signed_at).toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' }) : '—';

    const adminSubject = `Signed Code of Conduct Received — ${memberName}`;
    const adminText = `Hi Team,\n\n${memberName} has signed the IPC Diamond Membership Code of Conduct.\n\nDetails:\nMember: ${memberName}\nEmail: ${memberEmail}\nPhone: ${r.member_phone || '—'}\nProgram: ${programName}\nSigned at: ${signedAt}\nRequest ID: ${r.id}\n\nDownload the signed PDF here (valid for 7 days):\n${pdfLink}\n\nRegards,\nIPC Control Center`;
    const adminHtml = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f6f7f9;padding:24px;color:#111">
<div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:28px">
<h2 style="margin:0 0 8px;font-size:18px">Signed Code of Conduct Received</h2>
<p style="color:#475569;font-size:13px;margin:0 0 16px">${esc(memberName)} has signed the IPC Diamond Membership Code of Conduct.</p>
<table style="font-size:13px;width:100%"><tbody>
<tr><td style="color:#64748b;padding:4px 0">Member</td><td>${esc(memberName)}</td></tr>
<tr><td style="color:#64748b;padding:4px 0">Email</td><td>${esc(memberEmail)}</td></tr>
<tr><td style="color:#64748b;padding:4px 0">Phone</td><td>${esc(r.member_phone || '—')}</td></tr>
<tr><td style="color:#64748b;padding:4px 0">Program</td><td>${esc(programName)}</td></tr>
<tr><td style="color:#64748b;padding:4px 0">Signed at</td><td>${esc(signedAt)}</td></tr>
<tr><td style="color:#64748b;padding:4px 0">Request ID</td><td style="font-family:monospace;font-size:12px">${esc(r.id)}</td></tr>
</tbody></table>
<p style="margin:20px 0"><a href="${esc(pdfLink)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600">Download Signed PDF</a></p><p style="font-size:11px;color:#94a3b8">Signed PDF link valid for 7 days.</p>
</div></body></html>`;

    const memberSubject = 'Your Signed IPC Diamond Membership Code of Conduct';
    const memberText = `Hi ${memberName},\n\nThank you for acknowledging the IPC Diamond Membership Code of Conduct.\n\nYour signed acknowledgement has been recorded successfully.\n\nDownload your signed Code of Conduct PDF below (valid for 7 days):\n${pdfLink}\n\nRegards,\nTeam IPC`;
    const memberHtml = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f6f7f9;padding:24px;color:#111">
<div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:28px">
<h2 style="margin:0 0 8px;font-size:18px">Thank you, ${esc(memberName)}</h2>
<p style="color:#475569;font-size:14px;margin:0 0 16px">Your signed acknowledgement of the IPC Diamond Membership Code of Conduct has been recorded successfully.</p>
<p style="margin:16px 0"><a href="${esc(pdfLink)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600">Download Your Signed Code of Conduct</a></p><p style="font-size:11px;color:#94a3b8">Signed PDF link valid for 7 days. Reach out to Team IPC if you need it again.</p>
<p style="font-size:13px;color:#475569;margin-top:24px">Regards,<br/>Team IPC</p>
</div></body></html>`;

    const results: any = { admin: [], member: null };
    await admin.from('code_of_conduct_events').insert({ request_id: r.id, event_type: 'signed_pdf_email_send_attempted', metadata: { mode, copy_type: 'Signed PDF', delivery: 'signed_url', pdf_path: pdfPath } });

    if (mode === 'all' || mode === 'admin') {
      if (recipientsAdmin.length === 0) return fail('MISSING_RECIPIENT', 'No admin/archive recipient is configured.', 400);
      for (const to of recipientsAdmin) {
        try {
          const sent = await sendOne(to, adminSubject, adminHtml, adminText);
          results.admin.push({ to, ok: true, provider_message_id: sent.provider_message_id, sent_at: sent.sent_at, copy_type: 'Signed PDF', method: 'signed_url' });
          await admin.from('code_of_conduct_events').insert({ request_id: r.id, event_type: 'signed_pdf_email_sent_to_admin', metadata: { to, provider_message_id: sent.provider_message_id, sent_at: sent.sent_at, copy_type: 'Signed PDF', method: 'signed_url' } });
        } catch (e) {
          results.admin.push({ to, ok: false, error: (e as Error).message });
          await admin.from('code_of_conduct_events').insert({ request_id: r.id, event_type: 'signed_pdf_email_failed_to_admin', metadata: { to, error_code: 'EMAIL_PROVIDER_REJECTED', error: (e as Error).message } });
        }
      }
      if (results.admin.some((x: any) => x.ok)) {
        await admin.from('code_of_conduct_requests').update({ admin_copy_email_sent_at: new Date().toISOString() }).eq('id', r.id);
      }
    }

    if ((mode === 'all' || mode === 'member') && (tpl?.send_signed_copy_to_member !== false) && memberEmail) {
      try {
        const sent = await sendOne(memberEmail, memberSubject, memberHtml, memberText);
        results.member = { to: memberEmail, ok: true, provider_message_id: sent.provider_message_id, sent_at: sent.sent_at, copy_type: 'Signed PDF', method: 'signed_url' };
        await admin.from('code_of_conduct_events').insert({ request_id: r.id, event_type: 'signed_pdf_email_sent_to_member', metadata: { to: memberEmail, provider_message_id: sent.provider_message_id, sent_at: sent.sent_at, copy_type: 'Signed PDF', method: 'signed_url' } });
        await admin.from('code_of_conduct_requests').update({ member_copy_email_sent_at: new Date().toISOString() }).eq('id', r.id);
      } catch (e) {
        results.member = { to: memberEmail, ok: false, error: (e as Error).message };
        await admin.from('code_of_conduct_events').insert({ request_id: r.id, event_type: 'signed_pdf_email_failed_to_member', metadata: { to: memberEmail, error_code: 'EMAIL_PROVIDER_REJECTED', error: (e as Error).message } });
      }
    } else if (mode === 'member' && !memberEmail) {
      return fail('MISSING_RECIPIENT', 'Member email is missing.', 400);
    }

    return jsonResponse({ ok: true, results, pdf_link: pdfLink, copy_type: 'Signed PDF', method: 'signed_url' });
  } catch (e) {
    console.error('send-coc-signed-copy error', e);
    return fail('SEND_FAILED', (e as Error).message || 'Server error', 500);
  }
});
