import { useEffect, useState } from "react";
import { LoadingState } from "@/components/ui-bits";
import {
  AccessVerification, WHATSAPP_LABELS, APP_LOGIN_LABELS, CALL_LABELS,
  computeOverall, fetchVerificationForPaidLead, fetchVerificationForCrmLead,
} from "@/lib/accessVerification";
import AccessVerificationModal from "./AccessVerificationModal";

interface Props {
  memberLabel?: string;
  crmLeadId?: string | null;
  paidPipelineLeadId?: string | null;
  cocStatus?: string | null;
  currentStageName?: string | null;
}

const OVERALL_BADGE: Record<string, string> = {
  completed: "bg-emerald-100 text-emerald-800",
  needs_help: "bg-amber-100 text-amber-800",
  incomplete: "bg-slate-100 text-slate-700",
};
const OVERALL_LABEL: Record<string, string> = {
  completed: "Fully verified",
  needs_help: "Needs help",
  incomplete: "Incomplete",
};

export default function AccessVerificationPanel(props: Props) {
  const { memberLabel, crmLeadId, paidPipelineLeadId, cocStatus, currentStageName } = props;
  const [v, setV] = useState<AccessVerification | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    try {
      if (paidPipelineLeadId) setV(await fetchVerificationForPaidLead(paidPipelineLeadId));
      else if (crmLeadId) setV(await fetchVerificationForCrmLead(crmLeadId));
    } finally { setLoading(false); }
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [crmLeadId, paidPipelineLeadId]);

  const overall = computeOverall(v);
  const stageReachedButUnverified =
    !!currentStageName && /access.*whatsapp|whatsapp.*group.*joined/i.test(currentStageName) && overall !== "completed";

  return (
    <div className="border border-border rounded-lg p-4 bg-background">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-semibold">Access Verification</div>
          <div className="text-[11px] text-muted-foreground">WhatsApp group + app login</div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] px-2 py-0.5 rounded-full ${OVERALL_BADGE[overall]}`}>{OVERALL_LABEL[overall]}</span>
          <button onClick={() => setOpen(true)} className="text-xs px-2.5 py-1 rounded-md border border-border hover:bg-muted">
            Update
          </button>
        </div>
      </div>

      {loading ? (
        <LoadingState />
      ) : (
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Code of Conduct</div>
            <div className="text-sm">{cocStatus || "—"}</div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">WhatsApp Group</div>
            <div className="text-sm">{WHATSAPP_LABELS[v?.whatsapp_group_status || "unknown"]}</div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">App Login</div>
            <div className="text-sm">{APP_LOGIN_LABELS[v?.app_login_status || "unknown"]}</div>
            {v?.app_last_login_at && (
              <div className="text-[10px] text-muted-foreground">Last: {new Date(v.app_last_login_at).toLocaleString()}</div>
            )}
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Call Status</div>
            <div className="text-sm">{CALL_LABELS[v?.call_status || "not_called"]} · {v?.call_attempt_count || 0} attempts</div>
            {v?.last_called_at && (
              <div className="text-[10px] text-muted-foreground">Last: {new Date(v.last_called_at).toLocaleString()}</div>
            )}
          </div>
          <div className="col-span-2">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Next Follow-up</div>
            <div className="text-sm">
              {v?.next_follow_up_at ? new Date(v.next_follow_up_at).toLocaleString() : "—"}
            </div>
          </div>
          {v?.contact_notes && (
            <div className="col-span-2">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Notes</div>
              <div className="text-sm whitespace-pre-wrap">{v.contact_notes}</div>
            </div>
          )}
        </div>
      )}

      {stageReachedButUnverified && (
        <div className="mt-3 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">
          Stage reached · Not verified — CRM stage indicates access, but WhatsApp/app-login are not confirmed.
        </div>
      )}

      {open && (
        <AccessVerificationModal
          memberLabel={memberLabel}
          crmLeadId={crmLeadId || null}
          paidPipelineLeadId={paidPipelineLeadId || null}
          existing={v}
          onClose={() => setOpen(false)}
          onSaved={(saved) => setV(saved)}
        />
      )}
    </div>
  );
}
