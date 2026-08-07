import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHead, Tag, LoadingRow } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Card } from "@/components/ui/card";
import { MODULE_LABELS } from "@/lib/auditLog";
import { Download, ExternalLink, RefreshCw } from "lucide-react";

type Row = {
  id: string;
  module_key: string | null;
  module_label: string | null;
  action_type: string;
  action_label: string | null;
  entity_type: string | null;
  entity_id: string | null;
  entity_label: string | null;
  actor_user_id: string | null;
  actor_name: string | null;
  actor_email: string | null;
  target_user_id: string | null;
  target_name: string | null;
  old_values: any;
  new_values: any;
  metadata: any;
  severity: string;
  source: string;
  summary: string | null;
  created_at: string;
};

const ACTION_TYPES = [
  "created", "updated", "deleted", "soft_deleted", "restored",
  "payment_added", "payment_updated", "payment_deleted",
  "stage_changed", "status_changed", "finance_status_changed",
  "assigned", "unassigned",
  "follow_up_created", "follow_up_completed", "follow_up_rescheduled", "follow_up_missed",
  "note_added", "access_granted", "access_removed", "role_changed",
  "settings_updated", "report_viewed", "report_exported", "report_deleted", "report_restored",
  "imported", "data_refreshed", "founder_summary_copied",
];

const QUICK_FILTERS = [
  { label: "Today", days: 0 },
  { label: "Last 7 Days", days: 7 },
  { label: "Last 30 Days", days: 30 },
];

const SEVERITY_COLORS: Record<string, "info" | "update" | "urgent"> = {
  info: "info",
  warning: "update",
  critical: "urgent",
};

function fmtDateTime(d: string) {
  return new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function dateNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function entityLinkFor(row: Row): string | null {
  switch (row.module_key) {
    case "paid_pipeline": return "/paid-pipeline";
    case "payment_recovery": return "/payment-recovery";
    case "follow_up_command_center": return "/follow-up-command-center";
    case "calling_crm": return "/crm";
    case "master_settings": return "/master-settings";
    case "reports": return "/reports";
    case "webinar_performance": return "/webinar-performance";
    case "team": return "/team";
    case "admin": return "/admin";
    default: return null;
  }
}

export default function AuditLog() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState<string>(dateNDaysAgo(7));
  const [to, setTo] = useState<string>("");
  const [module, setModule] = useState<string>("all");
  const [action, setAction] = useState<string>("all");
  const [severity, setSeverity] = useState<string>("all");
  const [entityType, setEntityType] = useState<string>("all");
  const [actor, setActor] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [detail, setDetail] = useState<Row | null>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  async function load() {
    setLoading(true);
    try {
      let q: any = (supabase as any).from("audit_logs")
        .select("*")
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (from) q = q.gte("created_at", from);
      if (to) q = q.lte("created_at", to);
      const { data, error } = await q;
      if (error) throw error;
      setRows((data as Row[]) || []);
    } catch (e) {
      console.warn("[audit] load failed", e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [from, to]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (module !== "all" && r.module_key !== module) return false;
      if (action !== "all" && r.action_type !== action) return false;
      if (severity !== "all" && r.severity !== severity) return false;
      if (entityType !== "all" && r.entity_type !== entityType) return false;
      if (actor !== "all" && r.actor_user_id !== actor) return false;
      if (search.trim()) {
        const s = search.toLowerCase();
        const hay = [r.action_label, r.action_type, r.entity_label, r.actor_name, r.actor_email, r.target_name, r.summary, r.module_label].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [rows, module, action, severity, entityType, actor, search]);

  const counts = useMemo(() => {
    const c = { total: 0, payment: 0, finance: 0, assignment: 0, stage: 0, settings: 0, access: 0, critical: 0 };
    for (const r of rows) {
      c.total++;
      if (r.action_type.startsWith("payment_")) c.payment++;
      if (r.action_type.includes("finance")) c.finance++;
      if (r.action_type === "assigned" || r.action_type === "unassigned") c.assignment++;
      if (r.action_type === "stage_changed") c.stage++;
      if (r.action_type === "settings_updated" || r.module_key === "master_settings") c.settings++;
      if (r.action_type === "access_granted" || r.action_type === "access_removed" || r.action_type === "role_changed") c.access++;
      if (r.severity === "critical") c.critical++;
    }
    return c;
  }, [rows]);

  const actorOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) {
      if (r.actor_user_id) map.set(r.actor_user_id, r.actor_name || r.actor_email || r.actor_user_id);
    }
    return Array.from(map.entries());
  }, [rows]);

  const entityOptions = useMemo(() => Array.from(new Set(rows.map((r) => r.entity_type).filter(Boolean))) as string[], [rows]);

  function applyQuick(name: string) {
    if (name === "Today") { setFrom(dateNDaysAgo(0)); setTo(""); }
    else if (name === "Last 7 Days") { setFrom(dateNDaysAgo(7)); setTo(""); }
    else if (name === "Last 30 Days") { setFrom(dateNDaysAgo(30)); setTo(""); }
    else if (name === "Payments") { setAction("all"); setEntityType("all"); setModule("paid_pipeline"); }
    else if (name === "Finance") { setAction("finance_status_changed"); }
    else if (name === "Assignments") { setAction("assigned"); }
    else if (name === "Stage Changes") { setAction("stage_changed"); }
    else if (name === "Access") { setAction("access_granted"); }
    else if (name === "Settings") { setModule("master_settings"); }
    else if (name === "Report Actions") { setModule("reports"); }
    else if (name === "Critical") { setSeverity("critical"); }
  }

  function exportCsv() {
    const headers = ["created_at","module_label","action_type","action_label","entity_type","entity_label","actor_name","actor_email","target_name","severity","summary","old_values","new_values"];
    const lines = [headers.join(",")];
    for (const r of filtered) {
      const cells = [
        r.created_at, r.module_label || r.module_key || "", r.action_type, r.action_label || "",
        r.entity_type || "", r.entity_label || "", r.actor_name || "", r.actor_email || "",
        r.target_name || "", r.severity, r.summary || "",
        r.old_values ? JSON.stringify(r.old_values) : "",
        r.new_values ? JSON.stringify(r.new_values) : "",
      ];
      lines.push(cells.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  const summaryCards = [
    { label: "Total Activities", value: counts.total, filter: () => { setAction("all"); setSeverity("all"); setModule("all"); } },
    { label: "Payment Actions", value: counts.payment, filter: () => setModule("paid_pipeline") },
    { label: "Finance Changes", value: counts.finance, filter: () => setAction("finance_status_changed") },
    { label: "Lead Assignments", value: counts.assignment, filter: () => setAction("assigned") },
    { label: "Stage Changes", value: counts.stage, filter: () => setAction("stage_changed") },
    { label: "Settings Changes", value: counts.settings, filter: () => setModule("master_settings") },
    { label: "Access Changes", value: counts.access, filter: () => setAction("access_granted") },
    { label: "Critical", value: counts.critical, filter: () => setSeverity("critical") },
  ];

  return (
    <div className="p-8 max-w-[1400px] mx-auto">
      <div className="flex items-start justify-between gap-4 mb-2">
        <PageHead title="Audit Log" sub="Track important changes across payments, leads, finance, settings, reports, access, and team activity." />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-3.5 h-3.5 mr-1.5" />Refresh</Button>
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="w-3.5 h-3.5 mr-1.5" />Export CSV</Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
        {summaryCards.map((c) => (
          <Card key={c.label} className="p-3 cursor-pointer hover:bg-off transition" onClick={c.filter}>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{c.label}</div>
            <div className="font-serif text-[22px] mt-1">{c.value}</div>
          </Card>
        ))}
      </div>

      {/* Quick filters */}
      <div className="flex flex-wrap gap-2 mb-3">
        {["Today","Last 7 Days","Last 30 Days","Payments","Finance","Assignments","Stage Changes","Access","Settings","Report Actions","Critical"].map((q) => (
          <button key={q} onClick={() => applyQuick(q)}
            className="px-3 py-1 text-[11px] rounded-full border border-line hover:bg-off transition">
            {q}
          </button>
        ))}
      </div>

      {/* Filter row */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-4">
        <Input type="date" value={from ? from.slice(0, 10) : ""} onChange={(e) => setFrom(e.target.value ? new Date(e.target.value).toISOString() : "")} />
        <Input type="date" value={to ? to.slice(0, 10) : ""} onChange={(e) => setTo(e.target.value ? new Date(e.target.value + "T23:59:59").toISOString() : "")} />
        <Select value={module} onValueChange={setModule}>
          <SelectTrigger><SelectValue placeholder="Module" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Modules</SelectItem>
            {Object.entries(MODULE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={action} onValueChange={setAction}>
          <SelectTrigger><SelectValue placeholder="Action" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            {ACTION_TYPES.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={severity} onValueChange={setSeverity}>
          <SelectTrigger><SelectValue placeholder="Severity" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severity</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
        <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {/* Table */}
      <div className="border border-line rounded-md overflow-hidden bg-white">
        <table className="w-full text-[12px]">
          <thead className="bg-off text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Date / Time</th>
              <th className="text-left px-3 py-2 font-medium">Module</th>
              <th className="text-left px-3 py-2 font-medium">Action</th>
              <th className="text-left px-3 py-2 font-medium">Entity</th>
              <th className="text-left px-3 py-2 font-medium">Actor</th>
              <th className="text-left px-3 py-2 font-medium">Target</th>
              <th className="text-left px-3 py-2 font-medium">Severity</th>
              <th className="text-left px-3 py-2 font-medium">Summary</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading && <LoadingRow colSpan={9} />}
            {!loading && pageRows.length === 0 && <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">No activity in this range.</td></tr>}
            {pageRows.map((r) => (
              <tr key={r.id} className="border-t border-line hover:bg-off/50">
                <td className="px-3 py-2 whitespace-nowrap">{fmtDateTime(r.created_at)}</td>
                <td className="px-3 py-2">{r.module_label || r.module_key || "—"}</td>
                <td className="px-3 py-2">{r.action_label || r.action_type}</td>
                <td className="px-3 py-2">{r.entity_label || r.entity_type || "—"}</td>
                <td className="px-3 py-2">{r.actor_name || r.actor_email || "—"}</td>
                <td className="px-3 py-2">{r.target_name || "—"}</td>
                <td className="px-3 py-2"><Tag type={SEVERITY_COLORS[r.severity] || "info"}>{r.severity}</Tag></td>
                <td className="px-3 py-2 max-w-[280px] truncate">{r.summary || "—"}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <button className="text-[11px] underline" onClick={() => setDetail(r)}>View</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-between items-center mt-3 text-[12px]">
          <div className="text-muted-foreground">{filtered.length} entries · Page {page + 1} of {totalPages}</div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Prev</Button>
            <Button size="sm" variant="outline" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      {/* Detail drawer */}
      <Sheet open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent className="w-[480px] sm:max-w-[520px] overflow-y-auto">
          {detail && (
            <>
              <SheetHeader>
                <SheetTitle>{detail.action_label || detail.action_type}</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-3 text-[12px]">
                <Row label="Timestamp" value={fmtDateTime(detail.created_at)} />
                <Row label="Module" value={detail.module_label || detail.module_key || "N/A"} />
                <Row label="Action Type" value={detail.action_type} />
                <Row label="Severity" value={<Tag type={SEVERITY_COLORS[detail.severity] || "info"}>{detail.severity}</Tag>} />
                <Row label="Actor" value={detail.actor_name || detail.actor_email || "N/A"} />
                {detail.actor_email && <Row label="Actor Email" value={detail.actor_email} />}
                <Row label="Entity Type" value={detail.entity_type || "N/A"} />
                <Row label="Entity" value={detail.entity_label || "N/A"} />
                {detail.target_name && <Row label="Target" value={detail.target_name} />}
                {detail.summary && <Row label="Summary" value={detail.summary} />}
                {detail.old_values && (
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground mb-1">Old Values</div>
                    <pre className="bg-off p-2 rounded text-[11px] whitespace-pre-wrap break-all">{JSON.stringify(detail.old_values, null, 2)}</pre>
                  </div>
                )}
                {detail.new_values && (
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground mb-1">New Values</div>
                    <pre className="bg-off p-2 rounded text-[11px] whitespace-pre-wrap break-all">{JSON.stringify(detail.new_values, null, 2)}</pre>
                  </div>
                )}
                {detail.metadata && (
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground mb-1">Metadata</div>
                    <pre className="bg-off p-2 rounded text-[11px] whitespace-pre-wrap break-all">{JSON.stringify(detail.metadata, null, 2)}</pre>
                  </div>
                )}
                {entityLinkFor(detail) && (
                  <Button size="sm" variant="outline" onClick={() => navigate(entityLinkFor(detail)!)}>
                    <ExternalLink className="w-3.5 h-3.5 mr-1.5" />Open {detail.module_label || "Module"}
                  </Button>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Row({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex justify-between items-start gap-3">
      <div className="text-[10px] uppercase text-muted-foreground tracking-wider w-[110px] flex-shrink-0 pt-0.5">{label}</div>
      <div className="text-right flex-1 break-words">{value}</div>
    </div>
  );
}
