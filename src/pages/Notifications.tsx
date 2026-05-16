import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { PageHead, Tag } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { RefreshCw, ExternalLink, Bell } from "lucide-react";
import { toast } from "sonner";
import { NOTIFICATION_MODULE_LABELS, markNotificationsRead, markAllRead, generateNotifications } from "@/lib/notifications";

type Row = {
  id: string;
  recipient_user_id: string | null;
  module_key: string | null;
  notification_type: string | null;
  title: string;
  message: string | null;
  entity_type: string | null;
  entity_id: string | null;
  entity_label: string | null;
  priority: string;
  status: string;
  action_url: string | null;
  action_label: string | null;
  metadata: any;
  triggered_by_name: string | null;
  source: string;
  created_at: string;
  read_at: string | null;
  dismissed_at: string | null;
};

const PRIORITY_TAG: Record<string, "info" | "update" | "urgent"> = {
  urgent: "urgent",
  high: "urgent",
  normal: "update",
  low: "info",
};

const QUICK_FILTERS = [
  { key: "unread", label: "Unread" },
  { key: "urgent", label: "Urgent" },
  { key: "today", label: "Today" },
  { key: "overdue", label: "Overdue" },
  { key: "payment_recovery", label: "Payment Recovery" },
  { key: "finance", label: "Finance / EMI" },
  { key: "follow_up_command_center", label: "Follow-Ups" },
  { key: "calling_crm", label: "CRM" },
  { key: "audit_log", label: "System Alerts" },
  { key: "access", label: "Access Changes" },
];

function fmtDateTime(d: string) {
  return new Date(d).toLocaleString("en-IN", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export default function Notifications() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("all");
  const [priority, setPriority] = useState("all");
  const [moduleKey, setModuleKey] = useState("all");
  const [type, setType] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [quick, setQuick] = useState<string | null>("unread");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<Row | null>(null);

  async function load() {
    setLoading(true);
    try {
      let q: any = (supabase as any)
        .from("notifications")
        .select("*")
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(500);
      const { data, error } = await q;
      if (error) throw error;
      setRows((data as Row[]) || []);
    } catch (e) {
      console.warn("[notifications] load failed", e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let list = rows;
    if (status !== "all") list = list.filter(r => r.status === status);
    if (priority !== "all") list = list.filter(r => r.priority === priority);
    if (moduleKey !== "all") list = list.filter(r => r.module_key === moduleKey);
    if (type !== "all") list = list.filter(r => r.notification_type === type);
    if (from) list = list.filter(r => new Date(r.created_at) >= new Date(from));
    if (to) list = list.filter(r => new Date(r.created_at) <= new Date(to));
    if (search.trim()) {
      const t = search.toLowerCase();
      list = list.filter(r =>
        r.title.toLowerCase().includes(t) ||
        (r.message ?? "").toLowerCase().includes(t) ||
        (r.entity_label ?? "").toLowerCase().includes(t)
      );
    }
    if (quick) {
      const today = new Date(); today.setHours(0,0,0,0);
      switch (quick) {
        case "unread": list = list.filter(r => r.status === "unread"); break;
        case "urgent": list = list.filter(r => r.priority === "urgent" || r.priority === "high"); break;
        case "today": list = list.filter(r => new Date(r.created_at) >= today); break;
        case "overdue": list = list.filter(r => /overdue|missed/i.test(r.notification_type ?? "")); break;
        case "access": list = list.filter(r => /access/i.test(r.notification_type ?? "")); break;
        case "finance": list = list.filter(r => /finance/i.test(r.notification_type ?? "") || /finance/i.test(r.module_key ?? "")); break;
        default:
          list = list.filter(r => r.module_key === quick);
      }
    }
    return list;
  }, [rows, status, priority, moduleKey, type, from, to, search, quick]);

  const counts = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0);
    return {
      unread: rows.filter(r => r.status === "unread").length,
      urgent: rows.filter(r => r.priority === "urgent" && r.status === "unread").length,
      today: rows.filter(r => new Date(r.created_at) >= today).length,
      overdue: rows.filter(r => /overdue|missed/i.test(r.notification_type ?? "")).length,
      recovery: rows.filter(r => r.module_key === "payment_recovery").length,
      finance: rows.filter(r => /finance/i.test(r.notification_type ?? "")).length,
      crm: rows.filter(r => r.module_key === "calling_crm" || r.module_key === "follow_up_command_center").length,
      system: rows.filter(r => r.module_key === "audit_log").length,
    };
  }, [rows]);

  const typeOptions = useMemo(() => Array.from(new Set(rows.map(r => r.notification_type).filter(Boolean))) as string[], [rows]);
  const moduleOptions = useMemo(() => Array.from(new Set(rows.map(r => r.module_key).filter(Boolean))) as string[], [rows]);

  function toggle(id: string) {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function bulkMarkRead() {
    if (!selected.size) return;
    await markNotificationsRead(Array.from(selected));
    setSelected(new Set());
    toast.success("Marked as read");
    load();
  }

  async function bulkDismiss() {
    if (!selected.size) return;
    await (supabase as any).from("notifications")
      .update({ status: "dismissed", dismissed_at: new Date().toISOString() })
      .in("id", Array.from(selected));
    setSelected(new Set());
    toast.success("Dismissed");
    load();
  }

  async function bulkDelete() {
    if (!isAdmin || !selected.size) return;
    await (supabase as any).from("notifications")
      .update({ is_deleted: true })
      .in("id", Array.from(selected));
    setSelected(new Set());
    toast.success("Deleted");
    load();
  }

  async function setRow(row: Row, patch: Partial<Row>) {
    await (supabase as any).from("notifications").update(patch).eq("id", row.id);
    load();
  }

  async function markAll() {
    if (!user) return;
    await markAllRead(user.id);
    toast.success("All marked as read");
    load();
  }

  return (
    <div>
      <PageHead
        title="Notifications"
        sub="Track important alerts, pending actions, overdue follow-ups, recovery risks, finance delays, and system changes."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
        {[
          { label: "Unread", v: counts.unread },
          { label: "Urgent", v: counts.urgent },
          { label: "Due Today", v: counts.today },
          { label: "Overdue", v: counts.overdue },
          { label: "Payment Recovery", v: counts.recovery },
          { label: "Finance / EMI", v: counts.finance },
          { label: "CRM / Follow-Ups", v: counts.crm },
          { label: "System / Access", v: counts.system },
        ].map(c => (
          <Card key={c.label} className="p-3">
            <div className="font-sans text-[10px] uppercase tracking-wider text-muted-foreground">{c.label}</div>
            <div className="font-serif text-2xl mt-1">{c.v}</div>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {QUICK_FILTERS.map(q => (
          <button
            key={q.key}
            onClick={() => setQuick(quick === q.key ? null : q.key)}
            className={`px-3 py-1 rounded-md border text-xs ${quick === q.key ? "bg-black text-white border-black" : "bg-white border-line text-muted-foreground hover:text-black"}`}
          >
            {q.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-2 mb-4">
        <div>
          <div className="text-[10px] text-muted-foreground mb-1">Status</div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="unread">Unread</SelectItem>
              <SelectItem value="read">Read</SelectItem>
              <SelectItem value="dismissed">Dismissed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground mb-1">Priority</div>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground mb-1">Module</div>
          <Select value={moduleKey} onValueChange={setModuleKey}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {moduleOptions.map(m => (
                <SelectItem key={m} value={m}>{NOTIFICATION_MODULE_LABELS[m] ?? m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground mb-1">Type</div>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {typeOptions.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground mb-1">From</div>
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-36" />
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground mb-1">To</div>
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-36" />
        </div>
        <div className="flex-1 min-w-[180px]">
          <div className="text-[10px] text-muted-foreground mb-1">Search</div>
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search title, message..." />
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
        <Button variant="outline" onClick={markAll}>Mark all read</Button>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-off border border-line rounded-md">
          <div className="text-xs text-muted-foreground">{selected.size} selected</div>
          <Button size="sm" variant="outline" onClick={bulkMarkRead}>Mark read</Button>
          <Button size="sm" variant="outline" onClick={bulkDismiss}>Dismiss</Button>
          {isAdmin && <Button size="sm" variant="outline" onClick={bulkDelete}>Delete</Button>}
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-off border-b border-line">
              <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="p-3 w-10"></th>
                <th className="p-3 w-24">Priority</th>
                <th className="p-3">Title / Message</th>
                <th className="p-3 w-32">Module</th>
                <th className="p-3 w-40">Related</th>
                <th className="p-3 w-32">Created</th>
                <th className="p-3 w-24">Status</th>
                <th className="p-3 w-32"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="p-8 text-center text-muted-foreground text-sm">No notifications.</td></tr>
              ) : filtered.map(r => (
                <tr key={r.id} className={`border-b border-line hover:bg-off/50 ${r.status === "unread" ? "font-medium" : ""}`}>
                  <td className="p-3"><Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} /></td>
                  <td className="p-3"><Tag type={PRIORITY_TAG[r.priority] ?? "info"}>{r.priority}</Tag></td>
                  <td className="p-3 cursor-pointer" onClick={() => setDetail(r)}>
                    <div className="text-black">{r.title}</div>
                    {r.message && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{r.message}</div>}
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">{NOTIFICATION_MODULE_LABELS[r.module_key ?? ""] ?? r.module_key}</td>
                  <td className="p-3 text-xs text-muted-foreground">{r.entity_label ?? "—"}</td>
                  <td className="p-3 text-xs text-muted-foreground">{fmtDateTime(r.created_at)}</td>
                  <td className="p-3 text-xs">{r.status}</td>
                  <td className="p-3 text-right">
                    {r.action_url && (
                      <Button size="sm" variant="outline" onClick={async () => {
                        if (r.status === "unread") await setRow(r, { status: "read", read_at: new Date().toISOString() } as any);
                        navigate(r.action_url!);
                      }}>
                        <ExternalLink className="w-3 h-3 mr-1" />
                        {r.action_label ?? "Open"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Sheet open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto">
          {detail && (
            <>
              <SheetHeader>
                <SheetTitle className="font-serif text-xl">{detail.title}</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4 text-sm">
                <div className="flex items-center gap-2">
                  <Tag type={PRIORITY_TAG[detail.priority] ?? "info"}>{detail.priority}</Tag>
                  <Tag type="info">{detail.status}</Tag>
                  <span className="text-xs text-muted-foreground">{fmtDateTime(detail.created_at)}</span>
                </div>
                {detail.message && <div className="text-sm text-black">{detail.message}</div>}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div><div className="text-muted-foreground">Module</div><div>{NOTIFICATION_MODULE_LABELS[detail.module_key ?? ""] ?? detail.module_key ?? "—"}</div></div>
                  <div><div className="text-muted-foreground">Type</div><div>{detail.notification_type ?? "—"}</div></div>
                  <div><div className="text-muted-foreground">Related</div><div>{detail.entity_label ?? "—"}</div></div>
                  <div><div className="text-muted-foreground">Triggered by</div><div>{detail.triggered_by_name ?? "System"}</div></div>
                </div>
                {detail.metadata && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Metadata</div>
                    <pre className="bg-off p-3 rounded text-[11px] overflow-auto max-h-64">{JSON.stringify(detail.metadata, null, 2)}</pre>
                  </div>
                )}
                <div className="flex gap-2 pt-3 border-t border-line">
                  {detail.status === "unread" ? (
                    <Button variant="outline" onClick={async () => { await setRow(detail, { status: "read", read_at: new Date().toISOString() } as any); setDetail(null); }}>Mark read</Button>
                  ) : (
                    <Button variant="outline" onClick={async () => { await setRow(detail, { status: "unread", read_at: null } as any); setDetail(null); }}>Mark unread</Button>
                  )}
                  <Button variant="outline" onClick={async () => { await setRow(detail, { status: "dismissed", dismissed_at: new Date().toISOString() } as any); setDetail(null); }}>Dismiss</Button>
                  {detail.action_url && (
                    <Button onClick={() => { navigate(detail.action_url!); setDetail(null); }}>
                      {detail.action_label ?? "Open"}
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Card className="mt-6 p-4">
        <div className="font-serif text-base mb-2 flex items-center gap-2"><Bell className="w-4 h-4" />Notification preferences</div>
        <div className="text-xs text-muted-foreground">In-app notifications are enabled for this account.</div>
        <div className="text-xs text-muted-foreground mt-1">Email alerts: Coming later · WhatsApp alerts: Coming later</div>
      </Card>
    </div>
  );
}
