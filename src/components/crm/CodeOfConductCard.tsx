import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import CodeOfConductPanel from "@/components/paid-pipeline/CodeOfConductPanel";
import { loadActiveCoCRules, findMatchingRuleDetailed, type CodeOfConductRule } from "@/lib/codeOfConductRules";

interface Props {
  crmLeadId: string;
  paidLeadId?: string | null;
  pipelineId: string;
  stageId: string | null;
  memberName: string;
  memberEmail?: string | null;
  memberPhone?: string | null;
  programName?: string | null;
  dealValue?: number | null;
}

export default function CodeOfConductCard(props: Props) {
  const { profile } = useAuth();
  const { crmLeadId, paidLeadId, pipelineId, stageId } = props;
  const [rule, setRule] = useState<CodeOfConductRule | null>(null);
  const [ignored, setIgnored] = useState(false);
  const [hasActiveReq, setHasActiveReq] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    const rules = await loadActiveCoCRules();
    const { rule: matched } = await findMatchingRuleDetailed({ rules, source: "crm", pipelineId, stageId, crmLeadId, paidPipelineLeadId: paidLeadId || null });
    setRule(matched);
    if (matched) {
      const [{ data: ig }, { data: rq }] = await Promise.all([
        (supabase as any).from("code_of_conduct_suggestion_ignores").select("id").eq("rule_id", matched.id).eq("crm_lead_id", crmLeadId).maybeSingle(),
        (supabase as any).from("code_of_conduct_requests").select("id,status").eq("crm_lead_id", crmLeadId).in("status", ["sent","viewed","signed","ready_to_send"]).limit(1),
      ]);
      setIgnored(!!ig);
      setHasActiveReq(!!(rq && rq.length));
    }
    setLoaded(true);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [crmLeadId, stageId, pipelineId]);

  const ignore = async () => {
    if (!rule || !profile?.id) return;
    const { error } = await (supabase as any).from("code_of_conduct_suggestion_ignores").insert({
      rule_id: rule.id, stage_id: stageId, crm_lead_id: crmLeadId, ignored_by: profile.id,
    });
    if (error) { toast.error(error.message); return; }
    try {
      // Best-effort audit log; needs an existing request_id to attach — log only if one exists later.
    } catch { /* ignore */ }
    setIgnored(true);
    toast.success("Suggestion dismissed");
  };

  if (!loaded) return null;

  const showSuggested = rule && rule.mode === "suggest_only" && !ignored && !hasActiveReq;
  const showRequiredHint = rule && rule.mode === "auto_send" && !hasActiveReq;

  return (
    <div id="code-of-conduct-panel" className="px-6 py-4 border-b border-line scroll-mt-20">

      {showSuggested && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <div className="text-[12.5px] font-semibold text-amber-900">Code of Conduct required</div>
              <div className="text-[11.5px] text-amber-800 mt-0.5">This lead has reached a trigger stage. Send the Code of Conduct email before group/program access. <span className="opacity-75">Rule: {rule.name}</span></div>
            </div>
            <button onClick={ignore} className="text-[11.5px] underline text-amber-900">Ignore</button>
          </div>
        </div>
      )}
      {showRequiredHint && (
        <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-2.5 text-[11.5px] text-blue-900">
          Auto-send rule active for this stage ({rule.name}). The email will go out automatically.
        </div>
      )}
      <CodeOfConductPanel
        crmLeadId={crmLeadId}
        paidLeadId={paidLeadId || null}
        memberName={props.memberName}
        memberEmail={props.memberEmail}
        memberPhone={props.memberPhone}
        programName={props.programName}
        dealValue={props.dealValue}
        evalSource="crm"
        evalPipelineId={pipelineId}
        evalStageId={stageId}
      />
    </div>
  );
}
