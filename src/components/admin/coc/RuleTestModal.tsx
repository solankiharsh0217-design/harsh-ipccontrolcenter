import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { IpcCombobox } from "@/components/ui/ipc-combobox";
import { evaluatePostSendAutomation, describeSkipReason } from "@/lib/codeOfConductAutomation";
import { CheckCircle2, XCircle, AlertTriangle, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  /** If kind = trigger, runs a stage-trigger dry-run; if post_send, evaluates post-send rule. */
  kind: "trigger" | "post_send";
  rule: any;
}

interface LeadLite { id: string; full_name: string | null; email: string | null; phone: string | null; pipeline_id: string | null; stage_id: string | null }

export default function RuleTestModal({ open, onClose, kind, rule }: Props) {
  const [leadId, setLeadId] = useState<string | null>(null);
  const [leads, setLeads] = useState<LeadLite[]>([]);
  const [query, setQuery] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any | null>(null);

  useEffect(() => {
    if (!open) { setLeadId(null); setResult(null); setQuery(""); return; }
    (async () => {
      const { data } = await supabase
        .from("leads")
        .select("id, full_name, email, phone, pipeline_id, stage_id")
        .is("archived_at", null).is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(100);
      setLeads((data || []) as LeadLite[]);
    })();
  }, [open]);

  const filteredLeads = query.trim()
    ? leads.filter((l) => `${l.full_name || ""} ${l.email || ""} ${l.phone || ""}`.toLowerCase().includes(query.toLowerCase()))
    : leads;

  const runTest = async () => {
    if (!leadId) return;
    setRunning(true);
    setResult(null);
    try {
      if (kind === "trigger") {
        const lead = leads.find((l) => l.id === leadId);
        const matches = !!lead && lead.pipeline_id === rule.pipeline_id && lead.stage_id === rule.stage_id;
        const willSend = matches && rule.mode === "auto_send" && !!lead?.email;
        const willMove = matches && !!rule.stage_id_after_signed;
        const willTag = matches && !!rule.tag_id_after_signed;
        let skipReason: string | null = null;
        if (!matches) skipReason = "Lead is not in the trigger stage";
        else if (rule.mode === "auto_send" && !lead?.email) skipReason = "Missing email for auto-send";
        setResult({ matches, willSendEmail: willSend, willMoveStage: willMove, willApplyTag: willTag, skipReason });
      } else {
        // Post-send: simulate by finding latest request for the lead's email
        const lead = leads.find((l) => l.id === leadId);
        let requestId: string | null = null;
        if (lead?.email) {
          const { data } = await (supabase as any)
            .from("code_of_conduct_requests")
            .select("id")
            .ilike("member_email", lead.email)
            .order("created_at", { ascending: false })
            .limit(1);
          requestId = data?.[0]?.id || null;
        }
        if (!requestId) {
          setResult({ matches: false, skipReason: "No prior CoC request found for this lead — cannot evaluate post-send rule (dry-run needs a real request)." });
        } else {
          const res = await evaluatePostSendAutomation({ requestId, dryRun: true });
          setResult({
            matches: res.status === "applied" || (res.status === "skipped" && !!res.ruleId),
            willMoveStage: res.status === "applied",
            ruleName: res.ruleName,
            newStageName: res.newStageName,
            skipReason: res.skipReason ? describeSkipReason(res.skipReason) : (res.status === "no_match" ? "No post-send rule matched" : null),
          });
        }
      }
    } catch (e: any) {
      setResult({ error: e?.message || "Test failed" });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg bg-white">
        <DialogHeader>
          <DialogTitle className="text-[14px]">Test rule (dry-run)</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-[12px] text-muted-foreground">No emails are sent, no stages are moved. Pick a lead and see what would happen.</div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name / email / phone…"
            className="ipc-input"
          />
          <IpcCombobox
            value={leadId}
            onChange={setLeadId}
            options={filteredLeads.map((l) => ({
              value: l.id,
              label: l.full_name || l.email || "Unnamed",
              description: [l.email, l.phone].filter(Boolean).join(" · "),
            }))}
            placeholder="Pick a lead to test against"
          />
          <button onClick={runTest} disabled={!leadId || running} className="ipc-btn ipc-btn-black disabled:opacity-50">
            {running ? <><Loader2 className="h-3.5 w-3.5 animate-spin inline mr-1" /> Running…</> : "Run dry-run"}
          </button>

          {result && (
            <div className="rounded-lg border border-line p-3 space-y-1.5 text-[12.5px]">
              {result.error ? (
                <Row icon={<XCircle className="h-4 w-4 text-rose-600" />} label="Error" value={result.error} />
              ) : (
                <>
                  <Row icon={result.matches ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-rose-500" />} label="Rule matches?" value={result.matches ? "Yes" : "No"} />
                  {"willSendEmail" in result && <Row icon={dot(result.willSendEmail)} label="Email will send?" value={result.willSendEmail ? "Yes" : "No"} />}
                  {"willMoveStage" in result && <Row icon={dot(result.willMoveStage)} label="Stage will move?" value={result.willMoveStage ? `Yes → ${result.newStageName || "destination"}` : "No"} />}
                  {"willApplyTag" in result && <Row icon={dot(result.willApplyTag)} label="Tag will apply?" value={result.willApplyTag ? "Yes" : "No"} />}
                  {result.skipReason && <Row icon={<AlertTriangle className="h-4 w-4 text-amber-600" />} label="Skip reason" value={result.skipReason} />}
                </>
              )}
            </div>
          )}
        </div>
        <div className="flex justify-end pt-2 border-t border-line">
          <button onClick={onClose} className="ipc-btn ipc-btn-ghost">Close</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium ml-auto">{value}</span>
    </div>
  );
}
function dot(ok: boolean) { return ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-slate-300" />; }
