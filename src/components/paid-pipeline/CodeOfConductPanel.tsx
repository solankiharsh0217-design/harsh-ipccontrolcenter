import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

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
  if (!tpl) setupMissing.push("template");
  else {
    if (!tpl.from_email) setupMissing.push("sender email");
    if (!tpl.from_name) setupMissing.push("sender name");
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
            <Cell label="Member email" value={req.member_email} />
            {req.signature_name && <Cell label="Signed by" value={req.signature_name} />}
            {req.provider_message_id && <Cell label="Provider id" value={req.provider_message_id} />}
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
              <span className="text-[11.5px] text-emerald-700">Signed — ready for Diamond group access.</span>
            ) : req.status === "cancelled" || req.status === "expired" ? (
              <button onClick={requestSend} disabled={sendDisabled} className="ipc-btn ipc-btn-black !h-8 disabled:opacity-50">
                {busy ? "Sending…" : "Resend New Link"}
              </button>
            ) : (
              <>
                <button onClick={requestSend} disabled={sendDisabled} className="ipc-btn ipc-btn-black !h-8 disabled:opacity-50">
                  {busy ? "Sending…" : isFailed ? "Retry Send" : req.status === "sent" || req.status === "viewed" ? "Resend Email" : "Send Email"}
                </button>
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

      {confirmOpen && tpl && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setConfirmOpen(false)}>
          <div className="bg-white rounded-xl border border-line w-full max-w-md p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-[15px] font-semibold mb-3">Send Code of Conduct Email?</div>
            <div className="space-y-1.5 text-[12.5px]">
              <Row k="Member" v={memberName} />
              <Row k="Member email" v={emailOverride} />
              <Row k="Sender" v={`${tpl.from_name} <${tpl.from_email}>`} />
              <Row k="Template" v={`${tpl.name || "—"}${tpl.version ? ` v${tpl.version}` : ""}`} />
              <Row k="Link expiry" v={`${tpl.expiry_days || 7} days`} />
            </div>
            {tpl.from_email === "onboarding@resend.dev" && (
              <div className="mt-3 text-[11.5px] text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
                This test sender may not deliver to all recipients. Use a verified domain sender for real members.
              </div>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setConfirmOpen(false)} className="ipc-btn ipc-btn-ghost">Cancel</button>
              <button onClick={sendEmail} className="ipc-btn ipc-btn-black">Send Email</button>
            </div>
          </div>
        </div>
      )}
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
