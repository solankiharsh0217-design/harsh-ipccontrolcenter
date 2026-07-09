import { useEffect, useMemo, useState } from "react";
import { PageHead, SectionLabel } from "@/components/ui-bits";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  KpiDefinition, KpiTemplate, KpiTemplateItem, KpiAssignment,
  listKpiDefinitions, createKpiDefinition, updateKpiDefinition, toggleKpiDefinitionActive,
  listKpiTemplates, createKpiTemplate, listTemplateItems, addKpiToTemplate, removeKpiFromTemplate,
  listAllAssignments, createAssignment, deactivateAssignment,
  Cadence, MeasurementType,
} from "@/lib/teamPerformance";

type Tab = "library" | "templates" | "assign";

interface Profile { id: string; full_name: string; role: string | null; }

export default function TeamPerformanceAdmin() {
  const [tab, setTab] = useState<Tab>("library");

  return (
    <div className="max-w-[1180px]">
      <PageHead title="Team Performance OS" sub="Set-and-forget KPIs, templates by role, and assignments. Configuration only — recurring generation runs in Phase 2." />
      <div className="flex gap-1 mb-6 border-b border-line">
        {[
          { k: "library", l: "KPI Library" },
          { k: "templates", l: "KPI Templates" },
          { k: "assign", l: "Assign KPIs" },
        ].map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k as Tab)}
            className={`px-4 py-2.5 font-sans text-[13px] -mb-px border-b-2 transition-colors ${
              tab === t.k ? "border-black text-black" : "border-transparent text-muted-foreground hover:text-black"
            }`}
          >
            {t.l}
          </button>
        ))}
      </div>

      {tab === "library" && <LibraryTab />}
      {tab === "templates" && <TemplatesTab />}
      {tab === "assign" && <AssignTab />}
    </div>
  );
}

// ─────────────────────── LIBRARY ───────────────────────
function LibraryTab() {
  const [items, setItems] = useState<KpiDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [filterActive, setFilterActive] = useState<"all" | "active" | "inactive">("all");
  const [filterCadence, setFilterCadence] = useState<string>("");
  const [editRow, setEditRow] = useState<KpiDefinition | null>(null);

  const reload = async () => {
    setLoading(true);
    try { setItems(await listKpiDefinitions()); } catch (e: any) { toast({ title: "Failed", description: e.message }); }
    setLoading(false);
  };
  useEffect(() => { reload(); }, []);

  const filtered = items.filter((k) => {
    if (filterActive === "active" && !k.is_active) return false;
    if (filterActive === "inactive" && k.is_active) return false;
    if (filterCadence && k.cadence !== filterCadence) return false;
    return true;
  });

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <select value={filterActive} onChange={(e) => setFilterActive(e.target.value as any)} className="border border-line rounded-md px-2 py-1.5 font-sans text-[12px]">
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <select value={filterCadence} onChange={(e) => setFilterCadence(e.target.value)} className="border border-line rounded-md px-2 py-1.5 font-sans text-[12px]">
          <option value="">All cadences</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="recurring">Recurring</option>
          <option value="custom">Custom</option>
        </select>
        <div className="flex-1" />
        <button onClick={() => setShowNew(true)} className="bg-black text-white text-[12px] font-medium rounded-md px-4 py-2">+ New KPI</button>
      </div>

      {loading ? <div className="text-muted-foreground text-sm">Loading…</div> : (
        <div className="border border-line rounded-xl bg-white overflow-hidden">
          <table className="w-full text-[13px] font-sans">
            <thead className="bg-off text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2.5">Name</th>
                <th className="text-left px-4 py-2.5">Role</th>
                <th className="text-left px-4 py-2.5">Cadence</th>
                <th className="text-left px-4 py-2.5">Type</th>
                <th className="text-left px-4 py-2.5">Reward</th>
                <th className="text-left px-4 py-2.5">Status</th>
                <th className="text-right px-4 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((k) => (
                <tr key={k.id} className="border-t border-line">
                  <td className="px-4 py-2.5 font-medium">{k.name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{k.owner_role || "—"}</td>
                  <td className="px-4 py-2.5">{k.cadence}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{k.measurement_type}</td>
                  <td className="px-4 py-2.5">{k.reward_points}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[11px] px-2 py-0.5 rounded ${k.is_active ? "bg-green-50 text-green-800" : "bg-off text-muted-foreground"}`}>
                      {k.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button className="text-[12px] text-muted-foreground hover:text-black mr-3" onClick={() => setEditRow(k)}>Edit</button>
                    <button className="text-[12px] text-muted-foreground hover:text-red-600" onClick={async () => { await toggleKpiDefinitionActive(k.id, !k.is_active); reload(); }}>
                      {k.is_active ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No KPIs.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {(showNew || editRow) && (
        <KpiFormModal
          initial={editRow}
          onClose={() => { setShowNew(false); setEditRow(null); }}
          onSaved={() => { setShowNew(false); setEditRow(null); reload(); }}
        />
      )}
    </div>
  );
}

function KpiFormModal({ initial, onClose, onSaved }: { initial: KpiDefinition | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<Partial<KpiDefinition>>(initial ?? {
    name: "", owner_role: "", cadence: "daily" as Cadence, measurement_type: "yes_no" as MeasurementType,
    weight: 1, reward_points: 0, proof_required: false, approval_required: false, is_active: true,
  });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!form.name?.trim()) return toast({ title: "Name required" });
    setBusy(true);
    try {
      if (initial) await updateKpiDefinition(initial.id, form);
      else await createKpiDefinition(form);
      onSaved();
    } catch (e: any) { toast({ title: "Failed", description: e.message }); }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-xl border border-line max-w-lg w-full p-6">
        <div className="font-serif text-xl mb-4">{initial ? "Edit KPI" : "New KPI"}</div>
        <div className="space-y-3 text-[13px] font-sans">
          <label className="block"><div className="text-muted-foreground mb-1">Name</div>
            <input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full border border-line rounded-md px-2 py-1.5" />
          </label>
          <label className="block"><div className="text-muted-foreground mb-1">Description</div>
            <textarea value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full border border-line rounded-md px-2 py-1.5" rows={2} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><div className="text-muted-foreground mb-1">Owner role</div>
              <input value={form.owner_role ?? ""} onChange={(e) => setForm({ ...form, owner_role: e.target.value })} className="w-full border border-line rounded-md px-2 py-1.5" />
            </label>
            <label className="block"><div className="text-muted-foreground mb-1">Category</div>
              <input value={form.category ?? ""} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full border border-line rounded-md px-2 py-1.5" />
            </label>
            <label className="block"><div className="text-muted-foreground mb-1">Cadence</div>
              <select value={form.cadence} onChange={(e) => setForm({ ...form, cadence: e.target.value as Cadence })} className="w-full border border-line rounded-md px-2 py-1.5">
                <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="recurring">Recurring</option><option value="custom">Custom</option>
              </select>
            </label>
            <label className="block"><div className="text-muted-foreground mb-1">Measurement</div>
              <select value={form.measurement_type} onChange={(e) => setForm({ ...form, measurement_type: e.target.value as MeasurementType })} className="w-full border border-line rounded-md px-2 py-1.5">
                {["number","yes_no","percentage","currency","time","checklist","quality_score","manual_proof","auto_source"].map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            <label className="block"><div className="text-muted-foreground mb-1">Target default</div>
              <input type="number" value={form.target_default ?? ""} onChange={(e) => setForm({ ...form, target_default: e.target.value === "" ? null : Number(e.target.value) })} className="w-full border border-line rounded-md px-2 py-1.5" />
            </label>
            <label className="block"><div className="text-muted-foreground mb-1">Weight</div>
              <input type="number" value={form.weight ?? 1} onChange={(e) => setForm({ ...form, weight: Number(e.target.value) })} className="w-full border border-line rounded-md px-2 py-1.5" />
            </label>
            <label className="block"><div className="text-muted-foreground mb-1">Reward points</div>
              <input type="number" value={form.reward_points ?? 0} onChange={(e) => setForm({ ...form, reward_points: Number(e.target.value) })} className="w-full border border-line rounded-md px-2 py-1.5" />
            </label>
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2"><input type="checkbox" checked={!!form.proof_required} onChange={(e) => setForm({ ...form, proof_required: e.target.checked })} />Proof required</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={!!form.approval_required} onChange={(e) => setForm({ ...form, approval_required: e.target.checked })} />Approval required</label>
          </div>
        </div>
        <div className="flex gap-2 justify-end mt-6">
          <button onClick={onClose} className="px-4 py-2 text-[12px] rounded-md border border-line">Cancel</button>
          <button onClick={save} disabled={busy} className="px-4 py-2 text-[12px] rounded-md bg-black text-white">{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────── TEMPLATES ───────────────────────
function TemplatesTab() {
  const [templates, setTemplates] = useState<KpiTemplate[]>([]);
  const [defs, setDefs] = useState<KpiDefinition[]>([]);
  const [selected, setSelected] = useState<KpiTemplate | null>(null);
  const [items, setItems] = useState<(KpiTemplateItem & { kpi: KpiDefinition })[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState<Partial<KpiTemplate>>({ name: "", role_label: "" });

  const reload = async () => {
    const [t, d] = await Promise.all([listKpiTemplates(), listKpiDefinitions()]);
    setTemplates(t); setDefs(d);
  };
  useEffect(() => { reload(); }, []);
  useEffect(() => { if (selected) listTemplateItems(selected.id).then(setItems); else setItems([]); }, [selected]);

  const availableToAdd = defs.filter((d) => d.is_active && !items.some(i => i.kpi_id === d.id));

  return (
    <div className="grid grid-cols-[280px_1fr] gap-6">
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="font-sans text-[11px] uppercase tracking-wide text-muted-foreground">Templates</div>
          <button onClick={() => setShowNew(true)} className="text-[12px] text-black hover:underline">+ New</button>
        </div>
        <div className="border border-line rounded-xl bg-white divide-y divide-line">
          {templates.map(t => (
            <button key={t.id} onClick={() => setSelected(t)} className={`w-full text-left px-3 py-2.5 text-[13px] ${selected?.id === t.id ? "bg-off" : "hover:bg-off/50"}`}>
              <div className="font-medium">{t.name}</div>
              <div className="text-[11px] text-muted-foreground">{t.role_label || "—"}</div>
            </button>
          ))}
          {templates.length === 0 && <div className="px-3 py-4 text-[12px] text-muted-foreground">No templates yet.</div>}
        </div>
        {showNew && (
          <div className="mt-3 border border-line rounded-xl bg-white p-3 text-[13px] space-y-2">
            <input placeholder="Template name" value={newForm.name ?? ""} onChange={(e) => setNewForm({ ...newForm, name: e.target.value })} className="w-full border border-line rounded-md px-2 py-1.5" />
            <input placeholder="Role label" value={newForm.role_label ?? ""} onChange={(e) => setNewForm({ ...newForm, role_label: e.target.value })} className="w-full border border-line rounded-md px-2 py-1.5" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowNew(false)} className="text-[12px] text-muted-foreground">Cancel</button>
              <button onClick={async () => {
                if (!newForm.name?.trim()) return;
                const t = await createKpiTemplate(newForm);
                setShowNew(false); setNewForm({ name: "", role_label: "" });
                await reload(); setSelected(t);
              }} className="text-[12px] bg-black text-white px-3 py-1.5 rounded-md">Create</button>
            </div>
          </div>
        )}
      </div>

      <div>
        {!selected ? (
          <div className="text-muted-foreground text-sm">Select a template to view its KPIs.</div>
        ) : (
          <div>
            <div className="mb-4">
              <div className="font-serif text-xl">{selected.name}</div>
              <div className="text-[12px] text-muted-foreground">{selected.role_label || "—"} · {items.length} KPI{items.length === 1 ? "" : "s"}</div>
            </div>

            <div className="border border-line rounded-xl bg-white overflow-hidden mb-5">
              <table className="w-full text-[13px] font-sans">
                <thead className="bg-off text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr><th className="text-left px-4 py-2.5">KPI</th><th className="text-left px-4 py-2.5">Cadence</th><th className="text-left px-4 py-2.5">Reward</th><th className="text-right px-4 py-2.5">Actions</th></tr>
                </thead>
                <tbody>
                  {items.map(it => (
                    <tr key={it.id} className="border-t border-line">
                      <td className="px-4 py-2.5">{it.kpi.name}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{it.kpi.cadence}</td>
                      <td className="px-4 py-2.5">{it.reward_points_override ?? it.kpi.reward_points}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button onClick={async () => { await removeKpiFromTemplate(it.id, selected.id); setItems(await listTemplateItems(selected.id)); }} className="text-[12px] text-red-600 hover:underline">Remove</button>
                      </td>
                    </tr>
                  ))}
                  {items.length === 0 && <tr><td colSpan={4} className="text-center py-6 text-muted-foreground">No KPIs in this template.</td></tr>}
                </tbody>
              </table>
            </div>

            <div>
              <div className="font-sans text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Add KPI</div>
              <div className="flex flex-wrap gap-2">
                {availableToAdd.map(d => (
                  <button key={d.id} onClick={async () => { await addKpiToTemplate(selected.id, d.id); setItems(await listTemplateItems(selected.id)); }} className="text-[12px] border border-line rounded-full px-3 py-1 hover:bg-off">
                    + {d.name}
                  </button>
                ))}
                {availableToAdd.length === 0 && <div className="text-[12px] text-muted-foreground">All active KPIs are already in this template.</div>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────── ASSIGN ───────────────────────
function AssignTab() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [templates, setTemplates] = useState<KpiTemplate[]>([]);
  const [defs, setDefs] = useState<KpiDefinition[]>([]);
  const [assignments, setAssignments] = useState<KpiAssignment[]>([]);
  const [mode, setMode] = useState<"template" | "individual">("template");
  const [userId, setUserId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [kpiId, setKpiId] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    const [{ data: ps }, t, d, a] = await Promise.all([
      supabase.from("profiles").select("id, full_name, role").eq("status", "active").order("full_name") as any,
      listKpiTemplates(), listKpiDefinitions(), listAllAssignments(),
    ]);
    setProfiles((ps ?? []) as Profile[]);
    setTemplates(t); setDefs(d.filter(x => x.is_active)); setAssignments(a);
  };
  useEffect(() => { reload(); }, []);

  const nameOf = useMemo(() => new Map(profiles.map(p => [p.id, p.full_name])), [profiles]);
  const tplName = useMemo(() => new Map(templates.map(t => [t.id, t.name])), [templates]);
  const kpiName = useMemo(() => new Map(defs.map(d => [d.id, d.name])), [defs]);

  const submit = async () => {
    if (!userId) return toast({ title: "Pick a team member" });
    if (mode === "template" && !templateId) return toast({ title: "Pick a template" });
    if (mode === "individual" && !kpiId) return toast({ title: "Pick a KPI" });
    setBusy(true);
    try {
      await createAssignment({
        user_id: userId,
        assignment_type: mode,
        template_id: mode === "template" ? templateId : null,
        kpi_id: mode === "individual" ? kpiId : null,
        start_date: startDate,
        is_active: true,
      });
      toast({ title: "Assigned" });
      setTemplateId(""); setKpiId("");
      await reload();
    } catch (e: any) { toast({ title: "Failed", description: e.message }); }
    setBusy(false);
  };

  return (
    <div className="grid grid-cols-[380px_1fr] gap-6">
      <div className="border border-line rounded-xl bg-white p-5">
        <div className="font-serif text-lg mb-4">Assign a KPI</div>
        <div className="space-y-3 text-[13px] font-sans">
          <label className="block"><div className="text-muted-foreground mb-1">Team member</div>
            <select value={userId} onChange={(e) => setUserId(e.target.value)} className="w-full border border-line rounded-md px-2 py-1.5">
              <option value="">Select…</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name} {p.role ? `· ${p.role}` : ""}</option>)}
            </select>
          </label>
          <div className="flex gap-2">
            <button onClick={() => setMode("template")} className={`text-[12px] px-3 py-1.5 rounded-md border ${mode === "template" ? "bg-black text-white border-black" : "border-line"}`}>Template</button>
            <button onClick={() => setMode("individual")} className={`text-[12px] px-3 py-1.5 rounded-md border ${mode === "individual" ? "bg-black text-white border-black" : "border-line"}`}>Individual KPI</button>
          </div>
          {mode === "template" ? (
            <label className="block"><div className="text-muted-foreground mb-1">Template</div>
              <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="w-full border border-line rounded-md px-2 py-1.5">
                <option value="">Select…</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
          ) : (
            <label className="block"><div className="text-muted-foreground mb-1">KPI</div>
              <select value={kpiId} onChange={(e) => setKpiId(e.target.value)} className="w-full border border-line rounded-md px-2 py-1.5">
                <option value="">Select…</option>
                {defs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
          )}
          <label className="block"><div className="text-muted-foreground mb-1">Start date</div>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full border border-line rounded-md px-2 py-1.5" />
          </label>
          <button onClick={submit} disabled={busy} className="w-full bg-black text-white text-[13px] font-medium rounded-md py-2 mt-2">{busy ? "Assigning…" : "Assign"}</button>
          <p className="text-[11px] text-muted-foreground">Configuration only — daily/weekly/monthly instances will be generated in Phase 2.</p>
        </div>
      </div>

      <div>
        <SectionLabel>Current Assignments</SectionLabel>
        <div className="border border-line rounded-xl bg-white overflow-hidden">
          <table className="w-full text-[13px] font-sans">
            <thead className="bg-off text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr><th className="text-left px-4 py-2.5">Member</th><th className="text-left px-4 py-2.5">What</th><th className="text-left px-4 py-2.5">Start</th><th className="text-left px-4 py-2.5">Status</th><th className="text-right px-4 py-2.5"></th></tr>
            </thead>
            <tbody>
              {assignments.map(a => (
                <tr key={a.id} className="border-t border-line">
                  <td className="px-4 py-2.5">{nameOf.get(a.user_id) || a.user_id.slice(0, 8)}</td>
                  <td className="px-4 py-2.5">
                    {a.assignment_type === "template"
                      ? <>Template: <span className="font-medium">{tplName.get(a.template_id!) || "—"}</span></>
                      : <>KPI: <span className="font-medium">{kpiName.get(a.kpi_id!) || "—"}</span></>}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{a.start_date}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[11px] px-2 py-0.5 rounded ${a.is_active ? "bg-green-50 text-green-800" : "bg-off text-muted-foreground"}`}>{a.is_active ? "Active" : "Inactive"}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {a.is_active && <button onClick={async () => { await deactivateAssignment(a.id); reload(); }} className="text-[12px] text-red-600 hover:underline">Deactivate</button>}
                  </td>
                </tr>
              ))}
              {assignments.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">No assignments yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
