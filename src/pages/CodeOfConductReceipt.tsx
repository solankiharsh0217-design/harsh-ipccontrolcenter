import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast as sonnerToast } from "sonner";

const toast = (t: string, d?: string) => sonnerToast.success(t, { description: d });
const toastErr = (t: string, d?: string) => sonnerToast.error(t, { description: d });

interface RequestRow {
  id: string;
  status: string;
  member_name: string;
  member_email: string;
  member_phone: string | null;
  program_name: string | null;
  paid_pipeline_lead_id: string | null;
  crm_lead_id: string | null;
  signed_at: string | null;
  signature_name: string | null;
  signature_data_url: string | null;
  signed_member_name: string | null;
  signed_member_email: string | null;
  corrected_contact_email: string | null;
  acknowledgement_ip: string | null;
  acknowledgement_user_agent: string | null;
  acknowledgement_checklist: string[] | null;
  template_id: string | null;
  template_version: string | null;
  template_name: string | null;
}

interface TemplateRow {
  name: string | null;
  document_title: string | null;
  program_name: string | null;
  version: string | null;
  party_a_name: string | null;
  template_pdf_url: string | null;
}

const DEFAULT_ACK = [
  "I have read and understood the Code of Conduct.",
  "I agree to the responsibilities and terms of the Diamond Membership.",
  "I understand that group/program access may be provided only after acknowledgement.",
  "I confirm that the name and email shown belong to me.",
];

export default function CodeOfConductReceipt() {
  const { requestId } = useParams<{ requestId: string }>();
  const [req, setReq] = useState<RequestRow | null>(null);
  const [tpl, setTpl] = useState<TemplateRow | null>(null);
  const [pdfSignedUrl, setPdfSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!requestId) return;
      try {
        const { data: r, error: e1 } = await (supabase as any)
          .from("code_of_conduct_requests")
          .select("*")
          .eq("id", requestId)
          .maybeSingle();
        if (e1) throw e1;
        if (!r) { setError("Request not found or you do not have access."); return; }
        if (r.status !== "signed") { setError("This request has not been signed yet."); setReq(r); return; }
        setReq(r);

        if (r.template_id) {
          const { data: t } = await (supabase as any)
            .from("code_of_conduct_templates").select("*").eq("id", r.template_id).maybeSingle();
          if (t) {
            setTpl(t);
            if (t.template_pdf_url) {
              const m = t.template_pdf_url.match(/\/storage\/v1\/object\/(?:public|sign)\/code-of-conduct\/([^?]+)/);
              if (m) {
                const { data: signed } = await supabase.storage.from("code-of-conduct").createSignedUrl(decodeURIComponent(m[1]), 60 * 60);
                setPdfSignedUrl(signed?.signedUrl || t.template_pdf_url);
              } else {
                setPdfSignedUrl(t.template_pdf_url);
              }
            }
          }
        }
        await (supabase as any).from("code_of_conduct_events").insert({ request_id: r.id, event_type: "signed_copy_viewed_by_admin" });
      } catch (err: any) {
        setError(err?.message || "Failed to load signed receipt");
      } finally {
        setLoading(false);
      }
    })();
  }, [requestId]);

  const handlePrint = () => window.print();

  const buildHtml = (): string => {
    const node = document.getElementById("ipc-receipt");
    if (!node) return "";
    const css = `
      body{font-family:-apple-system,"Segoe UI",Roboto,Arial,sans-serif;background:#f8fafc;color:#0f172a;margin:0;padding:24px}
      .paper{max-width:780px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:36px 40px;box-shadow:0 1px 4px rgba(15,23,42,.04)}
      h1{font-size:20px;margin:0 0 4px}.sub{color:#64748b;font-size:13px;margin:0 0 24px}
      h2{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#475569;margin:24px 0 8px}
      table{width:100%;border-collapse:collapse;font-size:13px}td{padding:6px 0;vertical-align:top}
      td.k{color:#64748b;width:35%}td.v{color:#0f172a;font-weight:500;word-break:break-word}
      ul{padding-left:18px;margin:4px 0;font-size:13px;line-height:1.55}
      .footer{margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:11.5px;color:#94a3b8;line-height:1.55}
      .stamp{display:inline-block;padding:4px 10px;border-radius:999px;background:#dcfce7;color:#166534;font-size:11px;font-weight:600;letter-spacing:.04em}
      @page{size:A4;margin:18mm}@media print{body{background:#fff;padding:0}.paper{box-shadow:none;border:none}}
    `;
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><title>Signed Acknowledgement Receipt — ${req?.signed_member_name || req?.member_name || ""}</title><style>${css}</style></head><body>${node.outerHTML.replace('id="ipc-receipt"', 'class="paper"')}</body></html>`;
  };

  const handleDownload = () => {
    if (!req) return;
    const html = buildHtml();
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const safeName = (req.signed_member_name || req.member_name || "member").replace(/[^\w-]+/g, "_");
    const a = document.createElement("a");
    a.href = url; a.download = `IPC-Code-of-Conduct-Signed-Receipt-${safeName}-${req.id.slice(0, 8)}.html`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    (supabase as any).from("code_of_conduct_events").insert({ request_id: req.id, event_type: "signed_copy_downloaded_by_admin" });
  };

  const handleCopyAdminLink = async () => {
    if (!req) return;
    await navigator.clipboard.writeText(`${window.location.origin}/code-of-conduct/receipt/${req.id}`);
    toast("Admin receipt link copied");
    (supabase as any).from("code_of_conduct_events").insert({ request_id: req.id, event_type: "signed_copy_link_copied" });
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-500 text-sm">Loading signed receipt…</div>;
  if (error) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="text-base font-medium text-slate-800">Unable to open this receipt</div>
      <div className="text-sm text-slate-500 max-w-md">{error}</div>
      <Link to="/admin-center/code-of-conduct" className="text-sm text-blue-600 underline">Back to Admin</Link>
    </div>
  );
  if (!req) return null;

  const signedAt = req.signed_at ? new Date(req.signed_at).toLocaleString("en-IN", { dateStyle: "long", timeStyle: "medium" }) : "—";
  const ack = (Array.isArray(req.acknowledgement_checklist) && req.acknowledgement_checklist.length > 0) ? req.acknowledgement_checklist : DEFAULT_ACK;

  return (
    <div className="min-h-screen bg-slate-50 py-6 print:bg-white print:py-0">
      <style>{`@media print { .no-print { display:none !important; } body { background:#fff; } }`}</style>
      <div className="max-w-[820px] mx-auto px-4 mb-4 flex items-center justify-between gap-2 no-print">
        <Link to="/admin-center/code-of-conduct" className="text-[13px] text-slate-600 hover:text-slate-900">← Back to Admin</Link>
        <div className="flex gap-2 flex-wrap">
          <button onClick={handlePrint} className="px-3 py-1.5 text-[12.5px] border border-slate-300 rounded-md bg-white hover:bg-slate-50">Print / Save as PDF</button>
          <button onClick={handleDownload} className="px-3 py-1.5 text-[12.5px] border border-slate-300 rounded-md bg-white hover:bg-slate-50">Download HTML Copy</button>
          <button onClick={handleCopyAdminLink} className="px-3 py-1.5 text-[12.5px] border border-slate-300 rounded-md bg-white hover:bg-slate-50">Copy Admin Link</button>
        </div>
      </div>

      <div id="ipc-receipt" className="max-w-[780px] mx-auto bg-white border border-slate-200 rounded-2xl px-10 py-9 shadow-sm">
        <div className="flex items-start justify-between gap-4 mb-2">
          <div>
            <div className="text-[11px] uppercase tracking-[0.08em] text-slate-500">{tpl?.party_a_name || "India Photographers' Club"}</div>
            <h1 className="text-[20px] font-semibold m-0 leading-tight text-slate-900">{tpl?.document_title || "Code of Conduct"} — Signed Acknowledgement Receipt</h1>
          </div>
          <span className="inline-block px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-semibold tracking-wider">SIGNED</span>
        </div>
        <p className="text-[13px] text-slate-500 mb-6">
          {tpl?.program_name || req.program_name || "IPC Diamond Membership"} · Template v{tpl?.version || req.template_version || "1.0"}{tpl?.name ? ` (${tpl.name})` : ""}
        </p>

        <Section title="Member Details">
          <KV k="Member name" v={req.signed_member_name || req.member_name} />
          <KV k="Member email (used for signing)" v={req.signed_member_email || req.member_email} />
          {req.corrected_contact_email && <KV k="Corrected contact email" v={req.corrected_contact_email} />}
          {req.member_phone && <KV k="Member phone" v={req.member_phone} />}
          {req.paid_pipeline_lead_id && <KV k="Paid pipeline lead" v={req.paid_pipeline_lead_id} />}
          {req.crm_lead_id && <KV k="Calling CRM lead" v={req.crm_lead_id} />}
          <KV k="Request ID" v={req.id} />
        </Section>

        <Section title="Signature Evidence">
          <KV k="Signed at" v={signedAt} />
          <KV k="Typed signature name" v={req.signature_name || "—"} />
          <KV k="IP address" v={req.acknowledgement_ip || "—"} />
          <KV k="User agent" v={req.acknowledgement_user_agent || "—"} mono />
        </Section>

        {req.signature_data_url && (
          <div className="mt-3">
            <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1">Drawn signature</div>
            <img src={req.signature_data_url} alt="Signature" className="border border-slate-200 rounded p-2 max-w-[280px] max-h-[120px] bg-white" />
          </div>
        )}

        <Section title="Acknowledgement Checklist">
          <ul className="list-none pl-0 m-0 text-[13px] leading-[1.6] text-slate-800">
            {ack.map((label, i) => (
              <li key={i} className="flex gap-2 items-start"><span className="text-emerald-600 font-semibold">✓</span><span>{label}</span></li>
            ))}
          </ul>
        </Section>

        {pdfSignedUrl && (
          <Section title="Original Agreement Document">
            <a href={pdfSignedUrl} target="_blank" rel="noreferrer" className="text-[12.5px] text-blue-600 underline">View original PDF reference</a>
          </Section>
        )}

        <div className="mt-8 pt-4 border-t border-slate-200 text-[11.5px] text-slate-400 leading-relaxed">
          This receipt confirms that the member acknowledged the Code of Conduct digitally through the secure IPC signing link.
          The typed name, drawn signature (if provided), IP address, user agent, timestamp and acknowledgement checklist above
          are stored as evidence of this acknowledgement. This is a digital acknowledgement record and is not a substitute for legal counsel.
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <h2 className="text-[13px] uppercase tracking-[0.06em] text-slate-600 mt-6 mb-2 font-semibold">{title}</h2>
      <div>{children}</div>
    </>
  );
}
function KV({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex gap-3 py-1 text-[13px]">
      <div className="text-slate-500 w-[35%] shrink-0">{k}</div>
      <div className={`text-slate-900 font-medium break-words flex-1 ${mono ? "font-mono text-[11.5px] text-slate-700" : ""}`}>{v}</div>
    </div>
  );
}
