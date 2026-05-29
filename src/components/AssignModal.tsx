import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { X, Users, ArrowRight } from "lucide-react";
import { logActivity } from "@/lib/auditLog";
import { createNotification } from "@/lib/notifications";
import { moduleAliases } from "@/lib/eligibleAssignees";

type EligibilityFlag =
  | "can_receive_calling_crm_leads"
  | "can_receive_paid_pipeline_leads"
  | "can_receive_payment_recovery_leads"
  | "can_receive_follow_up_tasks"
  | "can_receive_media_buyer_cases";

export interface AssignableLead {
  id: string;
  current_owner_id?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Logical module key e.g. "calling_crm" | "paid_pipeline" | "payment_recovery" */
  moduleKey: string;
  moduleLabel: string;
  /** DB column to update on the lead */
  ownerColumn: string;
  /** Table to update (e.g. "leads" | "paid_pipeline_leads") */
  tableName: string;
  /** Required eligibility flag for users to be assignable */
  eligibilityFlag: EligibilityFlag;
  /** Full filtered list of leads currently visible */
  filteredLeads: AssignableLead[];
  /** Currently selected lead ids (optional) */
  selectedIds?: string[];
  /** Optional batch name for scope display */
  currentBatchName?: string | null;
  /** Leads currently in the active batch (optional) */
  batchLeads?: AssignableLead[];
  /** Called after successful assignment */
  onAssigned: () => void;
}

interface EligibleUser {
  id: string;
  full_name: string;
  email: string | null;
  role: string | null;
  department: string | null;
  active_for_assignment: boolean;
  include_in_round_robin: boolean;
  isAdmin: boolean;
  flagValue: boolean;
}

type Step = 1 | 2 | 3 | 4 | 5;
type Method = "round_robin" | "single" | "unassign";
type Scope = "selected" | "filtered" | "batch" | "unassigned_filtered";

export default function AssignModal(props: Props) {
  const { open, onClose, moduleKey, moduleLabel, ownerColumn, tableName, eligibilityFlag,
    filteredLeads, selectedIds = [], currentBatchName, batchLeads = [], onAssigned } = props;

  const [step, setStep] = useState<Step>(1);
  const [users, setUsers] = useState<EligibleUser[]>([]);
  const [moduleAccessIds, setModuleAccessIds] = useState<Set<string>>(new Set());
  const [allActiveCount, setAllActiveCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState<string>("");
  const [pickedUserIds, setPickedUserIds] = useState<Set<string>>(new Set());
  const [method, setMethod] = useState<Method>("round_robin");
  const [scope, setScope] = useState<Scope>(selectedIds.length > 0 ? "selected" : "filtered");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(1); setRole(""); setPickedUserIds(new Set());
    setMethod("round_robin");
    setScope(selectedIds.length > 0 ? "selected" : "filtered");
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Keep method consistent with picked-user count
  useEffect(() => {
    if (method === "unassign") return;
    if (pickedUserIds.size === 1 && method !== "single") setMethod("single");
    else if (pickedUserIds.size > 1 && method === "single") setMethod("round_robin");
  }, [pickedUserIds, method]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const cols = `id, full_name, email, role, department, status, active_for_assignment, include_in_round_robin, ${eligibilityFlag}`;
      const aliases = moduleAliases(moduleKey);
      const [{ data: profs }, { data: roles }, { data: access }] = await Promise.all([
        supabase.from("profiles").select(cols).eq("status", "active"),
        supabase.from("user_roles").select("user_id, role").eq("role", "admin"),
        supabase.from("user_module_access").select("user_id, module_key").in("module_key", aliases),
      ]);
      const admins = new Set((roles ?? []).map((r: any) => r.user_id));
      const accessSet = new Set((access ?? []).map((a: any) => a.user_id));
      const mapped: EligibleUser[] = ((profs ?? []) as any[]).map((p) => ({
        id: p.id,
        full_name: p.full_name,
        email: p.email,
        role: p.role ?? null,
        department: p.department ?? null,
        active_for_assignment: p.active_for_assignment !== false,
        include_in_round_robin: p.include_in_round_robin === true,
        isAdmin: admins.has(p.id),
        flagValue: p[eligibilityFlag] === true,
      }));
      setUsers(mapped);
      setModuleAccessIds(accessSet);
      setAllActiveCount(mapped.length);
    } catch (e: any) {
      toast.error(e.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  // Roles available = distinct roles among active users (regardless of flag, so user
  // can pick a role and then see the eligibility gap if any).
  const rolesList = useMemo(() => {
    const set = new Set<string>();
    users.forEach(u => { if (u.role) set.add(u.role); });
    return Array.from(set).sort();
  }, [users]);

  const usersForRole = useMemo(() => {
    if (!role) return [] as EligibleUser[];
    return users.filter(u => (u.role || "") === role && u.active_for_assignment && u.flagValue);
  }, [users, role]);

  // Targets resolved from scope
  const targets = useMemo<AssignableLead[]>(() => {
    if (scope === "selected") return filteredLeads.filter(l => selectedIds.includes(l.id));
    if (scope === "batch") return batchLeads;
    if (scope === "unassigned_filtered") return filteredLeads.filter(l => !l.current_owner_id);
    return filteredLeads;
  }, [scope, filteredLeads, selectedIds, batchLeads]);

  const pickedUsers = useMemo(
    () => usersForRole.filter(u => pickedUserIds.has(u.id)),
    [usersForRole, pickedUserIds]
  );

  const togglePicked = (id: string) => {
    const n = new Set(pickedUserIds);
    if (n.has(id)) n.delete(id); else n.add(id);
    setPickedUserIds(n);
  };

  const runAssign = async () => {
    if (targets.length === 0) { toast.error("No leads in selected scope"); return; }
    if (method !== "unassign" && pickedUsers.length === 0) { toast.error("Pick at least one user"); return; }
    if (method === "single" && pickedUsers.length !== 1) { toast.error("Pick exactly one user for single-assign"); return; }

    setBusy(true);
    try {
      const buckets = new Map<string | null, string[]>();
      if (method === "unassign") {
        buckets.set(null, targets.map(t => t.id));
      } else if (method === "single") {
        buckets.set(pickedUsers[0].id, targets.map(t => t.id));
      } else {
        // round robin among picked users
        targets.forEach((t, i) => {
          const u = pickedUsers[i % pickedUsers.length].id;
          if (!buckets.has(u)) buckets.set(u, []);
          buckets.get(u)!.push(t.id);
        });
      }
      const CHUNK = 200;
      for (const [uid, ids] of buckets) {
        const patch: any = { [ownerColumn]: uid };
        for (let i = 0; i < ids.length; i += CHUNK) {
          const slice = ids.slice(i, i + CHUNK);
          const { error } = await (supabase as any).from(tableName).update(patch).in("id", slice);
          if (error) throw error;
        }
      }
      // audit log
      logActivity({
        module_key: moduleKey,
        module_label: moduleLabel,
        action_type: method === "unassign" ? "bulk_leads_unassigned" : "role_based_assignment_completed",
        action_label: method === "unassign" ? "Leads unassigned" : "Leads assigned",
        entity_type: "lead_assignment",
        metadata: {
          module: moduleKey,
          role,
          method,
          scope,
          lead_count: targets.length,
          assigned_users_count: pickedUsers.length,
          assigned_user_ids: pickedUsers.map(u => u.id),
          batch_name: scope === "batch" ? currentBatchName : null,
        },
        summary: method === "unassign"
          ? `${targets.length} ${moduleLabel} leads unassigned.`
          : `${targets.length} ${moduleLabel} leads assigned to ${pickedUsers.length} user(s) (${method === "round_robin" ? "round-robin" : "single"}, role: ${role}).`,
      });
      // notifications (one grouped per user)
      if (method !== "unassign") {
        const moduleUrl =
          moduleKey === "calling_crm" ? "/crm?assigned_to=me"
          : moduleKey === "paid_pipeline" ? "/paid-pipeline?owner=me"
          : moduleKey === "payment_recovery" ? "/payment-recovery?owner=me"
          : moduleKey === "follow_up_command_center" ? "/follow-up-command-center?assigned_to=me"
          : "/notifications";
        const { data: { user: actor } } = await supabase.auth.getUser();
        for (const [uid, ids] of buckets) {
          if (!uid) continue;
          try {
            await createNotification({
              recipient_user_id: uid,
              module_key: moduleKey,
              notification_type: "leads_assigned",
              title: `New ${moduleLabel} leads assigned`,
              message: `${ids.length} ${moduleLabel} lead(s) ${method === "round_robin" ? "(round-robin) " : ""}assigned to you.`,
              priority: ids.length >= 10 ? "high" : "normal",
              action_url: moduleUrl,
              action_label: `Open ${moduleLabel}`,
              entity_type: "lead_assignment",
              triggered_by_user_id: actor?.id ?? null,
              allowDuplicate: true,
              metadata: {
                module_key: moduleKey,
                lead_ids: ids,
                assignment_type: method === "round_robin" ? "round_robin" : (scope === "filtered" || scope === "unassigned_filtered" ? "filtered" : (ids.length > 1 ? "bulk" : "single")),
                assigned_by: actor?.id ?? null,
                assigned_to: uid,
                count: ids.length,
                deep_link: moduleUrl,
              },
            });
          } catch { /* notifications optional */ }
        }
      }
      toast.success(method === "unassign"
        ? `Unassigned ${targets.length} leads`
        : `Assigned ${targets.length} leads to ${pickedUsers.length} user(s)`);
      onAssigned();
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Assignment failed");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const stepLabel = ["Role", "Users", "Method", "Scope", "Confirm"][step - 1];

  // Eligibility debug counts — exposed in empty states to diagnose read/write mismatches.
  const dbg = {
    active: allActiveCount,
    roleMatch: role ? users.filter(u => (u.role || "") === role).length : 0,
    moduleAccess: role
      ? users.filter(u => (u.role || "") === role && moduleAccessIds.has(u.id)).length
      : users.filter(u => moduleAccessIds.has(u.id)).length,
    eligible: role
      ? users.filter(u => (u.role || "") === role && u.active_for_assignment && u.flagValue).length
      : users.filter(u => u.active_for_assignment && u.flagValue).length,
  };
  const DebugBox = () => (
    <div className="mt-2 p-2.5 rounded-md bg-off border border-line text-[11px] font-mono space-y-0.5">
      <div className="font-sans font-medium text-[11px] mb-1 text-muted-foreground uppercase tracking-wider">Eligibility debug</div>
      <div>Active users found: <strong>{dbg.active}</strong></div>
      <div>Matching role users found: <strong>{dbg.roleMatch}</strong>{role ? ` (role: ${role})` : " (no role picked)"}</div>
      <div>Users with module access ({moduleKey}): <strong>{dbg.moduleAccess}</strong></div>
      <div>Users with assignment eligibility ({eligibilityFlag}): <strong>{dbg.eligible}</strong></div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white rounded-xl border border-line w-full max-w-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <div className="font-serif text-xl flex items-center gap-2"><Users className="w-4 h-4" /> Assign {moduleLabel} leads</div>
            <div className="text-[11px] text-muted-foreground mt-1">Step {step} of 5 · {stepLabel}</div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-black"><X className="w-4 h-4" /></button>
        </div>

        {/* Step 1: Role */}
        {step === 1 && (
          <div className="space-y-3">
            <div>
              <label className="form-label">Select role</label>
              {loading ? (
                <div className="text-xs text-muted-foreground">Loading roles…</div>
              ) : rolesList.length === 0 ? (
                <div className="p-3 rounded-lg bg-[#FFFBEB] border border-[#FDE68A] text-xs">
                  No active team members found. Add members from Admin Center / Team Directory first.
                  <DebugBox />
                </div>
              ) : (
                <select className="ipc-input" value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="">— Choose a role —</option>
                  {rolesList.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              )}
              <div className="text-[11px] text-muted-foreground mt-2">Roles come from Team Directory. Custom roles supported.</div>
            </div>
            <FooterNav onCancel={onClose} onNext={() => setStep(2)} nextDisabled={!role} />
          </div>
        )}

        {/* Step 2: Users */}
        {step === 2 && (
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">Role: <strong className="text-black">{role}</strong></div>
            {usersForRole.length === 0 ? (
              <div className="p-3 rounded-lg bg-[#FFFBEB] border border-[#FDE68A] text-xs space-y-2">
                <div className="font-medium text-[12px]">No eligible users found for this role.</div>
                <div>To make someone eligible:</div>
                <ol className="list-decimal pl-4 space-y-0.5">
                  <li>Go to Admin Center / Team Directory</li>
                  <li>Open the team member</li>
                  <li>Enable <strong>Active for assignments</strong></li>
                  <li>Enable <strong>{eligibilityFlag.replace(/_/g, " ")}</strong></li>
                  <li>Confirm module access if required</li>
                </ol>
                <DebugBox />
              </div>
            ) : (
              <div className="border border-line rounded-lg max-h-72 overflow-y-auto divide-y">
                {usersForRole.map(u => (
                  <label key={u.id} className="flex items-center gap-3 px-3 py-2 hover:bg-off cursor-pointer">
                    <input type="checkbox" checked={pickedUserIds.has(u.id)} onChange={() => togglePicked(u.id)} />
                    <div className="flex-1">
                      <div className="text-[13px] font-medium">{u.full_name} {u.isAdmin && <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#EEF2FF] text-[#4338CA] ml-1">admin</span>}</div>
                      <div className="text-[11px] text-muted-foreground">{u.email} · {u.department || "—"}</div>
                    </div>
                    {u.include_in_round_robin && <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#DCFCE7] text-[#15803D]">RR</span>}
                  </label>
                ))}
              </div>
            )}
            <FooterNav onBack={() => setStep(1)} onCancel={onClose} onNext={() => setStep(3)} nextDisabled={pickedUserIds.size === 0} />
          </div>
        )}

        {/* Step 3: Method */}
        {step === 3 && (() => {
          const onlyOne = pickedUsers.length === 1;
          // Auto-correct invalid method based on picked user count
          if (onlyOne && method === "round_robin") setTimeout(() => setMethod("single"), 0);
          if (!onlyOne && method === "single") setTimeout(() => setMethod("round_robin"), 0);
          return (
            <div className="space-y-3">
              <div>
                <label className="form-label">Assignment method</label>
                {onlyOne ? (
                  <div className="p-3 rounded-lg border border-line bg-off text-[12.5px]">
                    All <strong>{targets.length}</strong> lead(s) will be assigned to <strong>{pickedUsers[0]?.full_name}</strong>.
                  </div>
                ) : (
                  <select className="ipc-input" value={method} onChange={(e) => setMethod(e.target.value as Method)}>
                    <option value="round_robin">Round-robin equal split across selected users</option>
                    <option value="unassign">Unassign (clear owner)</option>
                  </select>
                )}
              </div>
              <FooterNav onBack={() => setStep(2)} onCancel={onClose} onNext={() => setStep(4)} />
            </div>
          );
        })()}

        {/* Step 4: Scope */}
        {step === 4 && (
          <div className="space-y-3">
            <div>
              <label className="form-label">Assignment scope</label>
              <select className="ipc-input" value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
                {selectedIds.length > 0 && <option value="selected">Selected leads only ({selectedIds.length})</option>}
                <option value="filtered">All leads in current view ({filteredLeads.length})</option>
                <option value="unassigned_filtered">Only unassigned in current view ({filteredLeads.filter(l => !l.current_owner_id).length})</option>
                {batchLeads.length > 0 && <option value="batch">Current batch{currentBatchName ? ` — ${currentBatchName}` : ""} ({batchLeads.length})</option>}
              </select>
            </div>
            <FooterNav onBack={() => setStep(3)} onCancel={onClose} onNext={() => setStep(5)} nextDisabled={targets.length === 0} />
          </div>
        )}

        {/* Step 5: Confirm */}
        {step === 5 && (
          <div className="space-y-3">
            <div className="p-4 rounded-lg border border-line bg-off space-y-1 text-[12.5px]">
              <div><strong>{targets.length}</strong> lead(s) will be {method === "unassign" ? "unassigned" : "assigned"}</div>
              {method !== "unassign" && (
                <div>to <strong>{pickedUsers.length}</strong> user(s): {pickedUsers.map(u => u.full_name).join(", ")}</div>
              )}
              <div>Method: <strong>{method.replace(/_/g, " ")}</strong></div>
              <div>Scope: <strong>{scope === "selected" ? "Selected leads" : scope === "batch" ? `Batch — ${currentBatchName || ""}` : scope === "unassigned_filtered" ? "Unassigned in view" : "All in view"}</strong></div>
              <div>Role filter: <strong>{role}</strong></div>
            </div>
            <FooterNav
              onBack={() => setStep(4)}
              onCancel={onClose}
              onNext={runAssign}
              nextLabel={busy ? "Assigning…" : "Confirm assignment"}
              nextDisabled={busy}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function FooterNav({ onBack, onCancel, onNext, nextLabel = "Next", nextDisabled = false }: {
  onBack?: () => void; onCancel: () => void; onNext: () => void; nextLabel?: string; nextDisabled?: boolean;
}) {
  return (
    <div className="flex justify-between pt-1">
      <div>
        {onBack && <button onClick={onBack} className="ipc-btn ipc-btn-ghost">Back</button>}
      </div>
      <div className="flex gap-2">
        <button onClick={onCancel} className="ipc-btn ipc-btn-ghost">Cancel</button>
        <button onClick={onNext} disabled={nextDisabled} className="ipc-btn ipc-btn-black flex items-center gap-1">{nextLabel} {nextLabel === "Next" && <ArrowRight className="w-3.5 h-3.5" />}</button>
      </div>
    </div>
  );
}
