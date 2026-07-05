import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trophy, CheckCircle2, XCircle, Clock, ExternalLink } from "lucide-react";
import {
  submitResult, listSubmissionsForContext, RESULT_TYPES,
  type ResultSubmission,
} from "@/lib/operationsRewards";

interface Props {
  operationsLeadId?: string | null;
  crmLeadId?: string | null;
  paidPipelineLeadId?: string | null;
  memberName?: string | null;
}

export default function TeamResultSubmissionPanel({
  operationsLeadId, crmLeadId, paidPipelineLeadId, memberName,
}: Props) {
  const [rows, setRows] = useState<ResultSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    result_type: "client_win",
    title: "",
    description: "",
    proof_url: "",
    result_date: new Date().toISOString().slice(0, 10),
  });

  const load = async () => {
    setLoading(true);
    try {
      const data = await listSubmissionsForContext({
        operationsLeadId, crmLeadId, paidPipelineLeadId,
      });
      setRows(data);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [operationsLeadId, crmLeadId, paidPipelineLeadId]);

  const submit = async () => {
    if (!form.title.trim()) { toast.error("Title required"); return; }
    setSaving(true);
    try {
      await submitResult({
        operations_lead_id: operationsLeadId ?? null,
        crm_lead_id: crmLeadId ?? null,
        paid_pipeline_lead_id: paidPipelineLeadId ?? null,
        member_name: memberName ?? null,
        result_type: form.result_type,
        title: form.title.trim(),
        description: form.description.trim() || null,
        proof_url: form.proof_url.trim() || null,
        result_date: form.result_date || null,
      });
      toast.success("Result submitted for approval");
      setOpen(false);
      setForm({ ...form, title: "", description: "", proof_url: "" });
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to submit");
    } finally { setSaving(false); }
  };

  const badge = (s: string) => {
    if (s === "approved") return <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#DCFCE7] text-[#166534] uppercase tracking-wider inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Approved</span>;
    if (s === "rejected") return <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#FEE2E2] text-[#991B1B] uppercase tracking-wider inline-flex items-center gap-1"><XCircle className="w-3 h-3" /> Rejected</span>;
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-off text-muted-foreground uppercase tracking-wider inline-flex items-center gap-1"><Clock className="w-3 h-3" /> Pending</span>;
  };

  return (
    <div className="border border-line rounded-lg bg-white p-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-[#92400E]" />
          <div>
            <div className="font-serif text-[15px] text-black">Reward / Result History</div>
            <div className="text-[11px] text-muted-foreground">Submit results for admin approval. ₹500 per approved result (default).</div>
          </div>
        </div>
        <button onClick={() => setOpen(true)} className="h-8 px-3 text-[11px] bg-black text-white rounded-md">Submit result</button>
      </div>

      {loading ? (
        <div className="text-[11px] text-muted-foreground py-3">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-[11px] text-muted-foreground text-center py-3">No results submitted yet.</div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="border border-line rounded-md p-2.5 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-serif text-[13px] text-black truncate">{r.title}</div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {RESULT_TYPES.find(t => t.value === r.result_type)?.label ?? r.result_type}
                    {" · "}by {r.submitted_by_name ?? "—"}
                    {r.result_date && ` · ${r.result_date}`}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {badge(r.status)}
                  {r.status === "approved" && r.reward_amount != null && (
                    <span className="text-[11px] tabular-nums font-medium">₹{Number(r.reward_amount).toLocaleString()}</span>
                  )}
                </div>
              </div>
              {r.description && <div className="mt-1 text-[11px] whitespace-pre-wrap">{r.description}</div>}
              {r.proof_url && (
                <a href={r.proof_url} target="_blank" rel="noreferrer" className="mt-1 text-[11px] text-[#1E40AF] inline-flex items-center gap-1">
                  <ExternalLink className="w-3 h-3" /> Proof
                </a>
              )}
              {r.status === "rejected" && r.rejection_reason && (
                <div className="mt-1 text-[11px] text-[#991B1B]"><strong>Reason:</strong> {r.rejection_reason}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-[1400] bg-black/50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl border border-line shadow-2xl w-full max-w-lg p-5">
            <div className="font-serif text-lg mb-3">Submit result for approval</div>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Result type</label>
                <select className="ipc-input" value={form.result_type} onChange={(e) => setForm({ ...form, result_type: e.target.value })}>
                  {RESULT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Title *</label>
                <input className="ipc-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Closed portfolio for Ravi Sharma" />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Description</label>
                <textarea rows={3} className="ipc-input !text-xs" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Proof URL</label>
                  <input className="ipc-input" value={form.proof_url} onChange={(e) => setForm({ ...form, proof_url: e.target.value })} placeholder="https://…" />
                </div>
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Result date</label>
                  <input type="date" className="ipc-input" value={form.result_date} onChange={(e) => setForm({ ...form, result_date: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setOpen(false)} className="h-9 px-3 text-[12px] text-muted-foreground">Cancel</button>
              <button disabled={saving} onClick={submit} className="h-9 px-4 bg-black text-white text-[12px] rounded-md disabled:opacity-50">
                {saving ? "Submitting…" : "Submit for approval"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
