import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHead, SectionLabel } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { logActivity } from "@/lib/auditLog";
import { AlertTriangle, Loader2 } from "lucide-react";

type Counts = Record<string, number | boolean>;

const COUNT_ROWS: Array<{ section: string; rows: Array<[string, string]> }> = [
  {
    section: "Calling CRM",
    rows: [
      ["Active leads", "crm_leads_active"],
      ["Archived leads", "crm_leads_archived"],
      ["Total leads", "crm_leads_total"],
      ["Paid Pipeline batches", "paid_batches"],
      ["Lead tag assignments", "lead_tag_assignments"],
      ["Lead activity entries", "lead_activity"],
      ["Follow-up reminders", "crm_followups"],
      ["Batch archive records", "batch_archives"],
    ],
  },
  {
    section: "Paid Pipeline",
    rows: [
      ["Active buyers", "paid_buyers_active"],
      ["Archived buyers", "paid_buyers_archived"],
      ["Payments", "payments"],
      ["Finance details", "paid_finance"],
      ["Follow-ups", "paid_followups"],
      ["Activity logs", "paid_activity"],
      ["Paid → CRM links", "paid_to_crm_links"],
    ],
  },
  {
    section: "Operations CRM",
    rows: [
      ["Operations leads", "operations_leads"],
      ["Service events", "operations_service_events"],
      ["Conversion reports", "operations_conversions"],
      ["Reward progress", "operations_reward_progress"],
    ],
  },
  {
    section: "Notifications",
    rows: [["Linked notifications", "notifications"]],
  },
];

export default function CleanSlate() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [ack, setAck] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [result, setResult] = useState<Counts | null>(null);

  const refresh = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).rpc("admin_wipe_demo_lead_data", { _dry_run: true });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setCounts(data as Counts);
  };

  useEffect(() => {
    if (isAdmin) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  if (authLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!isAdmin) return <Navigate to="/admin-center" replace />;

  const canWipe = ack && confirmText.trim() === "WIPE DEMO LEADS" && !wiping;

  const handleWipe = async () => {
    if (!canWipe) return;
    setWiping(true);
    const { data, error } = await (supabase as any).rpc("admin_wipe_demo_lead_data", { _dry_run: false });
    setWiping(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setResult(data as Counts);
    setAck(false);
    setConfirmText("");
    toast.success("Demo lead data wiped successfully. You can now import fresh leads.");
    await logActivity({
      module_key: "admin_panel",
      module_label: "Admin / Team Access",
      action_type: "admin_demo_lead_data_wiped",
      action_label: "Demo lead data wiped",
      entity_type: "system",
      severity: "critical",
      summary: "Admin performed a clean-slate wipe of imported demo lead data.",
      metadata: { ...(data as any), reason: "Clean slate for team demo and fresh import" },
    });
    refresh();
  };

  return (
    <div className="max-w-[1060px]">
      <PageHead
        title="Clean Slate: Remove Imported Demo Lead Data"
        sub="Admin-only. Permanently wipes imported CRM / Paid Pipeline / Operations demo records. Settings, team, stages, tags, and templates are preserved."
      />

      <div className="rounded-xl border border-red-300 bg-red-50 px-5 py-4 mb-6 flex gap-3">
        <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
        <div className="font-sans text-[13px] text-red-900 leading-relaxed">
          This will permanently remove imported CRM leads, paid pipeline buyers, payments, follow-ups,
          operations CRM records, conversions, rewards, and notifications linked to imported/demo leads.
          <strong className="font-semibold"> This cannot be undone.</strong>
        </div>
      </div>

      <SectionLabel>Dry run — what will be deleted</SectionLabel>
      <div className="rounded-xl border border-line bg-white p-5 mb-6">
        {loading || !counts ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Counting records…
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-8 gap-y-6">
            {COUNT_ROWS.map((g) => (
              <div key={g.section}>
                <div className="font-serif text-base font-medium mb-2">{g.section}</div>
                <div className="space-y-1">
                  {g.rows.map(([label, key]) => (
                    <div key={key} className="flex justify-between text-[13px] font-sans">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="tabular-nums font-medium">{Number(counts[key] ?? 0).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-5 flex justify-end">
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            Refresh counts
          </Button>
        </div>
      </div>

      <SectionLabel>Confirm and wipe</SectionLabel>
      <div className="rounded-xl border border-red-300 bg-white p-5 space-y-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <Checkbox checked={ack} onCheckedChange={(v) => setAck(!!v)} className="mt-0.5" />
          <span className="text-[13px] font-sans">
            I understand this will permanently delete imported/demo lead data.
          </span>
        </label>
        <div>
          <div className="text-[13px] font-sans mb-1.5">
            Type <code className="bg-red-50 text-red-700 px-1.5 py-0.5 rounded font-mono text-xs">WIPE DEMO LEADS</code> to confirm:
          </div>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="WIPE DEMO LEADS"
            className="font-mono"
          />
        </div>
        <Button
          variant="destructive"
          disabled={!canWipe}
          onClick={handleWipe}
          className="w-full"
        >
          {wiping ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Wiping…
            </>
          ) : (
            "Permanently Wipe Demo Lead Data"
          )}
        </Button>
      </div>

      {result && (
        <div className="rounded-xl border border-green-300 bg-green-50 p-5 mt-6">
          <div className="font-serif text-base font-medium mb-2 text-green-900">
            Demo lead data wiped successfully. You can now import fresh leads.
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1 mt-3">
            {Object.entries(result)
              .filter(([k]) => k !== "dry_run")
              .map(([k, v]) => (
                <div key={k} className="flex justify-between text-[12px] font-sans">
                  <span className="text-green-900/70">{k.replace(/_/g, " ")}</span>
                  <span className="tabular-nums font-medium text-green-900">
                    {Number(v ?? 0).toLocaleString()}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
