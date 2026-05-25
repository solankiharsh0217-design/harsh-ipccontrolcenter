import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import {
  listRewardRules, upsertRewardRule, deleteRewardRule,
  type RewardRule,
} from "@/lib/operationsConversions";
import { logActivity } from "@/lib/auditLog";

const empty: Partial<RewardRule> = {
  rule_name: "",
  role_scope: "media_buyer",
  period: "monthly",
  target_metric: "approved_conversions",
  target_count: 10,
  reward_amount: 3000,
  currency: "INR",
  active: true,
  description: "",
};

export default function OperationsRewardRulesPanel() {
  const [rows, setRows] = useState<RewardRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<RewardRule> | null>(null);

  const load = async () => {
    setLoading(true);
    try { setRows(await listRewardRules()); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing) return;
    if (!editing.rule_name?.trim()) { toast.error("Name required"); return; }
    try {
      const saved = await upsertRewardRule(editing);
      await logActivity({
        module_key: "master_settings",
        module_label: "Master Settings",
        action_type: editing.id ? "ops_reward_rule_updated" : "ops_reward_rule_created",
        entity_type: "operations_reward_rule",
        entity_id: saved.id,
        entity_label: saved.rule_name,
        new_values: saved as any,
        summary: `${editing.id ? "Updated" : "Created"} reward rule '${saved.rule_name}'.`,
      });
      toast.success("Saved");
      setEditing(null); await load();
    } catch (e: any) { toast.error(e.message || "Failed"); }
  };
  const remove = async (r: RewardRule) => {
    if (!confirm(`Delete reward rule "${r.rule_name}"?`)) return;
    try {
      await deleteRewardRule(r.id);
      await logActivity({
        module_key: "master_settings",
        module_label: "Master Settings",
        action_type: "ops_reward_rule_deleted",
        entity_type: "operations_reward_rule",
        entity_id: r.id,
        entity_label: r.rule_name,
        severity: "warning",
        summary: `Deleted reward rule '${r.rule_name}'.`,
      });
      toast.success("Deleted"); await load();
    } catch (e: any) { toast.error(e.message || "Failed"); }
  };

  return (
    <div className="border border-line rounded-lg bg-white p-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="font-serif text-[20px] text-black">Operations Reward Rules</h2>
          <p className="font-sans text-[12.5px] font-light text-muted-foreground mt-1">
            Configure conversion-based rewards for media buyers. Only one active rule is matched per buyer per period.
          </p>
        </div>
        <button onClick={() => setEditing({ ...empty })} className="h-9 px-3 bg-black text-white text-[12px] rounded-md inline-flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" /> New Rule</button>
      </div>

      <div className="border border-line rounded-lg overflow-hidden">
        <div className="grid grid-cols-[1.5fr_90px_140px_100px_110px_90px_120px] bg-off px-4 py-2.5 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
          <div>Rule</div><div>Period</div><div>Metric</div><div className="text-right">Target</div><div className="text-right">Reward</div><div>Status</div><div className="text-right">Actions</div>
        </div>
        {loading ? (
          <div className="px-4 py-8 text-center text-xs text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-muted-foreground">No reward rules yet.</div>
        ) : rows.map((r) => (
          <div key={r.id} className="grid grid-cols-[1.5fr_90px_140px_100px_110px_90px_120px] px-4 py-3 border-t border-line items-center hover:bg-off/40">
            <div>
              <div className="font-serif text-[14px] text-black truncate">{r.rule_name}</div>
              {r.description && <div className="text-[11px] text-muted-foreground truncate">{r.description}</div>}
            </div>
            <div className="text-[12px]">{r.period}</div>
            <div className="text-[12px] truncate">{r.target_metric}</div>
            <div className="text-right tabular-nums text-[12px]">{r.target_count}</div>
            <div className="text-right tabular-nums text-[12px]">{r.currency} {Number(r.reward_amount).toLocaleString()}</div>
            <div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider ${r.active ? "bg-[#DCFCE7] text-[#166534]" : "bg-off text-muted-foreground"}`}>{r.active ? "Active" : "Inactive"}</span>
            </div>
            <div className="flex gap-1.5 justify-end">
              <button onClick={() => setEditing(r)} className="h-7 px-2 text-[11px] border border-line rounded inline-flex items-center gap-1"><Pencil className="w-3 h-3" /> Edit</button>
              <button onClick={() => remove(r)} className="h-7 px-2 text-[11px] border border-line rounded text-[#991B1B] inline-flex items-center gap-1"><Trash2 className="w-3 h-3" /></button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 z-[1400] bg-black/50 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl border border-line shadow-2xl w-full max-w-lg p-5">
            <div className="font-serif text-lg mb-3">{editing.id ? "Edit reward rule" : "New reward rule"}</div>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Name</label>
                <input className="ipc-input" value={editing.rule_name ?? ""} onChange={(e) => setEditing({ ...editing, rule_name: e.target.value })} />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Description</label>
                <textarea rows={2} className="ipc-input !text-xs" value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Period</label>
                  <select className="ipc-input" value={editing.period ?? "monthly"} onChange={(e) => setEditing({ ...editing, period: e.target.value as any })}>
                    <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="custom">Custom</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Metric</label>
                  <select className="ipc-input" value={editing.target_metric ?? "approved_conversions"} onChange={(e) => setEditing({ ...editing, target_metric: e.target.value as any })}>
                    <option value="approved_conversions">Approved conversions</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Target count</label>
                  <input type="number" min={1} className="ipc-input" value={editing.target_count ?? 10} onChange={(e) => setEditing({ ...editing, target_count: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Reward amount</label>
                  <input type="number" min={0} className="ipc-input" value={editing.reward_amount ?? 0} onChange={(e) => setEditing({ ...editing, reward_amount: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Currency</label>
                  <input className="ipc-input" value={editing.currency ?? "INR"} onChange={(e) => setEditing({ ...editing, currency: e.target.value })} />
                </div>
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Active</label>
                  <select className="ipc-input" value={String(editing.active ?? true)} onChange={(e) => setEditing({ ...editing, active: e.target.value === "true" })}>
                    <option value="true">Active</option><option value="false">Inactive</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setEditing(null)} className="h-9 px-3 text-[12px] text-muted-foreground">Cancel</button>
              <button onClick={save} className="h-9 px-4 bg-black text-white text-[12px] rounded-md">Save rule</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
