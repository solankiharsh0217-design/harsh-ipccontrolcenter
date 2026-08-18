import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import DOMPurify from "dompurify";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/code-of-conduct-public`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

interface Payload {
  request: any;
  template: any;
}

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_TOKEN: "This signing link is invalid.",
  REQUEST_NOT_FOUND: "This Code of Conduct link is no longer active. Please open the most recent email from Team IPC, or ask them to resend it.",
  REQUEST_CANCELLED: "This request is no longer active.",
  TOKEN_EXPIRED: "This link has expired. Please contact Team IPC.",
  TEMPLATE_NOT_FOUND: "The agreement template is no longer available. Please contact Team IPC.",
  DOCUMENT_NOT_FOUND: "The agreement document is not configured yet. Please contact Team IPC.",
  SIGNATURE_REQUIRED: "Please draw your digital signature before submitting.",
  SIGNATURE_NAME_REQUIRED: "Please type your full name.",
  SIGNATURE_TOO_SMALL: "Your signature looks too small. Please draw a fuller signature.",
  ACKNOWLEDGEMENT_REQUIRED: "Please acknowledge all items.",
  BONUS_TERMS_REQUIRED: "Please accept the Bonus Access Terms to continue.",
  SIGN_SUBMIT_FAILED: "We could not submit your signature. Please try again.",
};

const ACK_ITEMS = [
  "I have read and understood the Code of Conduct.",
  "I agree to the responsibilities and terms of the Diamond Membership.",
  "I understand that group/program access may be provided only after acknowledgement.",
  "I confirm that the name and email shown belong to me.",
];

function fillVars(html: string, vars: Record<string, string>) {
  return Object.entries(vars).reduce((acc, [k, v]) => acc.split(`{{${k}}}`).join(v), html || "");
}

export default function CodeOfConductSign() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pdfPreparing, setPdfPreparing] = useState(false);
  const [name, setName] = useState("");
  const [acks, setAcks] = useState<boolean[]>([false, false, false, false]);
  const [bonusTermsAccepted, setBonusTermsAccepted] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const bonusTermsText: string = (data as any)?.bonus_terms?.text || "";
  const bonusTermsVersion: number | null = (data as any)?.bonus_terms?.version ?? null;
  const bonusTermsRequired = !!bonusTermsText.trim();
  const canSubmit = !!name.trim() && acks.every(Boolean) && hasDrawn && !submitting && (!bonusTermsRequired || bonusTermsAccepted);

  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch(FN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: ANON, Authorization: `Bearer ${ANON}` },
          body: JSON.stringify({ token, action: "fetch" }),
        });
        const json = await resp.json();
        if (!resp.ok) {
          setError(ERROR_MESSAGES[json.error_code] || json.message || json.error || "Failed to load");
          setErrorStatus(json.status || null);
        } else {
          setData(json);
          if (!name && json?.request?.member_name) setName(json.request.member_name);
        }
      } catch (e: any) {
        setError(e?.message || "Network error");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (data?.request?.status !== "signed" || data.request.signed_pdf_url || data.request.signed_pdf_generation_error || !token) return;
    setPdfPreparing(true);
    let stopped = false;
    let attempts = 0;
    const poll = async () => {
      attempts += 1;
      try {
        const resp = await fetch(FN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: ANON, Authorization: `Bearer ${ANON}` },
          body: JSON.stringify({ token, action: "fetch" }),
        });
        const json = await resp.json();
        if (!stopped && resp.ok) {
          setData(json);
          if (json?.request?.signed_pdf_url || json?.request?.signed_pdf_generation_error || attempts >= 8) setPdfPreparing(false);
          else window.setTimeout(poll, 2500);
        }
      } catch {
        if (!stopped && attempts < 8) window.setTimeout(poll, 2500);
        else setPdfPreparing(false);
      }
    };
    const id = window.setTimeout(poll, 1500);
    return () => { stopped = true; window.clearTimeout(id); };
  }, [data?.request?.status, data?.request?.signed_pdf_url, data?.request?.signed_pdf_generation_error, token]);

  // Signature canvas
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const resize = () => {
      const r = c.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      c.width = Math.max(1, Math.floor(r.width * ratio));
      c.height = Math.max(1, Math.floor(r.height * ratio));
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#111";
    };
    resize();
    const getPos = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const start = (e: PointerEvent) => { e.preventDefault(); c.setPointerCapture?.(e.pointerId); drawingRef.current = true; const { x, y } = getPos(e); ctx.beginPath(); ctx.moveTo(x, y); };
    const move = (e: PointerEvent) => { if (!drawingRef.current) return; e.preventDefault(); const { x, y } = getPos(e); ctx.lineTo(x, y); ctx.stroke(); setHasDrawn(true); };
    const end = (e: PointerEvent) => { drawingRef.current = false; c.releasePointerCapture?.(e.pointerId); };
    c.addEventListener("pointerdown", start);
    c.addEventListener("pointermove", move);
    c.addEventListener("pointerup", end);
    c.addEventListener("pointercancel", end);
    window.addEventListener("resize", resize);
    return () => {
      c.removeEventListener("pointerdown", start);
      c.removeEventListener("pointermove", move);
      c.removeEventListener("pointerup", end);
      c.removeEventListener("pointercancel", end);
      window.removeEventListener("resize", resize);
    };
  }, [data]);

  const clearSig = () => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    const r = c.getBoundingClientRect();
    ctx.clearRect(0, 0, r.width, r.height); setHasDrawn(false);
  };

  /** Count non-transparent, non-white pixels on the signature canvas. */
  const countSignaturePixels = (): { inked: number; total: number; bboxArea: number } => {
    const c = canvasRef.current;
    if (!c) return { inked: 0, total: 0, bboxArea: 0 };
    const ctx = c.getContext("2d");
    if (!ctx) return { inked: 0, total: 0, bboxArea: 0 };
    try {
      const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
      let inked = 0, minX = width, minY = height, maxX = 0, maxY = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          const a = data[i + 3];
          if (a > 20) {
            // treat as ink (canvas is transparent by default; anti-white check redundant)
            inked++;
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
          }
        }
      }
      const bboxArea = inked ? Math.max(0, maxX - minX) * Math.max(0, maxY - minY) : 0;
      return { inked, total: width * height, bboxArea };
    } catch { return { inked: 0, total: 0, bboxArea: 0 }; }
  };

  const submit = async () => {
    if (!name.trim()) { setError("Please type your full name."); return; }
    if (acks.some((a) => !a)) { setError("Please acknowledge all items."); return; }
    if (!hasDrawn) { setError("Please draw your digital signature before submitting."); return; }
    // Real-signature check: require enough inked pixels AND a meaningful bounding box.
    const { inked, bboxArea } = countSignaturePixels();
    if (inked < 60 || bboxArea < 600) {
      setError("Your signature looks empty or too small. Please draw a fuller signature.");
      return;
    }
    if (bonusTermsRequired && !bonusTermsAccepted) { setError("Please accept the Bonus Access Terms to continue."); return; }
    setSubmitting(true); setError(null);
    const sig = canvasRef.current?.toDataURL("image/png") || null;
    try {
      const resp = await fetch(FN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: ANON, Authorization: `Bearer ${ANON}` },
        body: JSON.stringify({
          token, action: "sign", signature_name: name, signature_data_url: sig,
          acknowledgements: acks, acknowledgement_labels: ACK_ITEMS,
          bonus_terms_accepted: bonusTermsRequired ? bonusTermsAccepted : false,
          bonus_terms_version: bonusTermsVersion,
        }),
      });
      const json = await resp.json();
      if (!resp.ok) { setError(ERROR_MESSAGES[json.error_code] || json.message || json.error || "Failed to submit"); }
      else { setData(json); }
    } catch (e: any) { setError(e?.message || "Network error"); }
    finally { setSubmitting(false); }
  };

  const onWhatsAppClick = async () => {
    try {
      await fetch(FN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: ANON, Authorization: `Bearer ${ANON}` },
        body: JSON.stringify({ token, action: "whatsapp_click" }),
      });
    } catch {}
  };

  const renderedHtml = useMemo(() => {
    if (!data?.template?.html_content || !data?.request) return null;
    const vars = {
      member_name: data.request.member_name || "",
      member_email: data.request.member_email || "",
      program_name: data.template.program_name || data.request.program_name || "IPC Diamond Membership",
      party_a_name: data.template.party_a_name || "India Photographers' Club",
      today: new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }),
    };
    const filled = fillVars(data.template.html_content, vars);
    return DOMPurify.sanitize(filled, { USE_PROFILES: { html: true } });
  }, [data]);

  if (loading) return <FullCenter><div className="text-sm text-slate-500">Loading…</div></FullCenter>;

  if (error && !data) return (
    <FullCenter>
      <div className="max-w-md w-full bg-white border rounded-xl p-8 text-center shadow-sm">
        <div className="text-amber-600 text-3xl mb-2">⚠</div>
        <h1 className="text-lg font-semibold mb-2">Unable to open this link</h1>
        <p className="text-sm text-slate-600">{error}</p>
        {errorStatus === "expired" && <p className="text-xs text-slate-500 mt-3">Please contact Team IPC for a new link.</p>}
      </div>
    </FullCenter>
  );

  if (!data) return null;

  const { request, template } = data;
  const isSigned = request.status === "signed";

  if (isSigned) {
    const waUrl = request.whatsapp_redirect_url_visible;
    // Access/next-steps CTA is resolved per request (snapshot first) — never a global URL.
    const accessUrl: string | null = request.access_link_resolved || null;
    const fmtMonths = (m: number | null) => (!m ? null : m >= 12 ? `${m / 12} Year${m / 12 > 1 ? "s" : ""}` : `${m} Month${m > 1 ? "s" : ""}`);
    const accessDuration = fmtMonths(request.access_duration_months ?? null);
    const supportDuration = fmtMonths(request.support_duration_months ?? null);
    const signedPdf = request.signed_pdf_url;
    return (
      <FullCenter>
        <div className="max-w-lg w-full bg-white border rounded-xl p-8 shadow-sm">
          <div className="text-emerald-600 text-3xl mb-2">✓</div>
          <h1 className="text-xl font-semibold mb-1">Your Code of Conduct has been signed successfully.</h1>
          <p className="text-sm text-slate-600 mb-4">{template?.success_page_message || "Thank you for completing the digital acknowledgement."}</p>
          <p className="text-[12.5px] text-slate-500 mb-5">Signed at {request.signed_at ? new Date(request.signed_at).toLocaleString() : "—"}</p>

          <div className="flex flex-col gap-2.5 mb-5">
            {signedPdf ? (
              <a href={signedPdf} target="_blank" rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg border border-slate-300 text-slate-800 font-medium text-sm hover:bg-slate-50">
                Download Signed Code of Conduct PDF
              </a>
            ) : request.signed_pdf_generation_error ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] text-amber-900">
                Your acknowledgement was recorded, but signed PDF generation failed. Team IPC has been notified.
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-[12.5px] text-slate-600">
                {pdfPreparing ? "Preparing your signed PDF..." : "Preparing your signed PDF..."}
              </div>
            )}
            {accessUrl && (
              <a href={accessUrl} target="_blank" rel="noreferrer" onClick={onWhatsAppClick}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-slate-900 text-white font-medium text-sm hover:bg-slate-800">
                Open Your Next Steps →
              </a>
            )}
            {(accessDuration || supportDuration) && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-[12.5px] text-slate-700 text-center">
                {[accessDuration && `${accessDuration} Access`, supportDuration && `${supportDuration} Support`].filter(Boolean).join(" · ")}
              </div>
            )}
            {waUrl && (
              <a href={waUrl} target="_blank" rel="noreferrer" onClick={onWhatsAppClick}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-[#25D366] text-white font-medium text-sm hover:bg-[#1ebe5c]">
                Join Diamond Members WhatsApp Group →
              </a>
            )}
          </div>

          <p className="text-[12px] text-slate-500">Our team will review and activate the next access steps.</p>
          <p className="text-[11px] text-slate-400 mt-4">Request ID {request.id?.slice(0, 8)} · Template v{template?.version || "1.0"}</p>
        </div>
      </FullCenter>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header strip */}
        <div className="bg-white border border-slate-200 rounded-t-xl px-7 py-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1">{template?.party_a_name || "India Photographers' Club"}</div>
              <h1 className="text-xl font-semibold text-slate-900">{template?.document_title || "Code of Conduct"}</h1>
              <p className="text-sm text-slate-600 mt-1">{template?.program_name || request.program_name || "Diamond Membership"}</p>
            </div>
            <div className="text-right text-[11.5px] text-slate-500">
              <div>Template v{template?.version || "1.0"}</div>
              <div className="mt-0.5">Request {request.id?.slice(0, 8)}</div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-[12.5px] border-t pt-3">
            <div><div className="text-slate-500">Member</div><div className="font-medium text-slate-800">{request.member_name}</div></div>
            <div><div className="text-slate-500">Email</div><div className="font-medium text-slate-800">{request.member_email}</div></div>
          </div>
        </div>

        {/* Document body (Google Docs-style paper) */}
        <div className="bg-white border-x border-slate-200 px-7 sm:px-12 py-10 shadow-sm">
          <p className="text-[12px] text-slate-500 mb-4 italic">Please read the agreement carefully before signing.</p>

          {renderedHtml ? (
            <article
              className="prose prose-slate max-w-none prose-headings:font-semibold prose-h2:text-lg prose-h2:mt-6 prose-h3:text-base prose-h3:mt-5 prose-p:text-[14px] prose-p:leading-relaxed prose-li:text-[14px] prose-li:leading-relaxed prose-ul:my-2"
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />
          ) : template?.template_pdf_url ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-5">
                <h2 className="text-base font-semibold text-slate-800 mb-1">Agreement Document</h2>
                <p className="text-[13px] text-slate-600 mb-3">The full agreement is provided as a PDF. Please open or download it below, read it carefully, and acknowledge at the bottom of this page.</p>
                <div className="flex flex-wrap gap-2">
                  <a href={template.template_pdf_url} target="_blank" rel="noreferrer" className="inline-flex items-center px-4 py-2 rounded-md bg-slate-900 text-white text-[12.5px] font-medium hover:bg-black">View original PDF ↗</a>
                  <a href={template.template_pdf_url} download className="inline-flex items-center px-4 py-2 rounded-md border border-slate-300 text-slate-800 text-[12.5px] font-medium hover:bg-slate-50">Download original PDF</a>
                </div>
              </div>
              <details className="rounded-lg border border-slate-200">
                <summary className="cursor-pointer px-4 py-2.5 text-[12.5px] text-slate-700 hover:bg-slate-50">Show inline preview</summary>
                <div className="border-t" style={{ height: 480 }}>
                  <iframe src={template.template_pdf_url} className="w-full h-full" title="Code of Conduct PDF" />
                </div>
              </details>
            </div>
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-[13px] text-amber-800">
              The agreement document is being prepared. Please continue with your acknowledgement below — Team IPC will share the signed document copy with you over email.
            </div>
          )}

          {renderedHtml && template?.template_pdf_url && (
            <p className="text-[12px] text-slate-500 mt-6">
              Reference copy: <a href={template.template_pdf_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">View original PDF ↗</a>
              {" · "}
              <a href={template.template_pdf_url} download className="text-blue-600 hover:underline">Download</a>
            </p>
          )}
        </div>

        {/* Sign-off panel */}
        <div className="bg-white border border-slate-200 rounded-b-xl px-7 py-7 shadow-sm space-y-6">
          <section>
            <h2 className="text-sm font-semibold text-slate-800 mb-2">Acknowledgement</h2>
            <div className="space-y-2">
              {ACK_ITEMS.map((label, i) => (
                <label key={i} className="flex items-start gap-3 text-[13.5px] text-slate-700">
                  <input type="checkbox" className="mt-0.5 w-4 h-4 accent-slate-900" checked={acks[i]} onChange={(e) => setAcks((a) => { const n = [...a]; n[i] = e.target.checked; return n; })} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-slate-800 mb-2">Signature</h2>
            <label className="block text-[12px] text-slate-600 mb-1">Typed full name <span className="text-rose-500">*</span></label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-slate-900/20" placeholder="Type your full legal name" />
            <label className="block text-[12px] text-slate-600 mb-1">Draw signature <span className="text-rose-500">*</span></label>
            <div className="border border-slate-300 rounded-md bg-white">
              <canvas ref={canvasRef} className="w-full block touch-none" style={{ height: 140 }} />
            </div>
            <button type="button" onClick={clearSig} className="text-[11.5px] text-slate-500 hover:text-slate-700 mt-1">Clear signature</button>
            <div className="mt-3 grid grid-cols-2 gap-3 text-[12px] text-slate-600">
              <div><span className="text-slate-500">Date: </span>{new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</div>
              <div><span className="text-slate-500">Email: </span>{request.member_email}</div>
            </div>
          </section>

          {bonusTermsRequired && (
            <section className="rounded-lg border border-amber-200 bg-amber-50/60 p-4">
              <h2 className="text-sm font-semibold text-slate-800 mb-2">Bonus Access Terms {bonusTermsVersion ? <span className="text-[11px] font-normal text-slate-500">· v{bonusTermsVersion}</span> : null}</h2>
              <div className="text-[13px] text-slate-700 whitespace-pre-line leading-relaxed max-h-72 overflow-auto pr-1">{bonusTermsText}</div>
              <label className="mt-3 flex items-start gap-3 text-[13.5px] text-slate-800">
                <input type="checkbox" className="mt-0.5 w-4 h-4 accent-slate-900" checked={bonusTermsAccepted} onChange={(e) => setBonusTermsAccepted(e.target.checked)} />
                <span>I agree to the Bonus Access Terms. <span className="text-rose-500">*</span></span>
              </label>
            </section>
          )}

          {error && <div className="text-sm text-rose-600 border border-rose-200 bg-rose-50 rounded-md px-3 py-2">{error}</div>}

          <button onClick={submit} disabled={!canSubmit}
            className="w-full bg-slate-900 hover:bg-black disabled:opacity-60 text-white py-3 rounded-md text-sm font-semibold">
            {submitting ? "Submitting…" : "Submit & Acknowledge"}
          </button>
          <p className="text-[11px] text-slate-400 text-center">By submitting, your typed name acts as your electronic signature. Your IP address, browser and timestamp are recorded as evidence.</p>
        </div>
      </div>
    </div>
  );
}

function FullCenter({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">{children}</div>;
}
