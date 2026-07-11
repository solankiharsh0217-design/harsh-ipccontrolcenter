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
import { generateKpiEntriesForDate, listGeneratedEntries, GenerationResult, GeneratedEntryRow } from "@/lib/kpiGeneration";
import { format, addDays } from "date-fns";
import { listRoles, listCategories, ensureRoleLabel, ensureCategoryLabel, mergeLabels } from "@/lib/roleCategory";

type Tab = "library" | "templates" | "assign" | "generated" | "settings";

interface Profile { id: string; full_name: string; role: string | null; }

export default function TeamPerformanceAdmin() {
  const [tab, setTab] = useState<Tab>("library");

  return (
    <div className="max-w-[1180px]">
      <PageHead title="Team Performance OS" sub="Set-and-forget KPIs, templates by role, assignments, and recurring entry generation." />
      <div className="flex gap-1 mb-6 border-b border-line">
        {[
          { k: "library", l: "KPI Library" },
          { k: "templates", l: "KPI Templates" },
          { k: "assign", l: "Assign KPIs" },
          { k: "generated", l: "Generated Entries" },
          { k: "settings", l: "Settings" },
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
      {tab === "generated" && <GeneratedTab />}
      {tab === "settings" && <SettingsTab />}
    </div>
  );
}

// ─────────────────────── SETTINGS ───────────────────────
function SettingsTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [autoCheckin, setAutoCheckin] = useState(false);
  const [dailyReminder, setDailyReminder] = useState(false);
  const [morningTime, setMorningTime] = useState("10:00");
  const [dueSoonMin, setDueSoonMin] = useState(60);
  const [overdueOn, setOverdueOn] = useState(true);
  const [genDate, setGenDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [genResult, setGenResult] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("company_settings")
        .select("team_performance_auto_checkin_on_login, team_performance_daily_reminder_enabled, team_performance_reminder_morning_time, team_performance_reminder_due_soon_minutes, team_performance_reminder_overdue_enabled")
        .eq("workspace", "default")
        .maybeSingle();
      if (error) throw error;
      setAutoCheckin(!!data?.team_performance_auto_checkin_on_login);
      setDailyReminder(!!data?.team_performance_daily_reminder_enabled);
      setMorningTime((data?.team_performance_reminder_morning_time ?? "10:00:00").slice(0, 5));
      setDueSoonMin(data?.team_performance_reminder_due_soon_minutes ?? 60);
      setOverdueOn(data?.team_performance_reminder_overdue_enabled ?? true);
    } catch (e: any) {
      toast({ title: "Failed to load settings", description: e.message });
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const save = async (patch: Record<string, any>, actionType: string, label: string, valueText: string) => {
    setSaving(actionType);
    try {
      const { error } = await (supabase as any)
        .from("company_settings")
        .update(patch)
        .eq("workspace", "default");
      if (error) throw error;
      await (supabase as any).from("activity_logs").insert({
        module_key: "team_performance",
        module_label: "Team Performance",
        action_type: actionType,
        entity_type: "company_settings",
        metadata: { ...patch },
        summary: `${label} → ${valueText}`,
      });
      toast({ title: "Saved", description: `${label}: ${valueText}` });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message });
      await load();
    }
    setSaving(null);
  };

  const toggleAuto = async () => {
    const next = !autoCheckin;
    setAutoCheckin(next);
    await save({ team_performance_auto_checkin_on_login: next }, "team_performance_auto_checkin_setting_updated", "Auto Check-in on Login", next ? "ON" : "OFF");
  };
  const toggleReminder = async () => {
    const next = !dailyReminder;
    setDailyReminder(next);
    await save({ team_performance_daily_reminder_enabled: next }, "team_performance_reminder_settings_updated", "Daily KPI Reminder", next ? "ON" : "OFF");
  };
  const toggleOverdue = async () => {
    const next = !overdueOn;
    setOverdueOn(next);
    await save({ team_performance_reminder_overdue_enabled: next }, "team_performance_reminder_settings_updated", "Overdue reminder", next ? "ON" : "OFF");
  };
  const saveMorning = async () => {
    await save({ team_performance_reminder_morning_time: morningTime }, "team_performance_reminder_settings_updated", "Morning reminder time", morningTime);
  };
  const saveDueSoon = async () => {
    const n = Math.max(1, Math.min(1440, Number(dueSoonMin) || 60));
    setDueSoonMin(n);
    await save({ team_performance_reminder_due_soon_minutes: n }, "team_performance_reminder_settings_updated", "Due-soon window", `${n} min`);
  };

  const runGenerate = async () => {
    setGenerating(true);
    setGenResult(null);
    try {
      const mod = await import("@/lib/tpReminders");
      const res = await mod.adminGenerateReminders(genDate);
      if (res.skipped_disabled) {
        setGenResult("Reminders are OFF. No reminders were generated.");
      } else {
        setGenResult(`Users checked: ${res.users_checked} · Created: ${res.created} · Duplicates skipped: ${res.skipped_duplicates}`);
      }
    } catch (e: any) {
      setGenResult(`Error: ${e?.message ?? "failed"}`);
    }
    setGenerating(false);
  };

  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="border border-line rounded-xl bg-white p-5">
        <SectionLabel>Attendance</SectionLabel>
        <div className="mt-3 flex items-start justify-between gap-6">
          <div>
            <div className="font-medium text-[14px]">Auto Check-in on Login</div>
            <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">
              When enabled, active team members will be checked in automatically when they log into IPC Control Centre. If they already have a session for today, it will not be overwritten.
            </p>
          </div>
          <button
            onClick={toggleAuto}
            disabled={saving === "team_performance_auto_checkin_setting_updated"}
            className={`shrink-0 w-11 h-6 rounded-full transition-colors ${autoCheckin ? "bg-black" : "bg-neutral-300"} relative`}
            aria-pressed={autoCheckin}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${autoCheckin ? "translate-x-5" : ""}`} />
          </button>
        </div>
      </div>

      <div className="border border-line rounded-xl bg-white p-5 space-y-4">
        <SectionLabel>Reminders</SectionLabel>

        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="font-medium text-[14px]">Enable Daily KPI Reminders</div>
            <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">
              In-app only. Team members see morning summary, due-soon, overdue, and rejected-feedback reminders on My Today. No email or WhatsApp is sent.
            </p>
          </div>
          <button
            onClick={toggleReminder}
            disabled={saving === "team_performance_reminder_settings_updated"}
            className={`shrink-0 w-11 h-6 rounded-full transition-colors ${dailyReminder ? "bg-black" : "bg-neutral-300"} relative`}
            aria-pressed={dailyReminder}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${dailyReminder ? "translate-x-5" : ""}`} />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-line">
          <div>
            <label className="text-[12px] font-medium">Morning reminder time</label>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="time"
                value={morningTime}
                onChange={(e) => setMorningTime(e.target.value)}
                className="border border-line rounded px-2 py-1.5 text-[13px] w-32"
              />
              <button
                onClick={saveMorning}
                disabled={!dailyReminder || saving !== null}
                className="text-[12px] px-3 py-1.5 rounded border border-line hover:bg-neutral-50 disabled:opacity-50"
              >Save</button>
            </div>
          </div>
          <div>
            <label className="text-[12px] font-medium">Due-soon window (minutes)</label>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="number"
                min={1}
                max={1440}
                value={dueSoonMin}
                onChange={(e) => setDueSoonMin(Number(e.target.value))}
                className="border border-line rounded px-2 py-1.5 text-[13px] w-24"
              />
              <button
                onClick={saveDueSoon}
                disabled={!dailyReminder || saving !== null}
                className="text-[12px] px-3 py-1.5 rounded border border-line hover:bg-neutral-50 disabled:opacity-50"
              >Save</button>
            </div>
          </div>
        </div>

        <div className="flex items-start justify-between gap-6 pt-2 border-t border-line">
          <div>
            <div className="font-medium text-[13px]">Overdue reminders</div>
            <p className="text-[12px] text-muted-foreground mt-1">Show reminders when a pending KPI has passed its due time.</p>
          </div>
          <button
            onClick={toggleOverdue}
            disabled={!dailyReminder || saving !== null}
            className={`shrink-0 w-11 h-6 rounded-full transition-colors ${overdueOn ? "bg-black" : "bg-neutral-300"} relative disabled:opacity-50`}
            aria-pressed={overdueOn}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${overdueOn ? "translate-x-5" : ""}`} />
          </button>
        </div>

        <div className="pt-3 border-t border-line">
          <div className="font-medium text-[13px]">Generate reminders manually</div>
          <p className="text-[12px] text-muted-foreground mt-1">Run reminder generation for all users on a given date. Duplicates are skipped automatically.</p>
          <div className="flex items-center gap-2 mt-2">
            <input
              type="date"
              value={genDate}
              onChange={(e) => setGenDate(e.target.value)}
              className="border border-line rounded px-2 py-1.5 text-[13px]"
            />
            <button
              onClick={runGenerate}
              disabled={generating}
              className="text-[12px] px-3 py-1.5 rounded bg-black text-white hover:bg-black/90 disabled:opacity-50"
            >{generating ? "Generating…" : "Generate Reminders"}</button>
          </div>
          {genResult && <div className="text-[12px] text-muted-foreground mt-2">{genResult}</div>}
        </div>
      </div>
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

// ─────────────────────── GENERATED ENTRIES ───────────────────────
function GeneratedTab() {
  const today = format(new Date(), "yyyy-MM-dd");
  const [date, setDate] = useState<string>(today);
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<GenerationResult | null>(null);
  const [rows, setRows] = useState<GeneratedEntryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterUser, setFilterUser] = useState<string>("");
  const [filterCadence, setFilterCadence] = useState<string>("");
  const [filterKpi, setFilterKpi] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterDate, setFilterDate] = useState<string>(today);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [kpis, setKpis] = useState<KpiDefinition[]>([]);

  useEffect(() => {
    (async () => {
      const { data: p } = await supabase.from("profiles").select("id, full_name, role").eq("status", "active").order("full_name");
      setProfiles((p ?? []) as any);
      try { setKpis(await listKpiDefinitions()); } catch { /* ignore */ }
    })();
  }, []);

  const reload = async () => {
    setLoading(true);
    try {
      setRows(await listGeneratedEntries({
        date: filterDate || undefined,
        user_id: filterUser || undefined,
        cadence: filterCadence || undefined,
        kpi_id: filterKpi || undefined,
        status: filterStatus || undefined,
      }));
    } catch (e: any) { toast({ title: "Failed to load", description: e.message }); }
    setLoading(false);
  };
  useEffect(() => { reload(); }, [filterDate, filterUser, filterCadence, filterKpi, filterStatus]);

  const runGen = async (d: string) => {
    setRunning(true);
    try {
      const r = await generateKpiEntriesForDate(d);
      setLastResult(r);
      toast({ title: "Generation complete", description: `${r.entries_created} created, ${r.entries_skipped_duplicates} duplicates skipped` });
      setFilterDate(d);
      reload();
    } catch (e: any) {
      toast({ title: "Generation failed", description: e.message });
    }
    setRunning(false);
  };

  const quickButtons = [
    { l: "Today", d: today },
    { l: "Tomorrow", d: format(addDays(new Date(), 1), "yyyy-MM-dd") },
    { l: "This Week (Mon)", d: format(new Date(), "yyyy-MM-dd") },
    { l: "This Month (1st)", d: format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd") },
  ];

  return (
    <div className="space-y-6">
      <div className="border border-line rounded-xl bg-white p-5">
        <SectionLabel>Generate KPI Entries</SectionLabel>
        <div className="flex items-end gap-3 flex-wrap mt-2">
          <div>
            <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">Date</div>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border border-line rounded-md px-2 py-1.5 font-sans text-[13px]" />
          </div>
          <button onClick={() => runGen(date)} disabled={running || !date} className="bg-black text-white text-[13px] font-medium rounded-md px-4 py-2 disabled:opacity-50">
            {running ? "Generating…" : "Generate KPIs for Date"}
          </button>
          <div className="flex gap-2 ml-2">
            {quickButtons.map((q) => (
              <button key={q.l} onClick={() => { setDate(q.d); runGen(q.d); }} disabled={running}
                className="border border-line rounded-md px-3 py-1.5 text-[12px] hover:bg-off">
                {q.l}
              </button>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground mt-3">
          Idempotent — running twice for the same date will not create duplicates. Weekly/monthly KPIs generate for the period containing the selected date.
        </p>

        {lastResult && (
          <div className="mt-4 grid grid-cols-2 md:grid-cols-6 gap-3 text-[12px]">
            {[
              ["Checked", lastResult.assignments_checked],
              ["Created", lastResult.entries_created],
              ["Duplicates", lastResult.entries_skipped_duplicates],
              ["Inactive", lastResult.entries_skipped_inactive],
              ["Out of range", lastResult.entries_skipped_out_of_range],
              ["Unsupported", lastResult.entries_skipped_unsupported],
            ].map(([l, v]) => (
              <div key={l as string} className="border border-line rounded-md px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{l}</div>
                <div className="font-medium text-[15px]">{v as number}</div>
              </div>
            ))}
            {lastResult.entries_skipped_unsupported > 0 && (
              <div className="col-span-full border border-amber-300 bg-amber-50 text-amber-900 rounded-md px-3 py-2 text-[12px]">
                <span className="font-medium">{lastResult.entries_skipped_unsupported}</span> assignment{lastResult.entries_skipped_unsupported === 1 ? "" : "s"} skipped — cadence not yet supported by the generator (e.g. <span className="font-mono">custom</span> or complex recurring rules). Custom cadence support will be added in a later phase.
              </div>
            )}
            {lastResult.errors.length > 0 && (
              <div className="col-span-full text-[12px] text-red-700">{lastResult.errors.length} error(s) — see audit log</div>
            )}
          </div>
        )}
      </div>

      <div className="border border-line rounded-xl bg-white">
        <div className="p-4 border-b border-line flex flex-wrap items-center gap-2">
          <SectionLabel>Generated Entries</SectionLabel>
          <div className="flex-1" />
          <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="border border-line rounded-md px-2 py-1.5 text-[12px]" />
          <select value={filterUser} onChange={(e) => setFilterUser(e.target.value)} className="border border-line rounded-md px-2 py-1.5 text-[12px]">
            <option value="">All members</option>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
          <select value={filterCadence} onChange={(e) => setFilterCadence(e.target.value)} className="border border-line rounded-md px-2 py-1.5 text-[12px]">
            <option value="">All cadences</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="recurring">Recurring</option>
          </select>
          <select value={filterKpi} onChange={(e) => setFilterKpi(e.target.value)} className="border border-line rounded-md px-2 py-1.5 text-[12px]">
            <option value="">All KPIs</option>
            {kpis.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="border border-line rounded-md px-2 py-1.5 text-[12px]">
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="submitted">Submitted</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="missed">Missed</option>
          </select>
        </div>
        {loading ? <div className="p-4 text-sm text-muted-foreground">Loading…</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] font-sans">
              <thead className="bg-off text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2.5">Team Member</th>
                  <th className="text-left px-4 py-2.5">KPI</th>
                  <th className="text-left px-4 py-2.5">Cadence</th>
                  <th className="text-left px-4 py-2.5">Period</th>
                  <th className="text-left px-4 py-2.5">Due</th>
                  <th className="text-left px-4 py-2.5">Target</th>
                  <th className="text-left px-4 py-2.5">Source</th>
                  <th className="text-left px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">No entries.</td></tr>
                )}
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-line">
                    <td className="px-4 py-2.5">{r.user_name || r.user_id.slice(0, 6)}</td>
                    <td className="px-4 py-2.5 font-medium">{r.kpi_name || "—"}</td>
                    <td className="px-4 py-2.5">{r.period_type}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{r.period_start}{r.period_start !== r.period_end ? ` → ${r.period_end}` : ""}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{r.due_at ? format(new Date(r.due_at), "MMM d, HH:mm") : "—"}</td>
                    <td className="px-4 py-2.5">{r.target_value ?? "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{r.assignment_type || "—"}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-[11px] px-2 py-0.5 rounded bg-off">{r.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
