import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHead, SectionLabel, LoadingState } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { logActivity } from "@/lib/auditLog";
import { AlertTriangle } from "lucide-react";

type Counts = Record<string, number | boolean | string | null>;

const COUNT_GROUPS: Array<{ section: string; rows: Array<[string, string]> }> = [
  {
    section: "Calling CRM",
    rows: [
      ["Total CRM leads (all states)", "crm_leads"],
      ["— Active", "crm_leads_active"],
      ["— Archived", "crm_leads_archived"],
      ["— Soft-deleted", "crm_leads_soft_deleted"],
      ["Batches", "paid_batches"],
      ["Batch archive records", "batch_archives"],
      ["Follow-up reminders", "crm_followups"],
      ["Lead tag assignments", "lead_tag_assignments"],
      ["Activity logs", "lead_activity"],
      ["Lead entries", "lead_entries"],
      ["Qualifier sessions", "lead_qualifier_sessions"],
    ],
  },
  {
    section: "Paid Pipeline",
    rows: [
      ["Buyers (all states)", "paid_buyers"],
      ["Payments", "paid_payments"],
      ["Follow-ups", "paid_followups"],
      ["Finance details", "paid_finance"],
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
  const [result, setResult] = useState<any>(null);

  const refresh = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).rpc("admin_hard_wipe_all_lead_data", { _dry_run: true });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setCounts((data?.before_counts ?? data) as Counts);
  };

  useEffect(() => { if (isAdmin) refresh(); /* eslint-disable-next-line */ }, [isAdmin]);

  if (authLoading) return <div className="p-6"><LoadingState /></div>;
  if (!isAdmin) return <Navigate to="/admin-center" replace />;

  const canWipe = ack && confirmText.trim() === "DELETE ALL LEADS" && !wiping;

  const handleWipe = async () => {
    if (!canWipe) return;
    setWiping(true);
    const { data, error } = await (supabase as any).rpc("admin_hard_wipe_all_lead_data", { _dry_run: false });
    setWiping(false);
    if (error) { toast.error(error.message); return; }
    setResult(data);
    setAck(false);
    setConfirmText("");
    toast.success("All lead data deleted successfully. You can now import fresh leads.");
    await logActivity({
      module_key: "admin_panel",
      module_label: "Admin / Team Access",
      action_type: "admin_hard_wipe_all_lead_data",
      action_label: "Hard wipe: all lead data deleted",
      entity_type: "system",
      severity: "critical",
      summary: "Admin performed HARD WIPE of all lead/work/demo data.",
      metadata: { ...(data as any), reason: "Hard clean slate for team demo and fresh import" },
    });
    refresh();
  };

  return (
    <div className="max-w-[1060px]">
      <PageHead
        title="Hard Wipe All Lead Data"
        sub="Admin-only. Permanently deletes ALL CRM leads, batches, paid pipeline buyers, payments, operations clients, follow-ups, tag assignments, archive metadata, and lead-linked notifications — including active, archived, and soft-deleted records. Team, settings, stages, tags, templates, and rules are preserved."
      />

      <div className="rounded-xl border border-red-300 bg-red-50 px-5 py-4 mb-6 flex gap-3">
        <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
        <div className="font-sans text-[13px] text-red-900 leading-relaxed">
          This will permanently delete all CRM leads, batches, paid pipeline buyers, payments, follow-ups,
          operations CRM clients, conversions, rewards, tag assignments, notifications, and archive records
          linked to leads. <strong className="font-semibold">This cannot be undone.</strong> Team members,
          settings, stages, tags, templates, and rules will remain safe.
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
            {COUNT_GROUPS.map((g) => (
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
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>Refresh counts</Button>
        </div>
      </div>

      <SectionLabel>Confirm and wipe</SectionLabel>
      <div className="rounded-xl border border-red-300 bg-white p-5 space-y-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <Checkbox checked={ack} onCheckedChange={(v) => setAck(!!v)} className="mt-0.5" />
          <span className="text-[13px] font-sans">
            I understand this will permanently delete all lead/work data.
          </span>
        </label>
        <div>
          <div className="text-[13px] font-sans mb-1.5">
            Type <code className="bg-red-50 text-red-700 px-1.5 py-0.5 rounded font-mono text-xs">DELETE ALL LEADS</code> to confirm:
          </div>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE ALL LEADS"
            className="font-mono"
          />
        </div>
        <Button variant="destructive" disabled={!canWipe} onClick={handleWipe} className="w-full">
          {wiping ? (
            <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Wiping…</>
          ) : (
            "Permanently Delete All Lead Data"
          )}
        </Button>
      </div>

      {result && (
        <div className="rounded-xl border border-green-300 bg-green-50 p-5 mt-6">
          <div className="font-serif text-base font-medium mb-3 text-green-900">
            All lead data deleted successfully. You can now import fresh leads.
          </div>
          <div className="grid grid-cols-2 gap-x-8">
            <div>
              <div className="text-[12px] font-sans font-semibold text-green-900/80 mb-1">Before</div>
              {Object.entries(result.before_counts ?? {}).map(([k, v]) => (
                <div key={k} className="flex justify-between text-[12px] font-sans">
                  <span className="text-green-900/70">{k.replace(/_/g, " ")}</span>
                  <span className="tabular-nums font-medium text-green-900">{Number(v ?? 0).toLocaleString()}</span>
                </div>
              ))}
            </div>
            <div>
              <div className="text-[12px] font-sans font-semibold text-green-900/80 mb-1">After</div>
              {Object.entries(result.after_counts ?? {}).map(([k, v]) => (
                <div key={k} className="flex justify-between text-[12px] font-sans">
                  <span className="text-green-900/70">{k.replace(/_/g, " ")}</span>
                  <span className="tabular-nums font-medium text-green-900">{Number(v ?? 0).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
