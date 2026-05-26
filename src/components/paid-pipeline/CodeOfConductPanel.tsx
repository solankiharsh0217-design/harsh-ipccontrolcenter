import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast as sonnerToast } from "sonner";
import EditMemberEmailModal from "./EditMemberEmailModal";

const toast = ({ title, description, variant }: { title: string; description?: string; variant?: "destructive" }) => {
  if (variant === "destructive") sonnerToast.error(title, { description });
  else sonnerToast.success(title, { description });
};

interface Props {
  paidLeadId?: string | null;
  crmLeadId?: string | null;
  memberName: string;
  memberEmail?: string | null;
  memberPhone?: string | null;
  programName?: string | null;
  dealValue?: number | null;
}

const STATUS_STYLES: Record<string, string> = {
  not_required: "bg-slate-100 text-slate-600 border-slate-200",
  required: "bg-amber-50 text-amber-800 border-amber-200",
  ready_to_send: "bg-blue-50 text-blue-700 border-blue-200",
  sent: "bg-indigo-50 text-indigo-700 border-indigo-200",
  viewed: "bg-violet-50 text-violet-700 border-violet-200",
  signed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  expired: "bg-rose-50 text-rose-700 border-rose-200",
  cancelled: "bg-slate-100 text-slate-500 border-slate-200",
  failed: "bg-rose-50 text-rose-700 border-rose-200",
};
const STATUS_LABELS: Record<string, string> = {
  not_required: "Not Required", required: "Required", ready_to_send: "Ready to Send",
  sent: "Sent", viewed: "Viewed", signed: "Signed", expired: "Expired", cancelled: "Cancelled", failed: "Failed",
};

export default function CodeOfConductPanel(props: Props) {
  const { paidLeadId, crmLeadId, memberName, memberEmail, memberPhone, programName, dealValue } = props;
  const [loading, setLoading] = useState(true);
  const [req, setReq] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [emailOverride, setEmailOverride] = useState(memberEmail || "");
  const [signingUrl, setSigningUrl] = useState<string | null>(null);
  const [diag, setDiag] = useState<any>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editEmailOpen, setEditEmailOpen] = useState(false);

  const adminReceiptUrl = (): string | null => (req ? `${window.location.origin}/code-of-conduct/receipt/${req.id}` : null);
  const adminSignedPdfUrl = (): string | null => (req ? `${window.location.origin}/code-of-conduct/signed-pdf/${req.id}` : null);

  const getStorageUrl = async (stored: string | null): Promise<string | null> => {
    if (!stored) return null;
    const m = stored.match(/(?:storage:|\/storage\/v1\/object\/(?:public|sign)\/)signed-code-of-conduct\/(.+?)(?:\?|$)/);
    const path = m ? decodeURIComponent(m[1]) : null;
    if (!path) return stored;
    const { data } = await supabase.storage.from("signed-code-of-conduct").createSignedUrl(path, 60 * 60 * 24 * 7);
    return data?.signedUrl || null;
  };
  const getStoragePdfUrl = async (): Promise<string | null> => req ? getStorageUrl(req.signed_pdf_url || null) : null;
  const getStorageReceiptUrl = async (): Promise<string | null> => {
    if (!req) return null;
    return getStorageUrl(req.signed_html_url || req.signed_receipt_url || null);
  };

  const ensureSignedPdf = async (): Promise<boolean> => {
    if (!req) return false;
    if (req.signed_pdf_url) return true;
    if (req.status !== "signed") { toast({ title: "Request is not signed yet", variant: "destructive" }); return false; }
    toast({ title: "Generating signed PDF…" });
    try {
      const { data, error } = await supabase.functions.invoke("code-of-conduct-public", { body: { action: "admin_regenerate_signed_pdf", request_id: req.id } });
      if (error) throw error;
      if ((data as any)?.ok === false) throw new Error((data as any).message || "Generation failed");
      await load();
      return true;
    } catch (e: any) {
      toast({ title: "Signed PDF generation failed", description: e?.message, variant: "destructive" });
      return false;
    }
  };

  const viewSignedPdf = async () => {
    if (!(await ensureSignedPdf())) return;
    const url = adminSignedPdfUrl();
    if (!url) { toast({ title: "Signed PDF not available yet", variant: "destructive" }); return; }
    window.open(url, "_blank");
    if (req) (supabase as any).from("code_of_conduct_events").insert({ request_id: req.id, event_type: "signed_pdf_viewed_by_admin" });
  };
  const viewHtmlReceipt = () => {
    const url = adminReceiptUrl();
    if (!url) { toast({ title: "Receipt not available yet", variant: "destructive" }); return; }
    window.open(url, "_blank");
  };
  const downloadSignedPdf = async () => {
    if (!req) return;
    if (!(await ensureSignedPdf())) return;
    try {
      const url = await getStoragePdfUrl();
      if (!url) { toast({ title: "Signed PDF link unavailable", description: req.signed_pdf_generation_error || undefined, variant: "destructive" }); return; }
      const resp = await fetch(url);
      const blob = new Blob([await resp.blob()], { type: "application/pdf" });
      const dl = URL.createObjectURL(blob);
      const safeName = (req.signed_member_name || req.member_name || "member").replace(/[^\w-]+/g, "_");
      const a = document.createElement("a");
      a.href = dl; a.download = `IPC-Code-of-Conduct-Signed-${safeName}-${req.id.slice(0,8)}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(dl);
      (supabase as any).from("code_of_conduct_events").insert({ request_id: req.id, event_type: "signed_pdf_downloaded_by_admin" });
    } catch (e: any) {
      toast({ title: "Download failed", description: e?.message, variant: "destructive" });
      if (req) (supabase as any).from("code_of_conduct_events").insert({ request_id: req.id, event_type: "signed_pdf_link_open_failed", metadata: { error: e?.message } });
    }
  };
  const copySignedPdfLink = async () => {
    if (!(await ensureSignedPdf())) return;
    const url = await getStoragePdfUrl();
    if (!url) return;
    await navigator.clipboard.writeText(url);
    toast({ title: "Temporary signed PDF link copied" });
    if (req) (supabase as any).from("code_of_conduct_events").insert({ request_id: req.id, event_type: "signed_pdf_link_copied", metadata: { scope: "temporary_pdf" } });
  };
  const copyMemberPdfLink = async () => {
    if (!(await ensureSignedPdf())) return;
    const url = await getStoragePdfUrl();
    if (!url) { toast({ title: "Signed copy not available yet", variant: "destructive" }); return; }
    await navigator.clipboard.writeText(url);
    toast({ title: "Temporary member PDF link copied (valid 7 days)" });
    if (req) (supabase as any).from("code_of_conduct_events").insert({ request_id: req.id, event_type: "signed_pdf_link_copied", metadata: { scope: "member_temp" } });
  };
  const sendSignedCopy = async (mode: "admin" | "member") => {
    if (!req) return;
    if (!(await ensureSignedPdf())) return;
    try {
      const { data, error } = await supabase.functions.invoke("send-coc-signed-copy", { body: { request_id: req.id, mode } });
      if (error) throw error;
      if ((data as any)?.ok === false) throw new Error((data as any).message);
      const result = mode === "admin" ? (data as any)?.results?.admin?.find((x: any) => x.ok) : (data as any)?.results?.member;
      toast({ title: `Signed PDF sent to ${result?.to || mode}`, description: result?.provider_message_id ? `Provider id: ${result.provider_message_id}` : undefined });
      load();
    } catch (e: any) { toast({ title: "Failed to send signed copy", description: e?.message, variant: "destructive" }); }
  };
  const regenPdf = async () => {
    if (!req) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("code-of-conduct-public", { body: { action: "admin_regenerate_signed_pdf", request_id: req.id } });
      if (error) throw error;
      if ((data as any)?.ok === false) throw new Error((data as any).message);
      toast({ title: "Signed PDF generated" });
      await load();
    } catch (e: any) { toast({ title: "Could not generate signed PDF", description: e?.message, variant: "destructive" }); }
    finally { setBusy(false); }
  };
  const regenReceipt = async () => {
    if (!req) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("code-of-conduct-public", { body: { action: "admin_regenerate_receipt", request_id: req.id } });
      if (error) throw error;
      if ((data as any)?.ok === false) throw new Error((data as any).message);
      toast({ title: "Signed copy generated" });
      await load();
    } catch (e: any) { toast({ title: "Could not generate signed copy", description: e?.message, variant: "destructive" }); }
    finally { setBusy(false); }
  };


  const load = async () => {
    setLoading(true);
    let q = (supabase as any).from("code_of_conduct_requests").select("*").order("created_at", { ascending: false }).limit(1);
    if (paidLeadId) q = q.eq("paid_pipeline_lead_id", paidLeadId);
    else if (crmLeadId) q = q.eq("crm_lead_id", crmLeadId);
    else { setLoading(false); return; }
    const { data } = await q;
    setReq(data?.[0] || null);
    setLoading(false);
  };

  const loadDiag = async () => {
    try {
      const { data } = await supabase.functions.invoke("send-code-of-conduct-email", { body: { action: "diagnostics" } });
      setDiag(data);
    } catch { /* ignore */ }
  };

  useEffect(() => { load(); loadDiag(); /* eslint-disable-next-line */ }, [paidLeadId, crmLeadId]);

  const tpl = diag?.template;
  const setupMissing: string[] = [];
  if (!diag?.has_resend_api_key) setupMissing.push("RESEND_API_KEY");
  if (!tpl?.from_email && !diag?.has_email_from_address) setupMissing.push("EMAIL_FROM_ADDRESS");
  if (!tpl?.from_name && !diag?.has_email_from_name) setupMissing.push("EMAIL_FROM_NAME");
  if (!tpl) setupMissing.push("template");
  else {
    if (!tpl.email_subject) setupMissing.push("email subject");
    if (!tpl.email_body) setupMissing.push("email body");
    if (!tpl.template_pdf_url && !tpl.html_content) setupMissing.push("PDF/HTML");
    if (!tpl.whatsapp_redirect_url) setupMissing.push("WhatsApp URL");
  }
  const setupComplete = setupMissing.length === 0;

  const requestSend = () => {
    if (!emailOverride || !emailOverride.includes("@")) { toast({ title: "Valid email required", variant: "destructive" }); return; }
    if (!setupComplete) { toast({ title: "Email setup incomplete", description: `Missing: ${setupMissing.join(", ")}`, variant: "destructive" }); return; }
    setConfirmOpen(true);
  };

  const sendEmail = async () => {
    setConfirmOpen(false);
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-code-of-conduct-email", {
        body: {
          request_id: req?.id || undefined,
          paid_pipeline_lead_id: paidLeadId || undefined,
          crm_lead_id: crmLeadId || undefined,
          member_name: memberName, member_email: emailOverride, member_phone: memberPhone,
          program_name: programName, deal_value: dealValue,
          origin: window.location.origin,
        },
      });
      if (error) throw error;
      const res = data as any;
      if (res?.ok === false) throw new Error(`[${res.error_code}] ${res.message}`);
      if (res?.signing_url) setSigningUrl(res.signing_url);
      toast({ title: `Code of Conduct email sent to ${emailOverride}` });
      await load();
    } catch (e: any) {
      toast({ title: "Code of Conduct email failed", description: e?.message || "Unknown error", variant: "destructive" });
      await load();
    } finally { setBusy(false); }
  };

  const cancel = async () => {
    if (!req) return;
    if (!confirm("Cancel this signing request? The link will stop working.")) return;
    await (supabase as any).from("code_of_conduct_requests").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", req.id);
    await (supabase as any).from("code_of_conduct_events").insert({ request_id: req.id, event_type: "request_cancelled" });
    toast({ title: "Request cancelled" });
    setSigningUrl(null);
    load();
  };

  const copyLink = async () => {
    if (!signingUrl) return;
    await navigator.clipboard.writeText(signingUrl);
    toast({ title: "Signing link copied" });
    if (req) await (supabase as any).from("code_of_conduct_events").insert({ request_id: req.id, event_type: "signing_link_copied_by_admin" });
  };

  const isFailed = !!req?.last_email_error_code;
  const displayStatus = isFailed ? "failed" : (req?.status || "not_required");
  const cls = STATUS_STYLES[displayStatus] || STATUS_STYLES.not_required;
  const sendDisabled = busy || !setupComplete;

  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-700">📜 Code of Conduct</div>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-medium border ${cls}`}>{STATUS_LABELS[displayStatus]}</span>
        </div>
        {req?.template_version && <span className="text-[10.5px] text-slate-400">v{req.template_version}</span>}
      </div>

      {!setupComplete && diag && (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-[11.5px] text-amber-900">
          <div className="font-medium">Email setup incomplete</div>
          <div className="opacity-80">Missing: {setupMissing.join(", ")}</div>
          <Link to="/admin-center/code-of-conduct" className="inline-block mt-1.5 text-[11.5px] font-medium underline">Open Email Setup →</Link>
        </div>
      )}

      {loading ? (
        <div className="text-[12px] text-slate-500">Loading…</div>
      ) : !req ? (
        <div className="space-y-2.5">
          <p className="text-[12px] text-slate-600">No Code of Conduct request created yet. Send the agreement to capture digital acknowledgement before adding the member to the Diamond group.</p>
          <input type="email" value={emailOverride} onChange={(e) => setEmailOverride(e.target.value)}
            className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-[12.5px]" placeholder="Member email" />
          <button onClick={requestSend} disabled={sendDisabled} className="ipc-btn ipc-btn-black !h-9 w-full disabled:opacity-50">
            {busy ? "Sending…" : "Send Code of Conduct Email"}
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          <div className="grid grid-cols-2 gap-2 text-[11.5px]">
            <Cell label="Sent" value={req.sent_at ? new Date(req.sent_at).toLocaleString() : "—"} />
            <Cell label="Viewed" value={req.viewed_at ? new Date(req.viewed_at).toLocaleString() : "—"} />
            <Cell label="Signed" value={req.signed_at ? new Date(req.signed_at).toLocaleString() : "—"} />
            <Cell label="Expires" value={req.token_expires_at ? new Date(req.token_expires_at).toLocaleDateString() : "—"} />
            <Cell label="Member email" value={req.signed_member_email || req.member_email} />
            {req.signature_name && <Cell label="Signed by" value={req.signature_name} />}
            {req.corrected_contact_email && <Cell label="Corrected contact" value={req.corrected_contact_email} />}
            <Cell label="Request id" value={req.id.slice(0, 8)} />
          </div>
          {isFailed && (
            <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1.5">
              <div className="font-medium">Email failed</div>
              <div className="opacity-80">[{req.last_email_error_code}] {req.last_email_error}</div>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            {req.status === "signed" ? (
              <>
                <button onClick={viewSignedPdf} className="ipc-btn ipc-btn-black !h-8">View Signed PDF</button>
                {req.signed_pdf_url ? (
                  <button onClick={downloadSignedPdf} className="ipc-btn ipc-btn-ghost !h-8">Download PDF</button>
                ) : (
                  <button onClick={regenPdf} disabled={busy} className="ipc-btn ipc-btn-ghost !h-8 disabled:opacity-50">{busy ? "Generating…" : "Generate Signed PDF"}</button>
                )}
                {req.signed_pdf_generation_error && <div className="basis-full text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1">PDF error: {req.signed_pdf_generation_error}</div>}
                <SignedMoreMenu
                  onCopyPdf={copySignedPdfLink}
                  onCopyMember={copyMemberPdfLink}
                  onSendAdmin={() => sendSignedCopy("admin")}
                  onSendMember={() => sendSignedCopy("member")}
                  onViewReceipt={viewHtmlReceipt}
                  onEditEmail={() => setEditEmailOpen(true)}
                  onRegenPdf={regenPdf}
                  onRegenReceipt={regenReceipt}
                  hasPdf={!!req.signed_pdf_url}
                  hasReceipt={!!(req.signed_html_url || req.signed_receipt_url)}
                />
              </>
            ) : req.status === "cancelled" || req.status === "expired" ? (
              <>
                <button onClick={requestSend} disabled={sendDisabled} className="ipc-btn ipc-btn-black !h-8 disabled:opacity-50">
                  {busy ? "Sending…" : "Resend New Link"}
                </button>
                <button onClick={() => setEditEmailOpen(true)} className="ipc-btn ipc-btn-ghost !h-8">Change Email & Resend</button>
              </>
            ) : (
              <>
                <button onClick={requestSend} disabled={sendDisabled} className="ipc-btn ipc-btn-black !h-8 disabled:opacity-50">
                  {busy ? "Sending…" : isFailed ? "Retry Send" : req.status === "sent" || req.status === "viewed" ? "Resend Email" : "Send Email"}
                </button>
                <button onClick={() => setEditEmailOpen(true)} className="ipc-btn ipc-btn-ghost !h-8">Edit Email</button>
                {signingUrl && (
                  <button onClick={copyLink} className="ipc-btn ipc-btn-ghost !h-8">Copy Signing Link</button>
                )}
                <button onClick={cancel} className="ipc-btn ipc-btn-ghost !h-8">Cancel</button>
              </>
            )}
          </div>
          {!signingUrl && (req.status === "sent" || req.status === "viewed" || isFailed) && (
            <div className="text-[10.5px] text-slate-400">Tip: click {isFailed ? "Retry Send" : "Resend Email"} to also receive a fresh copyable signing link.</div>
          )}
        </div>
      )}

      {req && (
        <EditMemberEmailModal
          open={editEmailOpen}
          onClose={() => setEditEmailOpen(false)}
          requestId={req.id}
          currentEmail={req.member_email || ""}
          isSigned={req.status === "signed"}
          onUpdated={load}
        />
      )}

      {confirmOpen && tpl && (() => {
        const sFromEmail = diag?.resolved_from_email || tpl.from_email || "";
        const sFromName = diag?.resolved_from_name || tpl.from_name || "";
        const sReplyTo = diag?.resolved_reply_to || tpl.reply_to_email || "—";
        const looksUnverified = !sFromEmail || sFromEmail === "onboarding@resend.dev";
        return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setConfirmOpen(false)}>
          <div className="bg-white rounded-xl border border-line w-full max-w-md p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-[15px] font-semibold mb-3">Send Code of Conduct Email?</div>
            <div className="space-y-1.5 text-[12.5px]">
              <Row k="Member" v={memberName} />
              <Row k="Member email" v={emailOverride} />
              <Row k="Sender email" v={sFromEmail || "—"} />
              <Row k="Sender name" v={sFromName || "—"} />
              <Row k="Reply-to" v={sReplyTo} />
              <Row k="Template" v={`${tpl.name || "—"}${tpl.version ? ` v${tpl.version}` : ""}`} />
              <Row k="Link expiry" v={`${tpl.expiry_days || 7} days`} />
            </div>
            {looksUnverified && (
              <div className="mt-3 text-[11.5px] text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
                This sender may not deliver to all recipients. Use a verified Resend domain sender for real members.
              </div>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setConfirmOpen(false)} className="ipc-btn ipc-btn-ghost">Cancel</button>
              <button onClick={sendEmail} className="ipc-btn ipc-btn-black">Send Email</button>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="text-[12px] text-slate-700 truncate" title={value}>{value}</div>
    </div>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-slate-800 text-right truncate" title={v}>{v}</span>
    </div>
  );
}

function SignedMoreMenu(props: {
  onCopyPdf: () => void; onCopyMember: () => void; onViewReceipt: () => void;
  onSendAdmin: () => void; onSendMember: () => void;
  onEditEmail: () => void; onRegenPdf: () => void; onRegenReceipt: () => void; hasPdf: boolean; hasReceipt: boolean;
}) {
  const [open, setOpen] = useState(false);
  const close = (fn: () => void) => () => { setOpen(false); fn(); };
  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="ipc-btn ipc-btn-ghost !h-8" aria-label="More actions">More ▾</button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 z-50 bg-white border border-line rounded-md shadow-lg w-56 py-1 text-[12.5px]">
            <MenuItem onClick={close(props.onCopyPdf)} disabled={!props.hasPdf}>Copy Signed PDF Link</MenuItem>
            <MenuItem onClick={close(props.onCopyMember)} disabled={!props.hasPdf}>Copy Member PDF Link</MenuItem>
            <div className="border-t border-line my-1" />
            <MenuItem onClick={close(props.onSendAdmin)}>Send Signed PDF to Admin</MenuItem>
            <MenuItem onClick={close(props.onSendMember)}>Send Signed PDF to Member</MenuItem>
            <div className="border-t border-line my-1" />
            <MenuItem onClick={close(props.onViewReceipt)} disabled={!props.hasReceipt}>View HTML Receipt</MenuItem>
            <MenuItem onClick={close(props.onRegenPdf)}>Regenerate Signed PDF</MenuItem>
            <MenuItem onClick={close(props.onRegenReceipt)}>Regenerate HTML Receipt</MenuItem>
            <MenuItem onClick={close(props.onEditEmail)}>Edit Contact Email</MenuItem>
          </div>
        </>
      )}
    </div>
  );
}
function MenuItem({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="w-full text-left px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white">{children}</button>
  );
}
