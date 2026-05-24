import { useEffect, useMemo, useState } from "react";
import { PageHead, SectionLabel } from "@/components/ui-bits";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { logActivity } from "@/lib/auditLog";
import { Check, X } from "lucide-react";

type FlagKey =
  | "active_for_assignment"
  | "include_in_round_robin"
  | "can_receive_calling_crm_leads"
  | "can_receive_paid_pipeline_leads"
  | "can_receive_payment_recovery_leads";

const FLAGS: { key: FlagKey; label: string }[] = [
  { key: "active_for_assignment", label: "Active for assignments" },
  { key: "include_in_round_robin", label: "Include in round robin" },
  { key: "can_receive_calling_crm_leads", label: "Calling CRM leads" },
  { key: "can_receive_paid_pipeline_leads", label: "Paid Pipeline leads" },
  { key: "can_receive_payment_recovery_leads", label: "Payment Recovery leads" },
];

interface Row {
  id: string;
  full_name: string;
  role: string;
  is_admin: boolean;
  active_for_assignment: boolean;
  include_in_round_robin: boolean;
  can_receive_calling_crm_leads: boolean;
  can_receive_paid_pipeline_leads: boolean;
  can_receive_payment_recovery_leads: boolean;
}

export default function BulkEligibility() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState<string>("__all");
  const [showAdmins, setShowAdmins] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedFlags, setSelectedFlags] = useState<Set<FlagKey>>(new Set());
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("id, full_name, role, active_for_assignment, include_in_round_robin, can_receive_calling_crm_leads, can_receive_paid_pipeline_leads, can_receive_payment_recovery_leads")
      .eq("status", "active")
      .order("full_name");
    if (error) { toast.error(error.message); setLoading(false); return; }
    const { data: roles } = await supabase.from("user_roles").select("user_id, role").eq("role", "admin");
    const adminIds = new Set((roles ?? []).map((r: any) => r.user_id));
    setRows((profiles ?? []).map((p: any) => ({
      id: p.id,
      full_name: p.full_name ?? "—",
      role: p.role ?? "—",
      is_admin: adminIds.has(p.id),
      active_for_assignment: p.active_for_assignment !== false,
      include_in_round_robin: !!p.include_in_round_robin,
      can_receive_calling_crm_leads: !!p.can_receive_calling_crm_leads,
      can_receive_paid_pipeline_leads: !!p.can_receive_paid_pipeline_leads,
      can_receive_payment_recovery_leads: !!p.can_receive_payment_recovery_leads,
    })));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const roleOptions = useMemo(() => {
    const s = new Set<string>();
    rows.forEach(r => { if (r.role) s.add(r.role); });
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (!showAdmins && r.is_admin) return false;
      if (roleFilter !== "__all" && r.role !== roleFilter) return false;
      return true;
    });
  }, [rows, roleFilter, showAdmins]);

  const toggleRow = (id: string) => {
    setSelected(prev => {
      const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
    });
  };
  const toggleAll = () => {
    const ids = filtered.map(r => r.id);
    const allSelected = ids.every(id => selected.has(id));
    setSelected(prev => {
      const n = new Set(prev);
      if (allSelected) ids.forEach(id => n.delete(id));
      else ids.forEach(id => n.add(id));
      return n;
    });
  };
  const toggleFlag = (k: FlagKey) => {
    setSelectedFlags(prev => {
      const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n;
    });
  };

  const apply = async (value: boolean) => {
    if (selected.size === 0) return toast.error("Select at least one user.");
    if (selectedFlags.size === 0) return toast.error("Select at least one eligibility flag.");
    const verb = value ? "ENABLE" : "DISABLE";
    const flagsText = Array.from(selectedFlags).map(f => FLAGS.find(x => x.key === f)?.label).join(", ");
    if (!confirm(`${verb} [${flagsText}] for ${selected.size} user(s)?`)) return;

    setBusy(true);
    const ids = Array.from(selected);
    const targets = rows.filter(r => ids.includes(r.id));
    const update: Record<string, boolean> = {};
    selectedFlags.forEach(f => { update[f] = value; });

    const { error } = await supabase.from("profiles").update(update as any).in("id", ids);
    setBusy(false);
    if (error) return toast.error(error.message);

    targets.forEach(t => {
      const old: any = {}, neu: any = {};
      selectedFlags.forEach(f => { old[f] = (t as any)[f]; neu[f] = value; });
      logActivity({
        module_key: "team_directory",
        action_type: "assignment_eligibility_updated",
        entity_type: "team_member",
        entity_id: t.id,
        entity_label: t.full_name,
        target_user_id: t.id,
        target_name: t.full_name,
        old_values: old,
        new_values: neu,
        summary: `Bulk ${verb.toLowerCase()} eligibility for ${t.full_name}: ${flagsText}.`,
      });
    });

    toast.success(`Updated ${ids.length} user(s).`);
    setSelected(new Set());
    setSelectedFlags(new Set());
    await load();
  };

  const allSelectedInView = filtered.length > 0 && filtered.every(r => selected.has(r.id));

  return (
    <div className="max-w-[1100px]">
      <PageHead title="Assignment Eligibility Setup" sub="Quickly enable or disable lead assignment eligibility for multiple users at once." back />

      <div className="bg-off rounded-xl py-5 px-6 mb-6">
        <div className="grid grid-cols-[1fr_auto] gap-4 items-end">
          <div>
            <label className="font-sans text-[10px] uppercase tracking-[0.12em] text-muted-foreground block mb-1.5">Filter by role</label>
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="h-9 px-3 rounded-md border border-line bg-white font-sans text-sm min-w-[260px]">
              <option value="__all">All roles</option>
              {roleOptions.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer h-9">
            <input type="checkbox" checked={showAdmins} onChange={(e) => setShowAdmins(e.target.checked)} className="w-4 h-4" />
            <span className="font-sans text-[12px] text-black">Show admins</span>
          </label>
        </div>
      </div>

      <SectionLabel>Flags to apply</SectionLabel>
      <div className="bg-white border border-line rounded-xl py-4 px-5 mb-4 flex flex-wrap gap-2">
        {FLAGS.map(f => (
          <label key={f.key} className={`flex items-center gap-2 px-3 py-1.5 rounded-md border cursor-pointer text-[12px] font-sans ${selectedFlags.has(f.key) ? "bg-black text-white border-black" : "bg-white border-line text-black hover:bg-off"}`}>
            <input type="checkbox" className="hidden" checked={selectedFlags.has(f.key)} onChange={() => toggleFlag(f.key)} />
            {f.label}
          </label>
        ))}
      </div>

      <div className="flex items-center gap-2 mb-4">
        <button disabled={busy} onClick={() => apply(true)} className="h-9 px-4 rounded-md bg-black text-white font-sans text-[12px] hover:opacity-80 disabled:opacity-50">
          Bulk enable
        </button>
        <button disabled={busy} onClick={() => apply(false)} className="h-9 px-4 rounded-md border border-line bg-white text-black font-sans text-[12px] hover:bg-off disabled:opacity-50">
          Bulk disable
        </button>
        <div className="ml-auto font-sans text-[11px] text-muted-foreground">
          {selected.size} selected · {filtered.length} shown
        </div>
      </div>

      <div className="border border-line rounded-xl bg-white overflow-hidden">
        <table className="w-full border-collapse font-sans text-[12px]">
          <thead>
            <tr className="bg-off">
              <th className="text-left py-2.5 px-3 border-b border-line w-[40px]">
                <Checkbox checked={allSelectedInView} onCheckedChange={toggleAll} />
              </th>
              <th className="text-left text-[9px] font-medium uppercase tracking-[0.12em] text-muted-foreground py-2.5 px-3 border-b border-line">Name</th>
              <th className="text-left text-[9px] font-medium uppercase tracking-[0.12em] text-muted-foreground py-2.5 px-3 border-b border-line">Role</th>
              {FLAGS.map(f => (
                <th key={f.key} className="text-center text-[9px] font-medium uppercase tracking-[0.12em] text-muted-foreground py-2.5 px-2 border-b border-line">{f.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={3 + FLAGS.length} className="py-6 text-center text-muted-foreground">Loading…</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={3 + FLAGS.length} className="py-6 text-center text-muted-foreground">No users match the current filter.</td></tr>}
            {filtered.map(r => (
              <tr key={r.id} className={selected.has(r.id) ? "bg-off" : "hover:bg-off"}>
                <td className="py-2.5 px-3 border-b border-line">
                  <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggleRow(r.id)} />
                </td>
                <td className="py-2.5 px-3 border-b border-line">
                  <div className="font-serif text-[14px] text-black">{r.full_name}</div>
                  {r.is_admin && <div className="font-sans text-[9px] uppercase tracking-wider text-gold-deep">Admin</div>}
                </td>
                <td className="py-2.5 px-3 border-b border-line text-muted-foreground">{r.role}</td>
                {FLAGS.map(f => (
                  <td key={f.key} className="py-2.5 px-2 border-b border-line text-center">
                    {(r as any)[f.key]
                      ? <Check className="w-3.5 h-3.5 text-emerald-600 inline" />
                      : <X className="w-3.5 h-3.5 text-muted-foreground/50 inline" />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="font-sans text-[11px] text-muted-foreground mt-3">
        Changes take effect immediately and appear in the Assign modal across Calling CRM, Paid Pipeline, and Payment Recovery. All changes are recorded in the Audit Log.
      </p>
    </div>
  );
}
