import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/code-of-conduct-public`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

interface Payload {
  request: any;
  template: any;
}

const ACK_ITEMS = [
  "I have read and understood the Code of Conduct.",
  "I agree to the responsibilities and terms of the Diamond Membership.",
  "I understand that group/program access may be provided only after acknowledgement.",
  "I confirm that the name and email shown belong to me.",
];

export default function CodeOfConductSign() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [acks, setAcks] = useState<boolean[]>([false, false, false, false]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(false);

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
          setError(json.error || "Failed to load");
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

  // Signature canvas
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.strokeStyle = "#111";
    const getPos = (e: any) => {
      const r = c.getBoundingClientRect();
      const p = "touches" in e ? e.touches[0] : e;
      return { x: p.clientX - r.left, y: p.clientY - r.top };
    };
    const start = (e: any) => { e.preventDefault(); drawingRef.current = true; const { x, y } = getPos(e); ctx.beginPath(); ctx.moveTo(x, y); };
    const move = (e: any) => { if (!drawingRef.current) return; e.preventDefault(); const { x, y } = getPos(e); ctx.lineTo(x, y); ctx.stroke(); setHasDrawn(true); };
    const end = () => { drawingRef.current = false; };
    c.addEventListener("mousedown", start); c.addEventListener("mousemove", move);
    window.addEventListener("mouseup", end);
    c.addEventListener("touchstart", start, { passive: false }); c.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", end);
    return () => {
      c.removeEventListener("mousedown", start); c.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", end);
      c.removeEventListener("touchstart", start); c.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end);
    };
  }, [data]);

  const clearSig = () => {
    const c = canvasRef.current; if (!c) return;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height); setHasDrawn(false);
  };

  const submit = async () => {
    if (!name.trim()) { setError("Please type your full name."); return; }
    if (acks.some((a) => !a)) { setError("Please acknowledge all items."); return; }
    setSubmitting(true); setError(null);
    const sig = hasDrawn ? canvasRef.current?.toDataURL("image/png") : null;
    try {
      const resp = await fetch(FN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: ANON, Authorization: `Bearer ${ANON}` },
        body: JSON.stringify({ token, action: "sign", signature_name: name, signature_data_url: sig, acknowledgements: acks }),
      });
      const json = await resp.json();
      if (!resp.ok) { setError(json.error || "Failed to submit"); }
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
    return (
      <FullCenter>
        <div className="max-w-lg w-full bg-white border rounded-xl p-8 shadow-sm">
          <div className="text-emerald-600 text-3xl mb-2">✓</div>
          <h1 className="text-xl font-semibold mb-1">Thank you, {request.member_name}.</h1>
          <p className="text-sm text-slate-600 mb-5">{template?.success_page_message || "Your Code of Conduct has been acknowledged successfully."}</p>
          <ol className="text-sm text-slate-700 space-y-2 mb-6 list-decimal pl-5">
            <li>Join the IPC Diamond Members WhatsApp Group below.</li>
            <li>Our team will review and activate your remaining access manually.</li>
            <li>Please use the official support channels only.</li>
          </ol>
          {waUrl ? (
            <a href={waUrl} target="_blank" rel="noreferrer" onClick={onWhatsAppClick}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-[#25D366] text-white font-medium text-sm hover:bg-[#1ebe5c]">
              Join Diamond Members WhatsApp Group →
            </a>
          ) : (
            <p className="text-xs text-slate-500">The team will share the WhatsApp group link shortly.</p>
          )}
          <p className="text-[11px] text-slate-400 mt-6">Signed {request.signed_at ? new Date(request.signed_at).toLocaleString() : ""} · v{template?.version || "1.0"}</p>
        </div>
      </FullCenter>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-2xl mx-auto bg-white border rounded-xl shadow-sm overflow-hidden">
        <div className="px-7 pt-7 pb-5 border-b">
          <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1">{template?.party_a_name || "India Photographers' Club"}</div>
          <h1 className="text-xl font-semibold">{template?.document_title || "Code of Conduct"}</h1>
          <p className="text-sm text-slate-600 mt-1">{template?.program_name || request.program_name || "Diamond Membership"}</p>
          <div className="mt-4 grid grid-cols-2 gap-3 text-[12.5px]">
            <div><div className="text-slate-500">Member</div><div className="font-medium">{request.member_name}</div></div>
            <div><div className="text-slate-500">Email</div><div className="font-medium">{request.member_email}</div></div>
          </div>
        </div>

        <div className="px-7 py-6 space-y-6">
          <section>
            <h2 className="text-sm font-semibold mb-2">1. Agreement Document</h2>
            {template?.template_pdf_url ? (
              <div className="border rounded-lg overflow-hidden bg-slate-100" style={{ height: 480 }}>
                <iframe src={template.template_pdf_url} className="w-full h-full" title="Code of Conduct PDF" />
              </div>
            ) : template?.html_content ? (
              <div className="border rounded-lg p-4 bg-slate-50 max-h-[480px] overflow-auto text-[13px] leading-relaxed whitespace-pre-wrap">{template.html_content}</div>
            ) : (
              <div className="border rounded-lg p-4 bg-amber-50 text-amber-800 text-[13px]">The agreement document is being prepared. Please continue with your acknowledgement below — Team IPC will share the signed document copy with you over email.</div>
            )}
            {template?.template_pdf_url && (
              <a href={template.template_pdf_url} target="_blank" rel="noreferrer" className="inline-block mt-2 text-[12px] text-blue-600 hover:underline">Open PDF in new tab ↗</a>
            )}
          </section>

          <section>
            <h2 className="text-sm font-semibold mb-2">2. Acknowledgement</h2>
            <div className="space-y-2">
              {ACK_ITEMS.map((label, i) => (
                <label key={i} className="flex items-start gap-3 text-[13px]">
                  <input type="checkbox" className="mt-0.5 w-4 h-4" checked={acks[i]} onChange={(e) => setAcks((a) => { const n = [...a]; n[i] = e.target.checked; return n; })} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold mb-2">3. Signature</h2>
            <label className="block text-[12px] text-slate-600 mb-1">Typed full name <span className="text-rose-500">*</span></label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm mb-3" placeholder="Type your full legal name" />
            <label className="block text-[12px] text-slate-600 mb-1">Draw signature (optional)</label>
            <div className="border rounded-md bg-white">
              <canvas ref={canvasRef} width={560} height={140} className="w-full block touch-none" style={{ height: 140 }} />
            </div>
            <button type="button" onClick={clearSig} className="text-[11.5px] text-slate-500 hover:text-slate-700 mt-1">Clear signature</button>
            <div className="mt-3 grid grid-cols-2 gap-3 text-[12px] text-slate-600">
              <div><span className="text-slate-500">Date: </span>{new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</div>
              <div><span className="text-slate-500">Email: </span>{request.member_email}</div>
            </div>
          </section>

          {error && <div className="text-sm text-rose-600 border border-rose-200 bg-rose-50 rounded-md px-3 py-2">{error}</div>}

          <button onClick={submit} disabled={submitting}
            className="w-full bg-black hover:bg-[#222] disabled:opacity-60 text-white py-3 rounded-md text-sm font-medium">
            {submitting ? "Submitting…" : "Submit & Acknowledge"}
          </button>
          <p className="text-[11px] text-slate-400 text-center">By submitting, you agree your typed name acts as your electronic signature.</p>
        </div>
      </div>
    </div>
  );
}

function FullCenter({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">{children}</div>;
}
