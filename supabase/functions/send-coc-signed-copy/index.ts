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

    // Caller auth: allow service-to-service invokes (no caller validation needed for read of own request)
    const body = await req.json().catch(() => ({}));
    const { request_id, mode = 'all' } = body || {};
    if (!request_id) return fail('MISSING_REQUEST_ID', 'request_id required');

    const { data: r } = await admin.from('code_of_conduct_requests').select('*').eq('id', request_id).maybeSingle();
    if (!r) return fail('REQUEST_NOT_FOUND', 'Request not found', 404);
    if (r.status !== 'signed') return fail('NOT_SIGNED', 'Request is not signed yet');

    const { data: tpl } = r.template_id ? await admin.from('code_of_conduct_templates').select('*').eq('id', r.template_id).maybeSingle() : { data: null } as any;

    // Build signed URL for receipt (7d)
    const receiptPath = extractBucketPath(r.signed_html_url || r.signed_receipt_url || null, 'signed-code-of-conduct');
    let receiptLink = '';
    if (receiptPath) {
      const { data: signed } = await admin.storage.from('signed-code-of-conduct').createSignedUrl(receiptPath, 60 * 60 * 24 * 7);
      receiptLink = signed?.signedUrl || '';
    }

    const fromEmail = (tpl?.from_email && String(tpl.from_email).trim()) || envFrom;
    const fromName = (tpl?.from_name && String(tpl.from_name).trim()) || envFromName;
    const replyTo = (tpl?.reply_to_email && String(tpl.reply_to_email).trim()) || envReply || '';

    if (!RESEND_API_KEY || !fromEmail) return fail('EMAIL_SETUP_INCOMPLETE', 'RESEND_API_KEY or EMAIL_FROM_ADDRESS missing');

    const recipientsAdmin: string[] = Array.isArray(tpl?.signed_copy_recipient_emails) ? tpl.signed_copy_recipient_emails.filter(Boolean) : [];
    if (recipientsAdmin.length === 0 && replyTo) recipientsAdmin.push(replyTo);

    const sendOne = async (to: string, subject: string, html: string, text: string) => {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to: [to], subject, html, text, ...(replyTo ? { reply_to: replyTo } : {}) }),
      });
      const t = await resp.text();
      if (!resp.ok) throw new Error(`Resend ${resp.status}: ${t}`);
      return t;
    };

    const memberName = r.signed_member_name || r.member_name;
    const memberEmail = r.signed_member_email || r.member_email;
    const programName = r.program_name || tpl?.program_name || 'IPC Diamond Membership';
    const signedAt = r.signed_at ? new Date(r.signed_at).toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' }) : '—';

    const adminSubject = `Signed Code of Conduct Received — ${memberName}`;
    const adminText = `Hi Team,\n\n${memberName} has signed the IPC Diamond Membership Code of Conduct.\n\nDetails:\nMember: ${memberName}\nEmail: ${memberEmail}\nPhone: ${r.member_phone || '—'}\nProgram: ${programName}\nSigned at: ${signedAt}\nRequest ID: ${r.id}\n\nYou can view/download the signed copy here:\n${receiptLink || '(receipt not generated)'}\n\nRegards,\nIPC Control Center`;
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
${receiptLink ? `<p style="margin:20px 0"><a href="${esc(receiptLink)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600">View Signed Copy</a></p><p style="font-size:11px;color:#94a3b8">Link valid for 7 days.</p>` : '<p style="color:#b91c1c;font-size:12px">Signed receipt could not be generated. Please check Code of Conduct Admin → Requests.</p>'}
</div></body></html>`;

    const memberSubject = 'Your Signed IPC Diamond Membership Code of Conduct';
    const memberText = `Hi ${memberName},\n\nThank you for acknowledging the IPC Diamond Membership Code of Conduct.\n\nYour signed acknowledgement has been recorded successfully.\n\nYou can keep a copy using the link below:\n${receiptLink}\n\nRegards,\nTeam IPC`;
    const memberHtml = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f6f7f9;padding:24px;color:#111">
<div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:28px">
<h2 style="margin:0 0 8px;font-size:18px">Thank you, ${esc(memberName)}</h2>
<p style="color:#475569;font-size:14px;margin:0 0 16px">Your signed acknowledgement of the IPC Diamond Membership Code of Conduct has been recorded successfully.</p>
${receiptLink ? `<p style="margin:16px 0"><a href="${esc(receiptLink)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600">Download Your Copy</a></p><p style="font-size:11px;color:#94a3b8">Link valid for 7 days. Reach out to Team IPC if you need it again.</p>` : ''}
<p style="font-size:13px;color:#475569;margin-top:24px">Regards,<br/>Team IPC</p>
</div></body></html>`;

    const results: any = { admin: [], member: null };

    if (mode === 'all' || mode === 'admin') {
      for (const to of recipientsAdmin) {
        try {
          await sendOne(to, adminSubject, adminHtml, adminText);
          results.admin.push({ to, ok: true });
          await admin.from('code_of_conduct_events').insert({ request_id: r.id, event_type: 'signed_copy_email_sent_to_admin', metadata: { to } });
        } catch (e) {
          results.admin.push({ to, ok: false, error: (e as Error).message });
          await admin.from('code_of_conduct_events').insert({ request_id: r.id, event_type: 'signed_copy_email_failed_to_admin', metadata: { to, error: (e as Error).message } });
        }
      }
      if (results.admin.some((x: any) => x.ok)) {
        await admin.from('code_of_conduct_requests').update({ admin_copy_email_sent_at: new Date().toISOString() }).eq('id', r.id);
      }
    }

    if ((mode === 'all' || mode === 'member') && (tpl?.send_signed_copy_to_member !== false) && memberEmail) {
      try {
        await sendOne(memberEmail, memberSubject, memberHtml, memberText);
        results.member = { to: memberEmail, ok: true };
        await admin.from('code_of_conduct_events').insert({ request_id: r.id, event_type: 'signed_copy_email_sent_to_member', metadata: { to: memberEmail } });
        await admin.from('code_of_conduct_requests').update({ member_copy_email_sent_at: new Date().toISOString() }).eq('id', r.id);
      } catch (e) {
        results.member = { to: memberEmail, ok: false, error: (e as Error).message };
        await admin.from('code_of_conduct_events').insert({ request_id: r.id, event_type: 'signed_copy_email_failed_to_member', metadata: { to: memberEmail, error: (e as Error).message } });
      }
    }

    return jsonResponse({ ok: true, results, receipt_link: receiptLink });
  } catch (e) {
    console.error('send-coc-signed-copy error', e);
    return fail('SEND_FAILED', (e as Error).message || 'Server error', 500);
  }
});
