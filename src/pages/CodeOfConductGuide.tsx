import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/code-of-conduct-public`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

interface GuideVideo {
  provider: string;
  video_id: string | null;
  title: string | null;
  required_percent: number;
  is_active: boolean;
}
interface GuideProgress {
  percent_watched: number;
  completed_at: string | null;
  video_id: string | null;
}
interface Payload {
  request: { id: string; status: string; member_name: string; member_email?: string; program_name?: string; token_expires_at?: string };
  template: any;
  guide_video: GuideVideo | null;
  guide_progress: GuideProgress | null;
}

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_TOKEN: "This link is invalid.",
  REQUEST_NOT_FOUND: "Link not found or invalid.",
  REQUEST_CANCELLED: "This request is no longer active.",
  TOKEN_EXPIRED: "This link has expired. Please contact Team IPC.",
  TEMPLATE_NOT_FOUND: "The Code of Conduct is no longer available. Please contact Team IPC.",
  DOCUMENT_NOT_FOUND: "The Code of Conduct document is not configured yet. Please contact Team IPC.",
};

declare global {
  interface Window { _wq?: any[]; }
}

function loadWistia() {
  if (document.getElementById("wistia-e-v1")) return;
  const s1 = document.createElement("script");
  s1.id = "wistia-e-v1";
  s1.src = "https://fast.wistia.com/assets/external/E-v1.js";
  s1.async = true;
  document.head.appendChild(s1);
}

export default function CodeOfConductGuide() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [percent, setPercent] = useState(0);
  const [completedAt, setCompletedAt] = useState<string | null>(null);
  const [groupConfirmedAt, setGroupConfirmedAt] = useState<string | null>(() => {
    if (!token) return null;
    return localStorage.getItem(`coc_guide_group_${token}`) || null;
  });
  const lastSentPercentRef = useRef(0);

  const required = data?.guide_video?.required_percent ?? 95;
  const signed = data?.request?.status === "signed";
  const videoUnlocked = !!completedAt || signed;
  const videoConfigured = !!data?.guide_video?.video_id && (data?.guide_video?.is_active !== false);

  const recordProgress = useCallback(async (pct: number, videoId: string | null) => {
    if (!token) return;
    try {
      const resp = await fetch(FN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: ANON, Authorization: `Bearer ${ANON}` },
        body: JSON.stringify({ token, action: "record_guide_progress", percent_watched: pct, video_id: videoId }),
      });
      const json = await resp.json();
      if (resp.ok) {
        if (typeof json.percent_watched === "number") setPercent((p) => Math.max(p, json.percent_watched));
        if (json.completed_at) setCompletedAt(json.completed_at);
      }
    } catch { /* ignore network blips; user can retry by watching more */ }
  }, [token]);

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
        } else {
          setData(json);
          if (json.guide_progress?.percent_watched) setPercent(json.guide_progress.percent_watched);
          if (json.guide_progress?.completed_at) setCompletedAt(json.guide_progress.completed_at);
        }
      } catch (e: any) {
        setError(e?.message || "Network error");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  useEffect(() => {
    if (!videoConfigured || !data?.guide_video?.video_id) return;
    loadWistia();
    const videoId = data.guide_video.video_id;
    window._wq = window._wq || [];
    const handler = {
      id: videoId,
      onReady: (video: any) => {
        const onSeconds = () => {
          const duration = video.duration() || 0;
          if (!duration) return;
          const pct = Math.min(100, Math.round((video.secondsWatched() / duration) * 100));
          if (pct >= lastSentPercentRef.current + 5 || (pct >= required && !completedAt)) {
            lastSentPercentRef.current = pct;
            recordProgress(pct, videoId);
          }
        };
        video.bind("secondchange", onSeconds);
        video.bind("end", () => recordProgress(100, videoId));
      },
    };
    window._wq.push(handler);
    return () => {
      try { window._wq?.push({ revoke: handler }); } catch { /* noop */ }
    };
  }, [videoConfigured, data?.guide_video?.video_id, required, completedAt, recordProgress]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">Loading…</div>;
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <div className="max-w-md bg-white border border-slate-200 rounded-2xl p-8 text-center">
          <h1 className="text-lg font-semibold text-slate-900 mb-2">Link unavailable</h1>
          <p className="text-sm text-slate-600">{error}</p>
        </div>
      </div>
    );
  }
  if (!data) return null;

  const member = data.request.member_name || "Member";
  const program = data.request.program_name || data.template?.program_name || "IPC Diamond Membership";
  const videoId = data.guide_video?.video_id;

  const steps = [
    { n: 0, label: "Watch Guide Video", done: videoUnlocked, active: !videoUnlocked },
    { n: 1, label: "Sign Code of Conduct", done: signed, active: videoUnlocked && !signed },
    { n: 2, label: "Join Official Group", done: !!groupConfirmedAt, active: signed && !groupConfirmedAt },
    { n: 3, label: "Onboarding Tutorial", done: false, active: !!groupConfirmedAt },
  ];

  const goSign = () => navigate(`/code-of-conduct/sign/${token}`);
  const confirmGroupJoined = () => {
    const ts = new Date().toISOString();
    if (token) localStorage.setItem(`coc_guide_group_${token}`, ts);
    setGroupConfirmedAt(ts);
  };
  const groupUrl = data.template?.whatsapp_redirect_url || null;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <header className="mb-6">
          <div className="text-[11px] uppercase tracking-wider text-amber-700 font-semibold mb-1">India Photographers' Club</div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-slate-900 leading-tight">Complete Your Program Access</h1>
          <p className="text-sm text-slate-600 mt-2">Watch this short guide first. After the video, you will be able to sign your Code of Conduct and join the official group.</p>
          <p className="text-[12px] text-slate-500 mt-3">Hi {member} · {program}</p>
        </header>

        {/* Stepper */}
        <ol className="mb-6 grid grid-cols-4 gap-2">
          {steps.map((s) => (
            <li key={s.n} className={`rounded-lg border px-2 py-2 text-center text-[11px] font-medium ${s.done ? "bg-emerald-50 border-emerald-200 text-emerald-800" : s.active ? "bg-white border-slate-900 text-slate-900" : "bg-white border-slate-200 text-slate-400"}`}>
              <div className="flex items-center justify-center gap-1">
                {s.done ? <span aria-hidden>✓</span> : <span aria-hidden>{s.n + 1}</span>}
              </div>
              <div className="mt-1 leading-tight">{s.label}</div>
            </li>
          ))}
        </ol>

        {/* Step 0: video */}
        <section className="bg-white border border-slate-200 rounded-2xl p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-900">Step 1 · {data.guide_video?.title || "Watch the guide video"}</h2>
            {videoUnlocked && <span className="text-[11px] font-semibold text-emerald-700">Completed</span>}
          </div>
          {!videoConfigured ? (
            <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm p-4">
              Guide video is not configured. Please contact support.
            </div>
          ) : (
            <>
              <div className="relative w-full overflow-hidden rounded-lg border border-slate-200 bg-black" style={{ aspectRatio: "16 / 9" }}>
                <div
                  className={`wistia_embed wistia_async_${videoId} videoFoam=true seo=false`}
                  style={{ position: "absolute", inset: 0, height: "100%", width: "100%" }}
                />
              </div>
              <div className="mt-3">
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 transition-all" style={{ width: `${Math.min(100, percent)}%` }} />
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Watched {Math.min(100, Math.round(percent))}%</span>
                  <span>Unlocks at {required}%</span>
                </div>
              </div>
            </>
          )}
        </section>

        {/* Step 1: sign */}
        <section className="bg-white border border-slate-200 rounded-2xl p-5 mb-4">
          <h2 className="text-sm font-semibold text-slate-900 mb-1">Step 2 · Sign your Code of Conduct</h2>
          <p className="text-[12.5px] text-slate-600 mb-3">This uses the same secure signing flow as before. Your signature is recorded against your name and email.</p>
          {signed ? (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-4 py-3">
              You have already signed the Code of Conduct.
            </div>
          ) : videoUnlocked ? (
            <button onClick={goSign} className="w-full sm:w-auto inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800">
              Continue to Digital Signature
            </button>
          ) : (
            <button disabled className="w-full sm:w-auto inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-slate-200 text-slate-500 text-sm font-semibold cursor-not-allowed">
              Watch the full video to unlock signing
            </button>
          )}
        </section>

        {/* Step 2: group join */}
        {signed && (
          <section className="bg-white border border-slate-200 rounded-2xl p-5 mb-4">
            <h2 className="text-sm font-semibold text-slate-900 mb-1">Step 3 · Join the Official Program Group</h2>
            <p className="text-[12.5px] text-slate-600 mb-3">Open the group link, join, then confirm here so we can mark your onboarding as complete.</p>
            <div className="flex flex-wrap gap-2">
              {groupUrl ? (
                <a href={groupUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700">Join Group</a>
              ) : (
                <span className="text-[12px] text-slate-500">Group link will be shared by your sales executive shortly.</span>
              )}
              {!groupConfirmedAt ? (
                <button onClick={confirmGroupJoined} className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg border border-slate-300 text-slate-800 text-sm font-semibold hover:bg-slate-50">
                  I have joined the group
                </button>
              ) : (
                <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[12px] font-semibold">Group join confirmed</span>
              )}
            </div>
          </section>
        )}

        <footer className="mt-6 text-center text-[11px] text-slate-400">
          Secure Code of Conduct flow · India Photographers' Club
        </footer>
      </div>
    </div>
  );
}
