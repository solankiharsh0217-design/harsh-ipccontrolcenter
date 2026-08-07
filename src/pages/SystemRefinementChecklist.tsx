import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { PageHead, SectionLabel, Tag, LoadingRow } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { logActivity } from "@/lib/auditLog";
import { REFINEMENT_SEED } from "@/lib/refinementSeed";

type Item = {
  id: string;
  section: string;
  module_key: string | null;
  module_label: string | null;
  checklist_item: string;
  description: string | null;
  priority: string;
  status: string;
  issue_type: string | null;
  severity: string | null;
  owner_user_id: string | null;
  owner_name: string | null;
  route: string | null;
  evidence_notes: string | null;
  fix_notes: string | null;
  screenshot_url: string | null;
  reviewed_at: string | null;
  fixed_at: string | null;
  updated_at: string;
  is_deleted: boolean;
};

const PRIORITIES = ["critical", "high", "medium", "low"];
const STATUSES = ["not_checked", "working", "issue_found", "needs_improvement", "fix_in_progress", "fixed", "deferred"];
const ISSUE_TYPES = ["data_accuracy", "workflow", "ux", "access_control", "navigation", "performance", "mobile", "notification", "reporting", "integration", "settings", "other"];
const SEVERITIES = ["blocker", "major", "minor", "suggestion"];

const STATUS_LABEL: Record<string, string> = {
  not_checked: "Not Checked",
  working: "Working",
  issue_found: "Issue Found",
  needs_improvement: "Needs Improvement",
  fix_in_progress: "Fix In Progress",
  fixed: "Fixed",
  deferred: "Deferred",
};

const PRIORITY_TAG: Record<string, "info" | "update" | "urgent"> = {
  critical: "urgent", high: "urgent", medium: "update", low: "info",
};

const STATUS_TAG: Record<string, "info" | "update" | "urgent"> = {
  not_checked: "info",
  working: "update",
  issue_found: "urgent",
  needs_improvement: "urgent",
  fix_in_progress: "update",
  fixed: "update",
  deferred: "info",
};

const QUICK = [
  { key: "not_checked", label: "Not Checked" },
  { key: "issues", label: "Issues Found" },
  { key: "critical", label: "Critical" },
  { key: "high", label: "High Priority" },
  { key: "data_accuracy", label: "Data Accuracy" },
  { key: "workflow", label: "Workflow" },
  { key: "access_control", label: "Access Control" },
  { key: "mobile", label: "Mobile" },
  { key: "ai_ready", label: "Ready for AI Insights" },
];

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });
}

export default function SystemRefinementChecklist() {
  const { isAdmin, user, profile } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [section, setSection] = useState("all");
  const [moduleKey, setModuleKey] = useState("all");
  const [priority, setPriority] = useState("all");
  const [status, setStatus] = useState("all");
  const [issueType, setIssueType] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [owner, setOwner] = useState("all");
  const [search, setSearch] = useState("");
  const [quick, setQuick] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<Item | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("system_refinement_items")
      .select("*")
      .eq("is_deleted", false)
      .order("section")
      .order("created_at");
    if (error) toast.error(error.message);
    setRows((data ?? []) as Item[]);
    setLoading(false);
  }

  async function seedIfEmpty() {
    const { count } = await (supabase as any)
      .from("system_refinement_items")
      .select("id", { count: "exact", head: true })
      .eq("is_deleted", false);
    if ((count ?? 0) > 0) return;
    const payload = REFINEMENT_SEED.map((s) => ({
      section: s.section,
      module_key: s.module_key ?? null,
      module_label: s.module_label ?? null,
      route: s.route ?? null,
      checklist_item: s.checklist_item,
      created_by: user?.id ?? null,
    }));
    const { error } = await (supabase as any).from("system_refinement_items").insert(payload);
    if (error) {
      toast.error("Seed failed: " + error.message);
    } else {
      toast.success(`Seeded ${payload.length} checklist items`);
    }
  }

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      await seedIfEmpty();
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const sections = useMemo(() => Array.from(new Set(rows.map((r) => r.section))), [rows]);
  const modules = useMemo(() => Array.from(new Set(rows.map((r) => r.module_label).filter(Boolean) as string[])), [rows]);
  const owners = useMemo(() => Array.from(new Set(rows.map((r) => r.owner_name).filter(Boolean) as string[])), [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (section !== "all" && r.section !== section) return false;
      if (moduleKey !== "all" && r.module_label !== moduleKey) return false;
      if (priority !== "all" && r.priority !== priority) return false;
      if (status !== "all" && r.status !== status) return false;
      if (issueType !== "all" && r.issue_type !== issueType) return false;
      if (severity !== "all" && r.severity !== severity) return false;
      if (owner !== "all" && r.owner_name !== owner) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!(r.checklist_item.toLowerCase().includes(q) || (r.description ?? "").toLowerCase().includes(q))) return false;
      }
      if (quick === "not_checked" && r.status !== "not_checked") return false;
      if (quick === "issues" && !["issue_found", "needs_improvement"].includes(r.status)) return false;
      if (quick === "critical" && r.priority !== "critical") return false;
      if (quick === "high" && r.priority !== "high") return false;
      if (quick === "data_accuracy" && r.issue_type !== "data_accuracy") return false;
      if (quick === "workflow" && r.issue_type !== "workflow") return false;
      if (quick === "access_control" && r.issue_type !== "access_control") return false;
      if (quick === "mobile" && r.issue_type !== "mobile") return false;
      if (quick === "ai_ready" && r.section !== "Final AI Insights Readiness") return false;
      return true;
    });
  }, [rows, section, moduleKey, priority, status, issueType, severity, owner, search, quick]);

  const stats = useMemo(() => {
    const c = { total: rows.length, not_checked: 0, working: 0, issue_found: 0, needs_improvement: 0, fix_in_progress: 0, fixed: 0, critical_high: 0 };
    rows.forEach((r) => {
      (c as any)[r.status] = ((c as any)[r.status] ?? 0) + 1;
      if (r.priority === "critical" || r.priority === "high") c.critical_high++;
    });
    return c;
  }, [rows]);

  async function updateItem(id: string, patch: Partial<Item>, actionType?: string, summaryPrefix?: string) {
    const before = rows.find((r) => r.id === id);
    const final: any = { ...patch };
    if (patch.status === "fixed" && !before?.fixed_at) final.fixed_at = new Date().toISOString();
    if (patch.status && patch.status !== before?.status) final.reviewed_at = new Date().toISOString();
    const { error } = await (supabase as any).from("system_refinement_items").update(final).eq("id", id);
    if (error) { toast.error(error.message); return; }
    await logActivity({
      module_key: "system_refinement_checklist",
      module_label: "System Refinement Checklist",
      action_type: actionType ?? "refinement_item_updated",
      action_label: actionType ?? "Refinement item updated",
      entity_type: "refinement_item",
      entity_id: id,
      entity_label: before?.checklist_item,
      old_values: before ? Object.fromEntries(Object.keys(patch).map((k) => [k, (before as any)[k]])) : null,
      new_values: patch as any,
      summary: summaryPrefix ?? `Refinement item updated: ${before?.checklist_item ?? id}`,
    });
    await load();
  }

  async function bulkUpdate(patch: Partial<Item>, actionType: string) {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    const final: any = { ...patch };
    if (patch.status === "fixed") final.fixed_at = new Date().toISOString();
    if (patch.status) final.reviewed_at = new Date().toISOString();
    const { error } = await (supabase as any).from("system_refinement_items").update(final).in("id", ids);
    if (error) { toast.error(error.message); return; }
    for (const id of ids) {
      const b = rows.find((r) => r.id === id);
      await logActivity({
        module_key: "system_refinement_checklist",
        module_label: "System Refinement Checklist",
        action_type: actionType,
        action_label: actionType,
        entity_type: "refinement_item",
        entity_id: id,
        entity_label: b?.checklist_item,
        new_values: patch as any,
        summary: `Bulk update: ${actionType} → ${b?.checklist_item ?? id}`,
      });
    }
    setSelected(new Set());
    await load();
    toast.success(`Updated ${ids.length} items`);
  }

  function exportCsv() {
    const headers = ["Section", "Checklist Item", "Module", "Priority", "Status", "Issue Type", "Severity", "Owner", "Route", "Evidence", "Fix Notes", "Reviewed At", "Fixed At", "Updated At"];
    const lines = [headers.join(",")];
    filtered.forEach((r) => {
      const row = [r.section, r.checklist_item, r.module_label ?? "", r.priority, STATUS_LABEL[r.status] ?? r.status, r.issue_type ?? "", r.severity ?? "", r.owner_name ?? "", r.route ?? "", r.evidence_notes ?? "", r.fix_notes ?? "", r.reviewed_at ?? "", r.fixed_at ?? "", r.updated_at];
      lines.push(row.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `system-refinement-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  function copySummary() {
    const top = Object.entries(
      rows.reduce<Record<string, number>>((acc, r) => {
        if (["issue_found", "needs_improvement"].includes(r.status)) acc[r.section] = (acc[r.section] ?? 0) + 1;
        return acc;
      }, {})
    ).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const nextFixes = rows.filter((r) => r.status === "issue_found" || r.status === "needs_improvement")
      .sort((a, b) => PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority)).slice(0, 3);
    const lines = [
      "System Refinement Summary",
      `Total Items: ${stats.total}`,
      `Working: ${stats.working}`,
      `Issues Found: ${stats.issue_found}`,
      `Needs Improvement: ${stats.needs_improvement}`,
      `Fix In Progress: ${stats.fix_in_progress}`,
      `Fixed: ${stats.fixed}`,
      `Critical Issues: ${rows.filter((r) => r.priority === "critical").length}`,
      `High Priority Issues: ${rows.filter((r) => r.priority === "high").length}`,
      "",
      "Top Areas Needing Attention:",
      ...top.map((t, i) => `${i + 1}. ${t[0]} (${t[1]})`),
      "",
      "Next Recommended Fixes:",
      ...nextFixes.map((r, i) => `${i + 1}. ${r.checklist_item} [${r.section}]`),
    ];
    navigator.clipboard.writeText(lines.join("\n"));
    toast.success("Summary copied");
  }

  function copyAiReadiness() {
    const sectionScore = (name: string) => {
      const s = rows.filter((r) => r.section === name);
      if (!s.length) return "N/A";
      const reliable = s.filter((r) => r.status === "working" || r.status === "fixed").length;
      const pct = Math.round((reliable / s.length) * 100);
      return `${pct}% reliable (${reliable}/${s.length})`;
    };
    const overall = (() => {
      if (!rows.length) return "Unknown";
      const ok = rows.filter((r) => r.status === "working" || r.status === "fixed").length;
      const pct = Math.round((ok / rows.length) * 100);
      if (pct >= 90) return `Ready (${pct}%)`;
      if (pct >= 70) return `Almost Ready (${pct}%)`;
      return `Not Ready (${pct}%)`;
    })();
    const critical = rows.filter((r) => r.priority === "critical" && r.status !== "fixed").length;
    const lines = [
      "AI Insights Readiness Summary",
      `Data Reliability: ${sectionScore("Data Accuracy")}`,
      `Revenue Flow: ${sectionScore("End-to-End Revenue Flow")}`,
      `Follow-Up System: ${sectionScore("Follow-Up Command Center")}`,
      `Payment Recovery: ${sectionScore("Payment Recovery")}`,
      `Notifications: ${sectionScore("Notifications")}`,
      `Audit Log: ${sectionScore("Audit Log")}`,
      `Webinar Performance: ${sectionScore("Webinar Performance")}`,
      `Overall Readiness: ${overall}`,
      `Recommendation: ${critical > 0 ? `Fix ${critical} critical issue(s) before AI Insights.` : "Proceed with AI Insights when overall readiness ≥ 90%."}`,
    ];
    navigator.clipboard.writeText(lines.join("\n"));
    toast.success("AI readiness summary copied");
  }

  if (!isAdmin) {
    return (
      <div className="max-w-[1060px]">
        <PageHead title="System Refinement Checklist" sub="Admin only." />
        <div className="border border-line rounded-xl bg-white px-[22px] py-8 font-sans text-[13px] text-muted-foreground">
          You do not have access to this page.
        </div>
      </div>
    );
  }

  const allSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id));

  return (
    <div className="max-w-[1300px]">
      <PageHead title="System Refinement Checklist" sub="Review, prioritize, and fix functional gaps across the Control Center before building the AI Insights layer." />
      <div className="mb-6 -mt-3 space-y-2 font-sans text-[12px] text-muted-foreground">
        <div>This checklist is used to stabilize the system, verify data accuracy, improve workflows, and polish user experience before creating final intelligence and automation layers.</div>
        <div className="text-[11px] text-[#B45309] bg-[#FFFBEB] border border-[#FDE68A] rounded-md px-3 py-2 inline-block">
          This page does not change business data. It only tracks refinement tasks and QA status.
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2.5 mb-6">
        {[
          ["Total", stats.total],
          ["Not Checked", stats.not_checked],
          ["Working", stats.working],
          ["Issues", stats.issue_found],
          ["Needs Imp.", stats.needs_improvement],
          ["In Progress", stats.fix_in_progress],
          ["Fixed", stats.fixed],
          ["Critical/High", stats.critical_high],
        ].map(([label, val]) => (
          <div key={label as string} className="border border-line rounded-lg bg-white px-3 py-2.5">
            <div className="font-sans text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className="font-serif text-[22px] text-black mt-0.5">{val as number}</div>
          </div>
        ))}
      </div>

      {/* Quick filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        {QUICK.map((q) => (
          <button
            key={q.key}
            onClick={() => setQuick(quick === q.key ? null : q.key)}
            className={`text-[11px] font-medium px-3 py-1.5 rounded-md border transition-colors ${
              quick === q.key ? "bg-black text-white border-black" : "bg-white border-line text-black hover:bg-off"
            }`}
          >
            {q.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 mb-4">
        <Select value={section} onValueChange={setSection}>
          <SelectTrigger><SelectValue placeholder="Section" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Sections</SelectItem>{sections.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={moduleKey} onValueChange={setModuleKey}>
          <SelectTrigger><SelectValue placeholder="Module" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Modules</SelectItem>{modules.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger><SelectValue placeholder="Priority" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Priorities</SelectItem>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Statuses</SelectItem>{STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={issueType} onValueChange={setIssueType}>
          <SelectTrigger><SelectValue placeholder="Issue Type" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Types</SelectItem>{ISSUE_TYPES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={severity} onValueChange={setSeverity}>
          <SelectTrigger><SelectValue placeholder="Severity" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Severities</SelectItem>{SEVERITIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={owner} onValueChange={setOwner}>
          <SelectTrigger><SelectValue placeholder="Owner" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Owners</SelectItem>{owners.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
        </Select>
        <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {/* Actions row */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Button variant="outline" size="sm" onClick={exportCsv}>Export CSV</Button>
        <Button variant="outline" size="sm" onClick={copySummary}>Copy Refinement Summary</Button>
        <Button variant="outline" size="sm" onClick={copyAiReadiness}>Copy AI Readiness Summary</Button>
        <div className="flex-1" />
        {selected.size > 0 && (
          <>
            <span className="text-[12px] text-muted-foreground">{selected.size} selected</span>
            <Button variant="outline" size="sm" onClick={() => bulkUpdate({ status: "working" }, "refinement_status_changed")}>Mark Working</Button>
            <Button variant="outline" size="sm" onClick={() => bulkUpdate({ status: "issue_found" }, "refinement_status_changed")}>Mark Issue</Button>
            <Button variant="outline" size="sm" onClick={() => bulkUpdate({ status: "fixed" }, "refinement_item_fixed")}>Mark Fixed</Button>
          </>
        )}
      </div>

      {/* Table */}
      <div className="border border-line rounded-xl bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="bg-off border-b border-line">
              <tr>
                <th className="p-2 w-8"><Checkbox checked={allSelected} onCheckedChange={(c) => {
                  const s = new Set(selected);
                  if (c) filtered.forEach((r) => s.add(r.id)); else filtered.forEach((r) => s.delete(r.id));
                  setSelected(s);
                }} /></th>
                <th className="p-2 text-left font-medium">Section</th>
                <th className="p-2 text-left font-medium">Checklist Item</th>
                <th className="p-2 text-left font-medium">Module</th>
                <th className="p-2 text-left font-medium">Priority</th>
                <th className="p-2 text-left font-medium">Status</th>
                <th className="p-2 text-left font-medium">Issue Type</th>
                <th className="p-2 text-left font-medium">Severity</th>
                <th className="p-2 text-left font-medium">Owner</th>
                <th className="p-2 text-left font-medium">Updated</th>
                <th className="p-2 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && <LoadingRow colSpan={11} />}
              {!loading && filtered.length === 0 && <tr><td colSpan={11} className="p-8 text-center text-muted-foreground">No items.</td></tr>}
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-line hover:bg-off/40">
                  <td className="p-2">
                    <Checkbox checked={selected.has(r.id)} onCheckedChange={(c) => {
                      const s = new Set(selected);
                      if (c) s.add(r.id); else s.delete(r.id);
                      setSelected(s);
                    }} />
                  </td>
                  <td className="p-2 text-muted-foreground whitespace-nowrap">{r.section}</td>
                  <td className="p-2"><button onClick={() => setDetail(r)} className="text-left hover:underline">{r.checklist_item}</button></td>
                  <td className="p-2 text-muted-foreground whitespace-nowrap">{r.module_label ?? "—"}</td>
                  <td className="p-2"><Tag type={PRIORITY_TAG[r.priority] ?? "info"}>{r.priority}</Tag></td>
                  <td className="p-2"><Tag type={STATUS_TAG[r.status] ?? "info"}>{STATUS_LABEL[r.status] ?? r.status}</Tag></td>
                  <td className="p-2 text-muted-foreground">{r.issue_type ?? "—"}</td>
                  <td className="p-2 text-muted-foreground">{r.severity ?? "—"}</td>
                  <td className="p-2 text-muted-foreground">{r.owner_name ?? "—"}</td>
                  <td className="p-2 text-muted-foreground whitespace-nowrap">{fmtDate(r.updated_at)}</td>
                  <td className="p-2 whitespace-nowrap">
                    <button onClick={() => setDetail(r)} className="text-[11px] text-black hover:underline mr-2">Edit</button>
                    <button onClick={() => updateItem(r.id, { status: "working" }, "refinement_status_changed")} className="text-[11px] text-muted-foreground hover:text-black mr-2">Working</button>
                    <button onClick={() => updateItem(r.id, { status: "issue_found" }, "refinement_status_changed")} className="text-[11px] text-muted-foreground hover:text-black mr-2">Issue</button>
                    <button onClick={() => updateItem(r.id, { status: "fixed" }, "refinement_item_fixed")} className="text-[11px] text-muted-foreground hover:text-black">Fixed</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail drawer */}
      <Sheet open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent className="w-full sm:max-w-[560px] overflow-y-auto">
          {detail && <DetailEditor key={detail.id} item={detail} onSave={async (patch, action, summary) => {
            await updateItem(detail.id, patch, action, summary);
            setDetail(null);
          }} onClose={() => setDetail(null)} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DetailEditor({ item, onSave, onClose }: { item: Item; onSave: (patch: Partial<Item>, action?: string, summary?: string) => Promise<void>; onClose: () => void }) {
  const [form, setForm] = useState<Partial<Item>>({
    checklist_item: item.checklist_item,
    description: item.description ?? "",
    section: item.section,
    module_label: item.module_label ?? "",
    priority: item.priority,
    status: item.status,
    issue_type: item.issue_type ?? "",
    severity: item.severity ?? "",
    owner_name: item.owner_name ?? "",
    route: item.route ?? "",
    evidence_notes: item.evidence_notes ?? "",
    fix_notes: item.fix_notes ?? "",
    screenshot_url: item.screenshot_url ?? "",
  });

  const update = (k: keyof Item, v: any) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <>
      <SheetHeader>
        <SheetTitle className="font-serif">{item.checklist_item}</SheetTitle>
      </SheetHeader>
      <div className="space-y-3 mt-4 text-[12px]">
        <Field label="Checklist Item"><Input value={form.checklist_item ?? ""} onChange={(e) => update("checklist_item", e.target.value)} /></Field>
        <Field label="Description"><Textarea rows={2} value={form.description ?? ""} onChange={(e) => update("description", e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Section"><Input value={form.section ?? ""} onChange={(e) => update("section", e.target.value)} /></Field>
          <Field label="Module"><Input value={form.module_label ?? ""} onChange={(e) => update("module_label", e.target.value)} /></Field>
          <Field label="Priority">
            <Select value={form.priority} onValueChange={(v) => update("priority", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Status">
            <Select value={form.status} onValueChange={(v) => update("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Issue Type">
            <Select value={form.issue_type || "none"} onValueChange={(v) => update("issue_type", v === "none" ? null : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">—</SelectItem>{ISSUE_TYPES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Severity">
            <Select value={form.severity || "none"} onValueChange={(v) => update("severity", v === "none" ? null : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">—</SelectItem>{SEVERITIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Owner"><Input value={form.owner_name ?? ""} onChange={(e) => update("owner_name", e.target.value)} /></Field>
          <Field label="Route"><Input value={form.route ?? ""} onChange={(e) => update("route", e.target.value)} /></Field>
        </div>
        <Field label="Evidence Notes"><Textarea rows={3} value={form.evidence_notes ?? ""} onChange={(e) => update("evidence_notes", e.target.value)} /></Field>
        <Field label="Fix Notes"><Textarea rows={3} value={form.fix_notes ?? ""} onChange={(e) => update("fix_notes", e.target.value)} /></Field>
        <Field label="Screenshot URL"><Input value={form.screenshot_url ?? ""} onChange={(e) => update("screenshot_url", e.target.value)} /></Field>
        <div className="text-[11px] text-muted-foreground">Reviewed: {fmtDate(item.reviewed_at)} • Fixed: {fmtDate(item.fixed_at)}</div>
        <div className="flex flex-wrap gap-2 pt-3">
          {item.route && <Button variant="outline" size="sm" onClick={() => window.open(item.route!, "_blank")}>Open Related Module ↗</Button>}
          <Button size="sm" onClick={() => onSave(form, "refinement_item_updated", `Notes saved: ${item.checklist_item}`)}>Save</Button>
          <Button variant="outline" size="sm" onClick={() => onSave({ ...form, status: "working" }, "refinement_status_changed")}>Mark Working</Button>
          <Button variant="outline" size="sm" onClick={() => onSave({ ...form, status: "issue_found" }, "refinement_status_changed")}>Mark Issue</Button>
          <Button variant="outline" size="sm" onClick={() => onSave({ ...form, status: "fixed" }, "refinement_item_fixed")}>Mark Fixed</Button>
          <Button variant="outline" size="sm" onClick={() => onSave({ ...form, status: "deferred" }, "refinement_item_deferred")}>Defer</Button>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}
