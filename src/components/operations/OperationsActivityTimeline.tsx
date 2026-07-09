import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  MessageSquare, ClipboardCopy, ArrowRight, Play, Pause, Square, CheckCircle2, RotateCcw,
  FileText, Sparkles, Activity, Mail, StickyNote,
} from "lucide-react";

type Category = "communication" | "stage" | "service" | "note" | "other";

interface TimelineItem {
  id: string;
  at: string; // ISO
  category: Category;
  title: string;
  actor: string | null;
  channel?: string | null;
  templateTitle?: string | null;
  subject?: string | null;
  preview?: string | null;
  fromStage?: string | null;
  toStage?: string | null;
  raw?: string; // fallback preview text
  eventType?: string;
}

const FILTER_LABELS: { key: "all" | Category; label: string }[] = [
  { key: "all", label: "All" },
  { key: "communication", label: "Communication" },
  { key: "stage", label: "Stage / Readiness" },
  { key: "service", label: "Service" },
  { key: "note", label: "Notes" },
];

function humanTitle(eventType: string): string {
  const map: Record<string, string> = {
    communication_logged: "Communication Logged",
    communication_copied: "Message Copied + Logged",
    communication_sent: "Communication Sent",
    communication_failed: "Communication Failed",
    readiness_manual_move: "Readiness Move",
    readiness_auto_move: "Auto Readiness Move",
    stage_changed: "Stage Changed",
    operations_stage_moved: "Stage Changed",
    start: "Ads Started",
    pause: "Service Paused",
    resume: "Service Resumed",
    stop: "Service Stopped",
    complete: "Service Completed",
    restart: "Service Restarted",
    lead_created: "Added to Operations",
    operations_lead_created: "Added to Operations",
    note_added: "Note Added",
    delivery_status_changed: "Delivery Status Changed",
    delivery_marked_delivered: "Delivery Completed",
    delivery_blocked: "Delivery Blocked",
    delivery_due_date_updated: "Delivery Due Date Updated",
    delivery_assignee_updated: "Delivery Owner Updated",
  return map[eventType] || eventType.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function categoryOf(eventType: string): Category {
  if (eventType.startsWith("communication_")) return "communication";
  if (eventType.includes("readiness") || eventType.includes("stage")) return "stage";
  if (["start", "pause", "resume", "stop", "complete", "restart"].includes(eventType)) return "service";
  if (eventType.includes("note")) return "note";
  return "other";
}

function IconFor({ item }: { item: TimelineItem }) {
  const c = "w-3.5 h-3.5";
  switch (item.eventType) {
    case "communication_logged": return <MessageSquare className={c} />;
    case "communication_copied": return <ClipboardCopy className={c} />;
    case "communication_sent": return <Mail className={c} />;
    case "readiness_manual_move":
    case "readiness_auto_move":
    case "stage_changed":
    case "operations_stage_moved":
      return <ArrowRight className={c} />;
    case "start": return <Play className={c} />;
    case "pause": return <Pause className={c} />;
    case "resume": return <Play className={c} />;
    case "stop": return <Square className={c} />;
    case "complete": return <CheckCircle2 className={c} />;
    case "restart": return <RotateCcw className={c} />;
    case "lead_created":
    case "operations_lead_created":
      return <Sparkles className={c} />;
    case "note_added": return <StickyNote className={c} />;
    default:
      return item.category === "communication"
        ? <MessageSquare className={c} />
        : item.category === "stage"
        ? <ArrowRight className={c} />
        : item.category === "service"
        ? <FileText className={c} />
        : <Activity className={c} />;
  }
}

function toneFor(cat: Category): string {
  switch (cat) {
    case "communication": return "bg-[#E0E7FF] text-[#3730A3]";
    case "stage": return "bg-[#DCFCE7] text-[#166534]";
    case "service": return "bg-[#FEF3C7] text-[#92400E]";
    case "note": return "bg-[#F3E8FF] text-[#6B21A8]";
    default: return "bg-[#F3F4F6] text-[#6B7280]";
  }
}

function truncate(s: string | null | undefined, n = 180): string | null {
  if (!s) return null;
  return s.length > n ? s.slice(0, n) + "…" : s;
}

export default function OperationsActivityTimeline({
  operationsLeadId,
  leadCreatedAt,
}: {
  operationsLeadId: string;
  leadCreatedAt?: string | null;
}) {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | Category>("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [eventsRes, auditRes] = await Promise.all([
        supabase
          .from("operations_service_events" as any)
          .select("*")
          .eq("operations_lead_id", operationsLeadId)
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("audit_logs")
          .select("id, action_type, action_label, actor_name, summary, new_values, old_values, metadata, created_at")
          .eq("entity_type", "operations_lead")
          .eq("entity_id", operationsLeadId)
          .eq("is_deleted", false)
          .order("created_at", { ascending: false })
          .limit(200),
      ]);

      if (cancelled) return;

      const eventRows = (eventsRes.data ?? []) as any[];
      const auditRows = (auditRes.data ?? []) as any[];

      // Enrich event creators
      const creatorIds = Array.from(new Set(eventRows.map((r) => r.created_by).filter(Boolean))) as string[];
      let creatorMap = new Map<string, string>();
      if (creatorIds.length) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", creatorIds);
        (profs ?? []).forEach((p: any) => creatorMap.set(p.id, p.full_name));
      }

      const merged: TimelineItem[] = [];

      // Service / communication events
      for (const r of eventRows) {
        const cat = categoryOf(r.event_type);
        merged.push({
          id: `ev-${r.id}`,
          at: r.created_at,
          category: cat,
          title: humanTitle(r.event_type),
          actor: (r.created_by && creatorMap.get(r.created_by)) || null,
          channel: r.channel ?? null,
          templateTitle: r.template_title ?? null,
          subject: r.subject_snapshot ?? null,
          preview: truncate(r.message_snapshot ?? r.note ?? r.reason ?? null),
          eventType: r.event_type,
        });
      }

      // Audit rows (admin-visible only in practice — RLS filters)
      const seenAuditKeys = new Set<string>();
      for (const a of auditRows) {
        const et: string = a.action_type || "audit";
        // Avoid duplicating communication events we already got from service_events
        if (et.startsWith("communication_")) continue;
        const key = `${et}|${a.created_at}`;
        if (seenAuditKeys.has(key)) continue;
        seenAuditKeys.add(key);

        const nv = (a.new_values || {}) as Record<string, any>;
        const cat = categoryOf(et);
        let fromStage: string | null = null;
        let toStage: string | null = null;
        if (et.includes("readiness") || et.includes("stage")) {
          fromStage = nv.from_stage_name || nv.from_stage || null;
          toStage = nv.to_stage_name || nv.to_stage || null;
        }
        merged.push({
          id: `au-${a.id}`,
          at: a.created_at,
          category: cat,
          title: a.action_label || humanTitle(et),
          actor: a.actor_name || null,
          fromStage,
          toStage,
          preview: truncate(a.summary || null),
          eventType: et,
        });
      }

      // Lead created marker
      if (leadCreatedAt) {
        merged.push({
          id: `created-${operationsLeadId}`,
          at: leadCreatedAt,
          category: "other",
          title: "Added to Operations",
          actor: null,
          eventType: "operations_lead_created",
        });
      }

      merged.sort((a, b) => (a.at < b.at ? 1 : -1));
      setItems(merged);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [operationsLeadId, leadCreatedAt]);

  const filtered = useMemo(
    () => filter === "all" ? items : items.filter((i) => i.category === filter),
    [items, filter],
  );

  return (
    <div>
      <div className="flex items-center gap-1.5 flex-wrap mb-2">
        {FILTER_LABELS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`text-[10px] px-2 py-0.5 rounded border ${
              filter === f.key
                ? "bg-black text-white border-black"
                : "bg-white text-muted-foreground border-line hover:bg-off"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-[11px] text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="border border-line rounded-md p-3 bg-off/40">
          <div className="text-xs text-foreground">No operations activity logged yet.</div>
          <div className="text-[10px] text-muted-foreground mt-1">
            Stage moves, communications, checklist actions, and service events will appear here.
          </div>
        </div>
      ) : (
        <ol className="relative border-l border-line/70 ml-2 space-y-3">
          {filtered.map((it) => (
            <li key={it.id} className="pl-3 relative">
              <span className={`absolute -left-[7px] top-1 w-3 h-3 rounded-full flex items-center justify-center ${toneFor(it.category)}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
              </span>
              <div className="border border-line rounded-md p-2.5 text-xs bg-white">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded ${toneFor(it.category)}`}>
                      <IconFor item={it} />
                    </span>
                    <span className="font-medium truncate">{it.title}</span>
                    {it.channel && (
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">· {it.channel}</span>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {new Date(it.at).toLocaleString()}
                  </span>
                </div>
                {(it.fromStage || it.toStage) && (
                  <div className="mt-1 text-[11px] text-foreground/80">
                    <span className="text-muted-foreground">Stage:</span>{" "}
                    {it.fromStage || "—"} <span className="text-muted-foreground">→</span> {it.toStage || "—"}
                  </div>
                )}
                {it.templateTitle && (
                  <div className="mt-1 text-[11px]">
                    <span className="text-muted-foreground">Template:</span> {it.templateTitle}
                  </div>
                )}
                {it.subject && (
                  <div className="mt-0.5 text-[11px]">
                    <span className="text-muted-foreground">Subject:</span> {it.subject}
                  </div>
                )}
                {it.preview && (
                  <div className="mt-1 text-[11px] whitespace-pre-wrap text-foreground/80 line-clamp-3">
                    {it.preview}
                  </div>
                )}
                <div className="mt-1 text-[10px] text-muted-foreground">
                  by {it.actor || "—"}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
