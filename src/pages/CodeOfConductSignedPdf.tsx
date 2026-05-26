import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast as sonnerToast } from "sonner";

const toast = (title: string, description?: string) => sonnerToast.success(title, { description });
const toastErr = (title: string, description?: string) => sonnerToast.error(title, { description });

function extractPath(stored?: string | null) {
  if (!stored) return null;
  const m = stored.match(/(?:storage:|\/storage\/v1\/object\/(?:public|sign)\/)signed-code-of-conduct\/(.+?)(?:\?|$)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export default function CodeOfConductSignedPdf() {
  const { requestId } = useParams<{ requestId: string }>();
  const [req, setReq] = useState<any | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!requestId) return;
    setLoading(true);
    setError(null);
    try {
      const { data: r, error: e } = await (supabase as any).from("code_of_conduct_requests").select("*").eq("id", requestId).maybeSingle();
      if (e) throw e;
      if (!r) throw new Error("Request not found or you do not have access.");
      setReq(r);
      const path = extractPath(r.signed_pdf_url);
      if (!path) throw new Error(r.signed_pdf_generation_error || "Signed PDF has not been generated yet.");
      const { data, error: urlErr } = await supabase.storage.from("signed-code-of-conduct").createSignedUrl(path, 60 * 60 * 24 * 7);
      if (urlErr || !data?.signedUrl) throw new Error(urlErr?.message || "SIGNED_PDF_LINK_GENERATION_FAILED");
      setPdfUrl(data.signedUrl);
      await (supabase as any).from("code_of_conduct_events").insert({ request_id: r.id, event_type: "signed_pdf_viewed_by_admin" });
    } catch (err: any) {
      setError(err?.message || "Unable to open signed PDF");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [requestId]);

  const download = async () => {
    if (!req || !pdfUrl) return;
    const resp = await fetch(pdfUrl);
    const blob = await resp.blob();
    const url = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
    const safeName = (req.signed_member_name || req.member_name || "member").replace(/[^\w-]+/g, "_");
    const a = document.createElement("a");
    a.href = url;
    a.download = `IPC-Code-of-Conduct-Signed-${safeName}-${req.id.slice(0, 8)}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    await (supabase as any).from("code_of_conduct_events").insert({ request_id: req.id, event_type: "signed_pdf_downloaded_by_admin" });
  };

  const send = async (mode: "admin" | "member") => {
    if (!req) return;
    try {
      const { data, error } = await supabase.functions.invoke("send-coc-signed-copy", { body: { request_id: req.id, mode } });
      if (error) throw error;
      if ((data as any)?.ok === false) throw new Error(`[${(data as any).error_code}] ${(data as any).message}`);
      const result = mode === "admin" ? (data as any)?.results?.admin?.find((x: any) => x.ok) : (data as any)?.results?.member;
      toast(`Signed PDF sent to ${result?.to || mode}`, result?.provider_message_id ? `Provider id: ${result.provider_message_id}` : undefined);
    } catch (err: any) {
      toastErr("Signed PDF send failed", err?.message || "UNKNOWN_SEND_ERROR");
    }
  };

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center text-[13px] text-muted-foreground">Loading signed PDF…</div>;
  if (error) return (
    <div className="max-w-[720px] mx-auto p-6">
      <div className="border border-line bg-card rounded-lg p-5">
        <div className="font-semibold text-card-foreground">Unable to open signed PDF</div>
        <div className="text-[13px] text-muted-foreground mt-1">{error}</div>
        <Link to="/admin-center/code-of-conduct" className="ipc-btn ipc-btn-ghost mt-4">Back to Requests</Link>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <Link to="/admin-center/code-of-conduct" className="text-[12px] text-muted-foreground hover:text-foreground">← Back to Request</Link>
          <h1 className="text-[20px] font-semibold text-foreground mt-1">Signed Code of Conduct PDF</h1>
          <div className="text-[12px] text-muted-foreground">{req?.signed_member_name || req?.member_name} · Request {req?.id?.slice(0, 8)}</div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={download} className="ipc-btn ipc-btn-black">Download Signed PDF</button>
          <button onClick={() => window.print()} className="ipc-btn ipc-btn-ghost">Print</button>
          <button onClick={() => send("admin")} className="ipc-btn ipc-btn-ghost">Send to Admin</button>
          <button onClick={() => send("member")} className="ipc-btn ipc-btn-ghost">Send to Member</button>
        </div>
      </div>
      <div className="border border-line rounded-lg overflow-hidden bg-card h-[78vh]">
        {pdfUrl && <iframe src={pdfUrl} title="Signed Code of Conduct PDF" className="w-full h-full" />}
      </div>
    </div>
  );
}