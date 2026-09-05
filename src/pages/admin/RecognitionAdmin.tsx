import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { Award } from "lucide-react";
import { PageHead, SectionLabel, LoadingState, EmptyState } from "@/components/ui-bits";
import { useAuth } from "@/context/AuthContext";
import { giveRecognition, listRecognitions, listPeople, type RecognitionRow } from "@/lib/accountabilityAdmin";

export default function RecognitionAdmin() {
  const { isAdmin, user } = useAuth();
  const [people, setPeople] = useState<Array<{ id: string; full_name: string }>>([]);
  const [rows, setRows] = useState<RecognitionRow[]>([]);
  const [personId, setPersonId] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [p, r] = await Promise.all([listPeople(), listRecognitions()]);
      setPeople(p); setRows(r);
    } catch (e: any) { toast.error(e?.message || "Could not load recognitions"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  if (!isAdmin) return <Navigate to="/" replace />;

  const submit = async () => {
    if (!personId) return toast.error("Pick who you are recognising.");
    if (!reason.trim()) return toast.error("Write why — the reason is required.");
    if (!user?.id) return;
    setSaving(true);
    try {
      const { duplicate } = await giveRecognition({ userId: personId, reason, actorId: user.id });
      toast.success(
        duplicate
          ? "Already recognised for this today — nothing added twice."
          : "Recognition given",
      );
      setPersonId(""); setReason("");
      load();
    } catch (e: any) { toast.error(e?.message || "Could not give the recognition"); }
    finally { setSaving(false); }
  };

  return (
    <div className="max-w-[820px]">
      <PageHead title="Recognition" sub="Say thank you on the record. Each recognition adds five points, once." />

      <div className="rounded-lg border border-[hsl(var(--line))] bg-white p-4 space-y-3">
        <div>
          <label className="font-sans text-[11px] uppercase tracking-wide text-muted-foreground block mb-1">Who</label>
          <select
            className="h-10 w-full rounded-md border border-[hsl(var(--line))] px-2.5 font-sans text-[14px] bg-white"
            value={personId}
            onChange={(e) => setPersonId(e.target.value)}
          >
            <option value="">Pick a person…</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        </div>
        <div>
          <label className="font-sans text-[11px] uppercase tracking-wide text-muted-foreground block mb-1">Why (required)</label>
          <textarea
            className="w-full min-h-[88px] rounded-md border border-[hsl(var(--line))] p-2.5 font-sans text-[14px]"
            placeholder="What they did, in a sentence."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <button
          disabled={saving}
          onClick={submit}
          className="h-10 px-4 rounded-md bg-black text-white font-sans text-[13px] inline-flex items-center gap-1.5 disabled:opacity-40"
        >
          <Award className="w-4 h-4" /> Give recognition (+5)
        </button>
      </div>

      <div className="mt-7">
        <SectionLabel>Recently recognised</SectionLabel>
        <div className="mt-2 space-y-2">
          {loading ? <LoadingState label="Loading…" block /> : rows.length === 0 ? (
            <EmptyState title="No recognitions yet" hint="The first one shows up here." />
          ) : rows.map((r) => (
            <div key={r.id} className="rounded-lg border border-[hsl(var(--line))] bg-white p-3.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-serif text-[17px]">{r.userName}</p>
                <p className="font-sans text-[12px] text-muted-foreground">
                  by {r.giverName} · {new Date(r.created_at).toLocaleDateString()}
                </p>
              </div>
              <p className="font-sans text-[13px] text-muted-foreground mt-1">{r.reason}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
