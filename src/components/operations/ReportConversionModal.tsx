import { useState } from "react";
import { X as XIcon } from "lucide-react";
import { toast } from "sonner";
import { reportConversion, updatePendingConversion, todayStrSafe, type ConversionReport } from "@/lib/operationsConversionsHelpers";

export default function ReportConversionModal({
  leadId, leadName, buyerId, actor, existing, onClose, onSaved,
}: {
  leadId: string;
  leadName: string | null;
  buyerId: string;
  actor: { id: string; name: string | null };
  existing?: ConversionReport | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState<string>(existing?.conversion_date ?? todayStrSafe());
  const [count, setCount] = useState<number>(existing?.conversion_count ?? 1);
  const [value, setValue] = useState<string>(existing?.conversion_value ? String(existing.conversion_value) : "");
  const [campaign, setCampaign] = useState<string>(existing?.campaign_name ?? "");
  const [proof, setProof] = useState<string>(existing?.proof_url ?? "");
  const [notes, setNotes] = useState<string>(existing?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!count || count < 1) { toast.error("Enter at least 1 conversion"); return; }
    if (!date) { toast.error("Pick a date"); return; }
    setSaving(true);
    try {
      const v = value.trim() ? Number(value) : null;
      if (existing) {
        await updatePendingConversion(existing.id, {
          conversion_date: date,
          conversion_count: count,
          conversion_value: v,
          campaign_name: campaign.trim() || null,
          proof_url: proof.trim() || null,
          notes: notes.trim() || null,
        });
        toast.success("Conversion updated");
      } else {
        await reportConversion({
          operations_lead_id: leadId,
          media_buyer_id: buyerId,
          client_name: leadName,
          conversion_date: date,
          conversion_count: count,
          conversion_value: v,
          campaign_name: campaign.trim() || null,
          proof_url: proof.trim() || null,
          notes: notes.trim() || null,
        }, actor);
        toast.success("Conversion submitted for approval");
      }
      onSaved();
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1400] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl border border-line shadow-2xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <div className="font-serif text-base">{existing ? "Edit conversion" : "Report conversion"}</div>
          <button onClick={onClose} className="w-7 h-7 rounded hover:bg-off flex items-center justify-center"><XIcon className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <Row label="Conversion date">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="ipc-input !h-9 !text-xs" />
          </Row>
          <Row label="Number of conversions">
            <input type="number" min={1} value={count} onChange={(e) => setCount(parseInt(e.target.value || "0", 10))} className="ipc-input !h-9 !text-xs" />
          </Row>
          <Row label="Conversion value (optional)">
            <input type="number" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. 25000" className="ipc-input !h-9 !text-xs" />
          </Row>
          <Row label="Campaign / account (optional)">
            <input type="text" value={campaign} onChange={(e) => setCampaign(e.target.value)} className="ipc-input !h-9 !text-xs" />
          </Row>
          <Row label="Proof link (optional)">
            <input type="url" value={proof} onChange={(e) => setProof(e.target.value)} placeholder="https://…" className="ipc-input !h-9 !text-xs" />
          </Row>
          <Row label="Notes (optional)">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="ipc-input !text-xs" />
          </Row>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="ipc-btn ipc-btn-ghost" disabled={saving}>Cancel</button>
          <button onClick={submit} className="ipc-btn ipc-btn-black" disabled={saving}>
            {saving ? "Saving…" : (existing ? "Save" : "Submit")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      {children}
    </div>
  );
}
