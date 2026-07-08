import { createClient } from 'npm:@supabase/supabase-js@2';
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';

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
  if (publicOrAnyUrl.startsWith(`storage:${bucket}/`)) return publicOrAnyUrl.slice(`storage:${bucket}/`.length);
  const re = new RegExp(`/storage/v1/object/(?:public|sign)/${bucket}/([^?]+)`);
  const m = publicOrAnyUrl.match(re);
  return m ? decodeURIComponent(m[1]) : null;
}

async function signedStorageUrl(admin: any, rawUrl: string | null, bucket: string, expires = 60 * 60 * 24 * 7): Promise<string | null> {
  if (!rawUrl) return null;
  const path = extractBucketPath(rawUrl, bucket);
  if (!path) return rawUrl;
  const { data } = await admin.storage.from(bucket).createSignedUrl(path, expires);
  return data?.signedUrl || null;
}

async function resolvePdfUrl(admin: any, rawUrl: string | null): Promise<string | null> {
  if (!rawUrl) return null;
  const path = extractBucketPath(rawUrl, 'code-of-conduct');
  if (!path) return rawUrl;
  const { data } = await admin.storage.from('code-of-conduct').createSignedUrl(path, 60 * 60);
  return data?.signedUrl || null;
}

async function resolveSignedReceiptUrl(admin: any, rawUrl: string | null): Promise<string | null> {
  return signedStorageUrl(admin, rawUrl, 'signed-code-of-conduct');
}

async function resolveSignedPdfUrl(admin: any, rawUrl: string | null): Promise<string | null> {
  return signedStorageUrl(admin, rawUrl, 'signed-code-of-conduct');
}

async function loadGuideVideoConfig(admin: any) {
  const { data } = await admin.from('company_settings').select('guide_video_provider,guide_video_id,guide_video_title,guide_video_required_percent,guide_video_is_active').eq('workspace', 'default').maybeSingle();
  if (!data) return null;
  return {
    provider: data.guide_video_provider || 'wistia',
    video_id: data.guide_video_id || null,
    title: data.guide_video_title || null,
    required_percent: Number(data.guide_video_required_percent ?? 95),
    is_active: data.guide_video_is_active !== false,
  };
}

async function loadGuideProgress(admin: any, requestId: string) {
  const { data } = await admin.from('code_of_conduct_guide_progress').select('*').eq('request_id', requestId).maybeSingle();
  if (!data) return null;
  return {
    percent_watched: Number(data.percent_watched ?? 0),
    completed_at: data.completed_at || null,
    video_id: data.video_id || null,
  };
}

function publicRequestPayload(r: any, t: any, originalPdfUrl: string | null, signedRequestPdfUrl: string | null, signedReceiptHtmlUrl: string | null, guideVideo: any = null, guideProgress: any = null, bonusTerms: any = null) {
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
      signed_pdf_url: r.status === 'signed' ? signedRequestPdfUrl : null,
      signed_pdf_generated_at: r.signed_pdf_generated_at || null,
      signed_pdf_generation_error: r.signed_pdf_generation_error || null,
      signed_receipt_url: r.status === 'signed' ? signedReceiptHtmlUrl : null,
      bonus_terms_accepted_at: r.bonus_terms_accepted_at || null,
      bonus_terms_version_accepted: r.bonus_terms_version_accepted ?? null,
    },
    template: t ? {
      name: t.name,
      document_title: t.document_title,
      program_name: t.program_name,
      version: t.version,
      party_a_name: t.party_a_name,
      template_pdf_url: originalPdfUrl,
      html_content: t.html_content,
      success_page_message: t.success_page_message,
      whatsapp_redirect_url: r.status === 'signed' ? (t.whatsapp_redirect_url || null) : null,
    } : null,
    guide_video: guideVideo,
    guide_progress: guideProgress,
    bonus_terms: bonusTerms,
  };
}

async function loadBonusTerms(admin: any) {
  const { data } = await admin.from('company_settings').select('bonus_terms_text,bonus_terms_version,bonus_email_auto_send').order('created_at', { ascending: true }).limit(1).maybeSingle();
  if (!data) return { terms: null, autoSend: true };
  const text = String(data.bonus_terms_text || '').trim();
  return {
    terms: text ? { text, version: Number(data.bonus_terms_version || 1) } : null,
    autoSend: data.bonus_email_auto_send !== false,
  };
}

async function loadRequest(admin: any, token: string, req: Request) {
  if (!token || typeof token !== 'string' || token.length < 32 || token.length > 256 || !/^[A-Za-z0-9._~:-]+$/.test(token)) {
    return { error: publicError('INVALID_TOKEN', 'Invalid token', 400) };
  }
  const tokenHash = await sha256(token);
  let { data: reqRow, error } = await admin.from('code_of_conduct_requests').select('*').eq('token_hash', tokenHash).maybeSingle();
  if (error) throw error;
  // Grace-window fallback: after admin re-generates a link, the previously-mailed token
  // remains valid for a short window (previous_token_expires_at) so participants who
  // click the older email still land on their signing page.
  if (!reqRow) {
    const { data: prevRow, error: prevErr } = await admin.from('code_of_conduct_requests').select('*').eq('previous_token_hash', tokenHash).maybeSingle();
    if (prevErr) throw prevErr;
    if (prevRow && prevRow.previous_token_expires_at && new Date(prevRow.previous_token_expires_at) > new Date()) {
      reqRow = prevRow;
    }
  }
  if (!reqRow) {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('cf-connecting-ip') || null;
    const ua = req.headers.get('user-agent') || null;
    await admin.from('code_of_conduct_events').insert({ request_id: null, event_type: 'invalid_signing_link_opened', metadata: { token_hash: tokenHash, ip, ua, reason: 'no_matching_token' } });
    return { error: publicError('REQUEST_NOT_FOUND', 'This Code of Conduct link is no longer active. Please open the most recent email from Team IPC, or ask them to resend it.', 404) };
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

async function fetchPdfBytes(admin: any, rawUrl: string | null) {
  if (!rawUrl) throw new Error('Original template PDF is missing');
  const path = extractBucketPath(rawUrl, 'code-of-conduct');
  if (path) {
    const { data, error } = await admin.storage.from('code-of-conduct').download(path);
    if (error || !data) throw new Error(error?.message || 'Original PDF download failed');
    return new Uint8Array(await data.arrayBuffer());
  }
  const resp = await fetch(rawUrl);
  if (!resp.ok) throw new Error(`Original PDF fetch failed (${resp.status})`);
  return new Uint8Array(await resp.arrayBuffer());
}

function dataUrlBytes(dataUrl: string | null) {
  if (!dataUrl) return null;
  const m = dataUrl.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/i);
  if (!m) return null;
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, type: m[1].toLowerCase() };
}

function placement(tpl: any, pageCount: number) {
  const num = (v: any, d: number) => Number.isFinite(Number(v)) ? Number(v) : d;
  const configuredPage = Number(tpl?.pdf_signature_page_number || 0);
  const pageIndex = configuredPage > 0 ? Math.max(0, Math.min(pageCount - 1, configuredPage - 1)) : pageCount - 1;
  return {
    pageIndex,
    nameX: num(tpl?.pdf_signature_name_x, 150), nameY: num(tpl?.pdf_signature_name_y, 180),
    sigX: num(tpl?.pdf_signature_image_x, 150), sigY: num(tpl?.pdf_signature_image_y, 110),
    sigW: num(tpl?.pdf_signature_image_width, 220), sigH: num(tpl?.pdf_signature_image_height, 70),
    dateX: num(tpl?.pdf_signature_date_x, 150), dateY: num(tpl?.pdf_signature_date_y, 70),
    fontSize: num(tpl?.pdf_signature_font_size, 11),
  };
}

function drawWrapped(page: any, text: string, x: number, y: number, opts: any) {
  const clean = String(text || '—').replace(/\s+/g, ' ');
  const words = clean.split(' ');
  let line = '';
  let yy = y;
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (opts.font.widthOfTextAtSize(next, opts.size) > opts.maxWidth && line) {
      page.drawText(line, { x, y: yy, size: opts.size, font: opts.font, color: opts.color });
      yy -= opts.lineHeight || opts.size + 4;
      line = word;
    } else line = next;
  }
  if (line) page.drawText(line, { x, y: yy, size: opts.size, font: opts.font, color: opts.color });
  return yy;
}

async function generateAndStoreSignedPdf(admin: any, reqRow: any, tpl: any, ip: string | null, ua: string | null, regeneratedByAdmin = false) {
  await admin.from('code_of_conduct_events').insert({ request_id: reqRow.id, event_type: 'signed_pdf_generation_started', metadata: regeneratedByAdmin ? { regenerated_by_admin: true } : null });
  try {
    if (!reqRow.signature_data_url) throw new Error('Cannot generate signed PDF because signature data is missing.');
    const sig = dataUrlBytes(reqRow.signature_data_url);
    if (!sig) throw new Error('Signature image format is invalid.');
    const pdfDoc = await PDFDocument.load(await fetchPdfBytes(admin, tpl?.template_pdf_url || tpl?.pdf_url || null));
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const sigImage = sig.type === 'png' ? await pdfDoc.embedPng(sig.bytes) : await pdfDoc.embedJpg(sig.bytes);
    const pages = pdfDoc.getPages();
    const p = placement(tpl, pages.length);
    const target = pages[p.pageIndex];
    const memberName = reqRow.signed_member_name || reqRow.signature_name || reqRow.member_name || '—';
    const signedAt = reqRow.signed_at ? new Date(reqRow.signed_at) : new Date();
    const signedDate = signedAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    target.drawText(memberName, { x: p.nameX, y: p.nameY, size: p.fontSize, font, color: rgb(0.05, 0.05, 0.05) });
    target.drawImage(sigImage, { x: p.sigX, y: p.sigY, width: p.sigW, height: p.sigH });
    target.drawText(signedDate, { x: p.dateX, y: p.dateY, size: p.fontSize, font, color: rgb(0.05, 0.05, 0.05) });

    const page = pdfDoc.addPage([595.28, 841.89]);
    const ink = rgb(0.06, 0.09, 0.16), muted = rgb(0.36, 0.42, 0.5), line = rgb(0.86, 0.89, 0.93);
    page.drawText('Digital Signing Evidence', { x: 48, y: 790, size: 22, font: bold, color: ink });
    page.drawText('Secure IPC signing flow acknowledgement record', { x: 48, y: 768, size: 10, font, color: muted });
    page.drawLine({ start: { x: 48, y: 748 }, end: { x: 547, y: 748 }, thickness: 1, color: line });
    let y = 718;
    const section = (title: string) => { page.drawText(title, { x: 48, y, size: 11, font: bold, color: muted }); y -= 20; };
    const row = (k: string, v: string) => { page.drawText(k, { x: 58, y, size: 9.5, font, color: muted }); drawWrapped(page, v, 210, y, { font, size: 9.5, color: ink, maxWidth: 315, lineHeight: 13 }); y -= 18; };
    section('Member details');
    row('Member name', memberName); row('Member email used for signing', reqRow.signed_member_email || reqRow.member_email || '—'); row('Member phone', reqRow.member_phone || '—'); row('Program name', reqRow.program_name || tpl?.program_name || 'IPC Diamond Membership'); row('Request ID', reqRow.id); row('Template name/version', `${tpl?.name || reqRow.template_name || '—'} / v${tpl?.version || reqRow.template_version || '1.0'}`);
    y -= 8; section('Signature evidence');
    row('Signed at', signedAt.toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'medium' })); row('Typed signature name', reqRow.signature_name || '—'); row('IP address', ip || reqRow.acknowledgement_ip || '—'); row('User agent', ua || reqRow.acknowledgement_user_agent || '—');
    page.drawText('Drawn signature', { x: 58, y, size: 9.5, font, color: muted });
    page.drawRectangle({ x: 210, y: y - 45, width: 210, height: 58, borderColor: line, borderWidth: 1, color: rgb(1,1,1) });
    page.drawImage(sigImage, { x: 218, y: y - 38, width: 190, height: 44 });
    y -= 76; section('Acknowledgements');
    const acks = Array.isArray(reqRow.acknowledgement_checklist) && reqRow.acknowledgement_checklist.length ? reqRow.acknowledgement_checklist : [
      'I have read and understood the Code of Conduct.',
      'I agree to the responsibilities and terms of the Diamond Membership.',
      'I understand group/program access may be provided only after acknowledgement.',
      'I confirm that the name and email shown belong to me.',
    ];
    const tickColor = rgb(0.09, 0.55, 0.25);
    for (const ack of acks) {
      // Draw a real check-mark glyph (two connected line segments) instead of the "[x]" that looked like a negative cross.
      const cx = 60, cy = y + 2;
      page.drawLine({ start: { x: cx, y: cy + 2 }, end: { x: cx + 3, y: cy - 2 }, thickness: 1.4, color: tickColor });
      page.drawLine({ start: { x: cx + 3, y: cy - 2 }, end: { x: cx + 9, y: cy + 6 }, thickness: 1.4, color: tickColor });
      y = drawWrapped(page, ack, 82, y, { font, size: 9.5, color: ink, maxWidth: 436, lineHeight: 13 }) - 16;
    }
    page.drawLine({ start: { x: 48, y: 68 }, end: { x: 547, y: 68 }, thickness: 1, color: line });
    page.drawText('This page records the digital acknowledgement evidence captured through the secure IPC signing flow.', { x: 48, y: 48, size: 8.5, font, color: muted });

    const bytes = await pdfDoc.save();
    const path = `${reqRow.id}/signed-code-of-conduct.pdf`;
    const { error: upErr } = await admin.storage.from('signed-code-of-conduct').upload(path, new Blob([bytes], { type: 'application/pdf' }), { upsert: true, contentType: 'application/pdf' });
    if (upErr) throw upErr;
    const storedUrl = `storage:signed-code-of-conduct/${path}`;
    const nowIso = new Date().toISOString();
    await admin.from('code_of_conduct_requests').update({ signed_pdf_url: storedUrl, signed_pdf_generated_at: nowIso, signed_pdf_generation_error: null }).eq('id', reqRow.id);
    await admin.from('code_of_conduct_events').insert({ request_id: reqRow.id, event_type: regeneratedByAdmin ? 'signed_pdf_regenerated_by_admin' : 'signed_pdf_generated', metadata: { path, page: p.pageIndex + 1 } });
    return { ok: true, path, storedUrl };
  } catch (e) {
    const msg = (e as Error).message || 'Signed PDF generation failed';
    await admin.from('code_of_conduct_requests').update({ signed_pdf_generation_error: msg }).eq('id', reqRow.id);
    await admin.from('code_of_conduct_events').insert({ request_id: reqRow.id, event_type: 'signed_pdf_generation_failed', metadata: { error: msg } });
    return { ok: false, error: msg };
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

    // Admin-only actions: regenerate immutable signed outputs for an already-signed request
    if (action === 'admin_regenerate_receipt' || action === 'admin_regenerate_signed_pdf') {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) return publicError('UNAUTHORIZED', 'Missing Authorization', 401);
      const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
      const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
      const { data: userData } = await userClient.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) return publicError('UNAUTHORIZED', 'Invalid session', 401);
      const { data: isAdmin } = await admin.rpc('has_role', { _user_id: uid, _role: 'admin' });
      if (!isAdmin) return publicError('FORBIDDEN', 'Admin only', 403);
      const rid = body.request_id;
      if (!rid) return publicError('MISSING_REQUEST_ID', 'request_id required', 400);
      const { data: r } = await admin.from('code_of_conduct_requests').select('*').eq('id', rid).maybeSingle();
      if (!r) return publicError('REQUEST_NOT_FOUND', 'Not found', 404);
      if (r.status !== 'signed') return publicError('NOT_SIGNED', 'Request is not signed', 400);
      if (!r.signature_name && !r.signature_data_url) return publicError('SIGNATURE_MISSING', 'Signed copy cannot be generated because signature data is missing.', 400);
      const { data: tpl0 } = r.template_id ? await admin.from('code_of_conduct_templates').select('*').eq('id', r.template_id).maybeSingle() : { data: null } as any;
      const ip = r.acknowledgement_ip || null;
      const ua = r.acknowledgement_user_agent || null;
      const result = action === 'admin_regenerate_signed_pdf'
        ? await generateAndStoreSignedPdf(admin, r, tpl0, ip, ua, true)
        : await generateAndStoreReceipt(admin, r, tpl0, ip, ua);
      if (!result.ok) return publicError(action === 'admin_regenerate_signed_pdf' ? 'SIGNED_PDF_GENERATION_FAILED' : 'RECEIPT_FAILED', result.error || 'Generation failed', 500);
      return jsonResponse({ ok: true, path: result.path });
    }

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
      const ipOpen = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('cf-connecting-ip') || null;
      const uaOpen = req.headers.get('user-agent') || null;
      const nowIso = new Date().toISOString();
      const isFirstOpen = !reqRow.first_opened_at;
      // Always increment open counters; set first_opened_at on first open
      const newOpenCount = Number(reqRow.open_count || 0) + 1;
      await admin.from('code_of_conduct_requests').update({
        first_opened_at: reqRow.first_opened_at || nowIso,
        last_opened_at: nowIso,
        open_count: newOpenCount,
        ...(reqRow.status === 'sent' ? { status: 'viewed', viewed_at: nowIso } : {}),
      }).eq('id', reqRow.id);
      reqRow.first_opened_at = reqRow.first_opened_at || nowIso;
      reqRow.last_opened_at = nowIso;
      reqRow.open_count = newOpenCount;
      if (reqRow.status === 'sent') { reqRow.status = 'viewed'; reqRow.viewed_at = nowIso; }

      if (isFirstOpen) {
        await admin.from('code_of_conduct_events').insert({ request_id: reqRow.id, event_type: 'link_opened', metadata: { ip: ipOpen, ua: uaOpen?.slice(0, 500) || null, open_count: newOpenCount } });
        if (reqRow.paid_pipeline_lead_id) await admin.from('paid_pipeline_leads').update({ code_of_conduct_status: 'viewed' }).eq('id', reqRow.paid_pipeline_lead_id);
        if (reqRow.crm_lead_id) await admin.from('leads').update({ code_of_conduct_status: 'viewed' }).eq('id', reqRow.crm_lead_id);

        // Auto-move stage on first link open if enabled
        try {
          const { data: settings } = await admin.rpc('get_coc_stage_settings');
          const cfg = settings || {};
          if (reqRow.crm_lead_id && cfg.coc_auto_move_link_opened && cfg.coc_link_opened_stage_id) {
            const { data: moveRes } = await admin.rpc('coc_advance_lead_stage', {
              _crm_lead_id: reqRow.crm_lead_id,
              _target_stage_id: cfg.coc_link_opened_stage_id,
              _reason: 'code_of_conduct_link_opened_auto',
            });
            if (moveRes?.moved) {
              await admin.from('code_of_conduct_events').insert({ request_id: reqRow.id, event_type: 'stage_auto_moved_link_opened', metadata: moveRes });
            }
          }
        } catch (e) { console.warn('coc auto-move link_opened failed', e); }
      } else {
        await admin.from('code_of_conduct_events').insert({ request_id: reqRow.id, event_type: 'link_reopened', metadata: { open_count: newOpenCount } });
      }
      await admin.from('code_of_conduct_events').insert({ request_id: reqRow.id, event_type: 'document_viewed' });

      const originalPdf = await resolvePdfUrl(admin, tpl?.template_pdf_url || null);
      if (!originalPdf && !tpl?.html_content) return publicError('DOCUMENT_NOT_FOUND', 'The agreement document is not configured yet.', 404);
      const receiptUrl = await resolveSignedReceiptUrl(admin, reqRow.signed_html_url || reqRow.signed_receipt_url || null);
      const signedRequestPdf = await resolveSignedPdfUrl(admin, reqRow.signed_pdf_url || null);
      const guideVideo = await loadGuideVideoConfig(admin);
      const guideProgress = await loadGuideProgress(admin, reqRow.id);
      const { terms: bonusTerms } = await loadBonusTerms(admin);
      return jsonResponse(publicRequestPayload(reqRow, tpl, originalPdf, signedRequestPdf, receiptUrl, guideVideo, guideProgress, bonusTerms));
    }

    if (action === 'record_guide_progress') {
      const percent = Math.max(0, Math.min(100, Number(body.percent_watched ?? 0)));
      const videoId = body.video_id ? String(body.video_id).slice(0, 200) : null;
      const guideVideo = await loadGuideVideoConfig(admin);
      const required = Number(guideVideo?.required_percent ?? 95);
      const completedNow = percent >= required;
      const { data: existing } = await admin.from('code_of_conduct_guide_progress').select('*').eq('request_id', reqRow.id).maybeSingle();
      const nowIso = new Date().toISOString();
      if (existing) {
        const nextPercent = Math.max(Number(existing.percent_watched ?? 0), percent);
        const justCompleted = !existing.completed_at && nextPercent >= required;
        const completedAt = existing.completed_at || (nextPercent >= required ? nowIso : null);
        await admin.from('code_of_conduct_guide_progress').update({
          percent_watched: nextPercent,
          video_id: videoId || existing.video_id,
          completed_at: completedAt,
          last_event_at: nowIso,
        }).eq('id', existing.id);
        if (justCompleted) {
          await admin.from('code_of_conduct_events').insert({ request_id: reqRow.id, event_type: 'guide_video_completed', metadata: { video_id: videoId, percent_watched: nextPercent } });
          try { await admin.rpc('coc_maybe_move_access_done', { _request_id: reqRow.id }); } catch (e) { console.warn('access_done auto-move failed', e); }
        }
        return jsonResponse({ ok: true, percent_watched: nextPercent, completed_at: completedAt, required_percent: required });
      }
      const completedAt = completedNow ? nowIso : null;
      await admin.from('code_of_conduct_guide_progress').insert({
        request_id: reqRow.id, video_id: videoId, percent_watched: percent, completed_at: completedAt, last_event_at: nowIso,
      });
      await admin.from('code_of_conduct_events').insert({ request_id: reqRow.id, event_type: 'guide_video_progress_started', metadata: { video_id: videoId } });
      if (completedNow) {
        await admin.from('code_of_conduct_events').insert({ request_id: reqRow.id, event_type: 'guide_video_completed', metadata: { video_id: videoId, percent_watched: percent } });
        try { await admin.rpc('coc_maybe_move_access_done', { _request_id: reqRow.id }); } catch (e) { console.warn('access_done auto-move failed', e); }
      }
      return jsonResponse({ ok: true, percent_watched: percent, completed_at: completedAt, required_percent: required });
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
      const originalPdf = await resolvePdfUrl(admin, tpl?.template_pdf_url || null);
      const receiptUrl = await resolveSignedReceiptUrl(admin, reqRow.signed_html_url || reqRow.signed_receipt_url || null);
      const signedRequestPdf = await resolveSignedPdfUrl(admin, reqRow.signed_pdf_url || null);
      return jsonResponse({ already_signed: true, ...publicRequestPayload(reqRow, tpl, originalPdf, signedRequestPdf, receiptUrl) });
    }

    const signatureName = body.signature_name || body.typed_name;
    const signatureDataUrl = body.signature_data_url || null;
    const acknowledgements = body.acknowledgements || body.acknowledgement_checkbox_values;
    const acknowledgementLabels = Array.isArray(body.acknowledgement_labels) ? body.acknowledgement_labels.slice(0, 12).map((s: any) => String(s).slice(0, 300)) : null;
    if (!signatureName || typeof signatureName !== 'string' || signatureName.trim().length < 2) {
      await admin.from('code_of_conduct_events').insert({ request_id: reqRow.id, event_type: 'sign_failed', metadata: { error_code: 'SIGNATURE_NAME_REQUIRED' } });
      return publicError('SIGNATURE_NAME_REQUIRED', 'Typed full name is required.', 400);
    }
    // Drawn digital signature is mandatory. Reject missing / malformed / trivially-small payloads.
    if (!signatureDataUrl || typeof signatureDataUrl !== 'string' || !signatureDataUrl.startsWith('data:image/')) {
      await admin.from('code_of_conduct_events').insert({ request_id: reqRow.id, event_type: 'sign_failed', metadata: { error_code: 'SIGNATURE_REQUIRED', reason: 'missing_signature_data_url' } });
      return publicError('SIGNATURE_REQUIRED', 'Please draw your digital signature before submitting.', 400);
    }
    {
      const parsed = dataUrlBytes(signatureDataUrl);
      // Anything under ~800 bytes of PNG payload is effectively a blank canvas / accidental dot.
      if (!parsed || parsed.bytes.length < 800) {
        await admin.from('code_of_conduct_events').insert({ request_id: reqRow.id, event_type: 'sign_failed', metadata: { error_code: 'SIGNATURE_REQUIRED', reason: 'signature_blank_or_too_small', size: parsed?.bytes?.length || 0 } });
        return publicError('SIGNATURE_REQUIRED', 'Please draw your digital signature before submitting.', 400);
      }
    }
    if (!acknowledgements || !Array.isArray(acknowledgements) || acknowledgements.length < 4 || acknowledgements.some((b: any) => b !== true)) {
      await admin.from('code_of_conduct_events').insert({ request_id: reqRow.id, event_type: 'sign_failed', metadata: { error_code: 'ACKNOWLEDGEMENT_REQUIRED' } });
      return publicError('ACKNOWLEDGEMENT_REQUIRED', 'All acknowledgements must be checked.', 400);
    }

    // Bonus terms gate: if terms are configured, member must accept before signing.
    const bonusCfg = await loadBonusTerms(admin);
    const bonusTermsAccepted = body.bonus_terms_accepted === true;
    if (bonusCfg.terms && !bonusTermsAccepted) {
      await admin.from('code_of_conduct_events').insert({ request_id: reqRow.id, event_type: 'sign_failed', metadata: { error_code: 'BONUS_TERMS_REQUIRED' } });
      return publicError('BONUS_TERMS_REQUIRED', 'Please accept the Bonus Access Terms to continue.', 400);
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('cf-connecting-ip') || null;
    const ua = req.headers.get('user-agent') || null;
    const now = new Date().toISOString();
    const sigTrim = (signatureDataUrl && typeof signatureDataUrl === 'string' && signatureDataUrl.length < 800_000) ? signatureDataUrl : null;
    if (!sigTrim) {
      await admin.from('code_of_conduct_events').insert({ request_id: reqRow.id, event_type: 'sign_failed', metadata: { error_code: 'SIGNATURE_REQUIRED', reason: 'signature_too_large' } });
      return publicError('SIGNATURE_REQUIRED', 'Signature image is too large. Please draw a simpler signature and try again.', 400);
    }
    const trimmedName = signatureName.trim().slice(0, 200);
    const signedEmail = (body.email || reqRow.member_email || '').toString().trim().slice(0, 200);

    const signUpdate: Record<string, unknown> = {
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
    };
    if (bonusCfg.terms && bonusTermsAccepted && !reqRow.bonus_terms_accepted_at) {
      signUpdate.bonus_terms_accepted_at = now;
      signUpdate.bonus_terms_version_accepted = bonusCfg.terms.version;
      signUpdate.bonus_terms_text_snapshot = bonusCfg.terms.text;
      signUpdate.bonus_terms_accepted_ip = ip;
      signUpdate.bonus_terms_accepted_user_agent = ua?.slice(0, 500) || null;
    }

    const { data: updated, error: updErr } = await admin.from('code_of_conduct_requests').update(signUpdate).eq('id', reqRow.id).select().single();
    if (updErr) throw updErr;

    await admin.from('code_of_conduct_events').insert({ request_id: reqRow.id, event_type: 'signed', metadata: { ip, ua } });
    if (reqRow.paid_pipeline_lead_id) await admin.from('paid_pipeline_leads').update({ code_of_conduct_status: 'signed', code_of_conduct_signed_at: now, code_of_conduct_request_id: reqRow.id }).eq('id', reqRow.paid_pipeline_lead_id);
    if (reqRow.crm_lead_id) await admin.from('leads').update({ code_of_conduct_status: 'signed', code_of_conduct_signed_at: now, code_of_conduct_request_id: reqRow.id }).eq('id', reqRow.crm_lead_id);

    // Generate signed PDF as primary proof and keep HTML receipt as secondary evidence
    const pdfResult = await generateAndStoreSignedPdf(admin, updated, tpl, ip, ua);
    const receiptResult = await generateAndStoreReceipt(admin, updated, tpl, ip, ua);

    // Fire-and-forget signed copy email
    try {
      await admin.functions.invoke('send-coc-signed-copy', { body: { request_id: updated.id } });
    } catch (e) { console.warn('signed copy dispatch fail', e); }

    // Fire-and-forget bonus access email (auto mode). Must never block CoC completion.
    if (bonusCfg.autoSend && bonusTermsAccepted && !updated.bonus_email_sent_at) {
      try {
        const { data: bonusRes, error: bonusErr } = await admin.functions.invoke('send-bonus-access-email', { body: { request_id: updated.id, mode: 'auto' } });
        if (bonusErr || (bonusRes && bonusRes.ok === false)) {
          const msg = bonusErr?.message || bonusRes?.message || 'unknown';
          await admin.from('code_of_conduct_requests').update({ bonus_email_last_error: String(msg).slice(0, 500), bonus_email_last_error_at: new Date().toISOString() }).eq('id', updated.id);
        } else {
          await admin.from('code_of_conduct_requests').update({ bonus_email_last_error: null, bonus_email_last_error_at: null }).eq('id', updated.id);
        }
      } catch (e) {
        console.warn('bonus email auto-send failed', e);
        try {
          await admin.from('code_of_conduct_requests').update({ bonus_email_last_error: (e as Error).message?.slice(0, 500) || 'invoke failed', bonus_email_last_error_at: new Date().toISOString() }).eq('id', updated.id);
        } catch { /* ignore */ }
      }
    }

    // Auto-move CRM lead to Access Done stage if enabled and gating conditions met
    try { await admin.rpc('coc_maybe_move_access_done', { _request_id: updated.id }); } catch (e) { console.warn('access_done auto-move on sign failed', e); }


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
    const originalPdf = await resolvePdfUrl(admin, tpl?.template_pdf_url || null);
    const receiptUrl = await resolveSignedReceiptUrl(admin, finalRow?.signed_html_url || finalRow?.signed_receipt_url || null);
    const signedRequestPdf = await resolveSignedPdfUrl(admin, finalRow?.signed_pdf_url || null);
    return jsonResponse({ ...publicRequestPayload(finalRow || updated, tpl, originalPdf, signedRequestPdf, receiptUrl), signed_pdf_generated: pdfResult.ok, receipt_generated: receiptResult.ok });
  } catch (e) {
    console.error('code-of-conduct-public error', e);
    try {
      if (admin && activeRequest?.id) await admin.from('code_of_conduct_events').insert({ request_id: activeRequest.id, event_type: 'sign_failed', metadata: { error_code: 'SIGN_SUBMIT_FAILED', error: (e as Error).message } });
    } catch { /* ignore */ }
    return publicError('SIGN_SUBMIT_FAILED', (e as Error).message || 'Server error', 500);
  }
});
