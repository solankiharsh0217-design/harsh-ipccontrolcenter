import { useEffect, useMemo, useState } from "react";
import { X, Loader2, Download, UserMinus, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { bulkDeassignLeads } from "@/lib/crmRepair";
import { downloadCsv } from "@/lib/crmRepair";
import { EmptyState } from "@/components/ui-bits";

type Lead = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  webinar_source: string | null;
  webinar_date: string | null;
  grade: string | null;
  pipeline_id: string | null;
  stage_id: string | null;
  paid_pipeline_lead_id: string | null;
  updated_at: string | null;
  created_at: string | null;
};

type Pipeline = { id: string; name: string };
type Stage = { id: string; name: string; pipeline_id: string };

export default function MemberAssignedLeadsModal({
  memberId, memberName, onClose, onChanged,
}: {
  memberId: string;
  memberName: string;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filterPipeline, setFilterPipeline] = useState<string>("all");
  const [filterBatch, setFilterBatch] = useState<string>("all");
  const [filterGrade, setFilterGrade] = useState<string>("all");
  const [filterPaid, setFilterPaid] = useState<"all" | "paid" | "unpaid">("all");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [lRes, pRes, sRes] = await Promise.all([
        (supabase as any).from("leads")
          .select("id, full_name, email, phone, webinar_source, webinar_date, grade, pipeline_id, stage_id, paid_pipeline_lead_id, updated_at, created_at")
          .eq("assigned_agent_id", memberId)
          .is("archived_at", null)
          .order("updated_at", { ascending: false })
          .limit(2000),
        supabase.from("pipelines").select("id, name"),
        supabase.from("stages").select("id, name, pipeline_id"),
      ]);
      setLeads((lRes.data || []) as Lead[]);
      setPipelines((pRes.data || []) as Pipeline[]);
      setStages((sRes.data || []) as Stage[]);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load assigned leads");
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [memberId]);

  const batches = useMemo(() => Array.from(new Set(leads.map((l) => l.webinar_source || "—"))).sort(), [leads]);

  const filtered = useMemo(() => {
    return leads.filter((l) => {
      if (filterPipeline !== "all" && l.pipeline_id !== filterPipeline) return false;
      if (filterBatch !== "all" && (l.webinar_source || "—") !== filterBatch) return false;
      if (filterGrade !== "all" && (l.grade || "").toLowerCase() !== filterGrade) return false;
      if (filterPaid === "paid" && !l.paid_pipeline_lead_id) return false;
      if (filterPaid === "unpaid" && l.paid_pipeline_lead_id) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const hay = [l.full_name, l.email, l.phone, l.webinar_source].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [leads, filterPipeline, filterBatch, filterGrade, filterPaid, search]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((l) => selected.has(l.id));
  const toggleAll = () => {
    setSelected((p) => {
      if (allFilteredSelected) { const n = new Set(p); filtered.forEach((l) => n.delete(l.id)); return n; }
      const n = new Set(p); filtered.forEach((l) => n.add(l.id)); return n;
    });
  };
  const toggle = (id: string) => setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const deassign = async (ids: string[]) => {
    if (!ids.length) { toast.info("Nothing selected"); return; }
    if (!confirm(`De-assign ${ids.length} lead${ids.length === 1 ? "" : "s"} from ${memberName}? They remain in CRM but disappear from ${memberName}'s workload.`)) return;
    setBusy(true);
    try {
      await bulkDeassignLeads(ids, { source: "team_member_manager", userAffectedId: memberId, userAffectedName: memberName });
      toast.success(`${ids.length} lead${ids.length === 1 ? "" : "s"} de-assigned from ${memberName}`);
      setSelected(new Set());
      onChanged?.();
      await load();
    } catch (e: any) { toast.error(e?.message || "De-assign failed"); }
    finally { setBusy(false); }
  };

  const exportCsv = () => {
    const stageMap = new Map(stages.map((s) => [s.id, s.name]));
    const pipeMap = new Map(pipelines.map((p) => [p.id, p.name]));
    const header = ["lead_id","name","email","phone","pipeline","stage","batch","webinar_date","grade","paid_link","last_activity"];
    const esc = (v: any) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const rows = filtered.map((l) => [
      l.id, l.full_name || "", l.email || "", l.phone || "",
      l.pipeline_id ? (pipeMap.get(l.pipeline_id) || "") : "",
      l.stage_id ? (stageMap.get(l.stage_id) || "") : "",
      l.webinar_source || "", l.webinar_date || "", l.grade || "",
      l.paid_pipeline_lead_id ? "yes" : "",
      l.updated_at || l.created_at || "",
    ].map(esc).join(","));
    downloadCsv(`assigned_leads_${memberName.replace(/[^\w.-]+/g, "_")}.csv`, [header.join(","), ...rows].join("\n"));
  };

  const counts = useMemo(() => ({
    total: leads.length,
    paid: leads.filter((l) => l.paid_pipeline_lead_id).length,
    batches: new Set(leads.map((l) => `${l.webinar_source || "—"}__${l.webinar_date || ""}`)).size,
  }), [leads]);

  return (
    <div className="fixed inset-0 z-[1300] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl border border-line shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col">
        <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-line">
          <div>
            <div className="font-serif text-lg text-black">Assigned CRM Leads — {memberName}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {counts.total} active · {counts.paid} paid-linked · {counts.batches} batch{counts.batches === 1 ? "" : "es"}
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-black"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-5 py-3 border-b border-line flex items-center gap-2 flex-wrap">
          <input
            value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name/email/phone/batch…"
            className="ipc-input !h-9 !text-xs flex-1 min-w-[180px] max-w-[280px]"
          />
          <select className="ipc-input !h-9 !text-xs" value={filterPipeline} onChange={(e) => setFilterPipeline(e.target.value)}>
            <option value="all">All pipelines</option>
            {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className="ipc-input !h-9 !text-xs" value={filterBatch} onChange={(e) => setFilterBatch(e.target.value)}>
            <option value="all">All batches</option>
            {batches.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <select className="ipc-input !h-9 !text-xs" value={filterGrade} onChange={(e) => setFilterGrade(e.target.value)}>
            <option value="all">All grades</option>
            <option value="super-hot">Super-hot</option>
            <option value="hot">Hot</option>
            <option value="warm">Warm</option>
            <option value="cold">Cold</option>
          </select>
          <select className="ipc-input !h-9 !text-xs" value={filterPaid} onChange={(e) => setFilterPaid(e.target.value as any)}>
            <option value="all">Paid + unpaid</option>
            <option value="paid">Paid-linked only</option>
            <option value="unpaid">Unpaid only</option>
          </select>
          <div className="ml-auto text-[11px] text-muted-foreground">{filtered.length} of {leads.length}</div>
        </div>

        {selected.size > 0 && (
          <div className="px-5 py-2 bg-[#FEF3C7] border-b border-[#FDE68A] flex items-center gap-2 text-xs">
            <span className="font-medium text-[#92400E]">{selected.size} selected</span>
            <div className="flex-1" />
            <button onClick={() => deassign(Array.from(selected))} disabled={busy} className="ipc-btn ipc-btn-black !h-8 !text-xs disabled:opacity-50">
              <UserMinus className="w-3 h-3" /> De-assign selected
            </button>
            <button onClick={() => setSelected(new Set())} className="ipc-btn ipc-btn-ghost !h-8 !text-xs">Clear</button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading assigned leads…
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState title="No assigned leads match filters." />
          ) : (
            <table className="w-full text-[12px]">
              <thead className="bg-off sticky top-0 z-[1]">
                <tr>
                  <th className="px-3 py-2 w-8"><input type="checkbox" checked={allFilteredSelected} onChange={toggleAll} /></th>
                  <th className="text-left px-3 py-2 font-medium">Name</th>
                  <th className="text-left px-3 py-2 font-medium">Contact</th>
                  <th className="text-left px-3 py-2 font-medium">Batch</th>
                  <th className="text-left px-3 py-2 font-medium">Grade</th>
                  <th className="text-left px-3 py-2 font-medium">Paid</th>
                  <th className="text-left px-3 py-2 font-medium w-12"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => (
                  <tr key={l.id} className="border-t border-line hover:bg-off/40">
                    <td className="px-3 py-2"><input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)} /></td>
                    <td className="px-3 py-2 text-foreground">{l.full_name || "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{l.email || l.phone || "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground truncate max-w-[180px]" title={l.webinar_source || ""}>{l.webinar_source || "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground capitalize">{l.grade || "—"}</td>
                    <td className="px-3 py-2">{l.paid_pipeline_lead_id ? <span className="text-emerald-700 text-[11px]">●</span> : <span className="text-muted-foreground text-[11px]">—</span>}</td>
                    <td className="px-3 py-2">
                      <a href={`/crm?lead=${l.id}`} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-black"><ExternalLink className="w-3 h-3" /></a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-5 py-3 border-t border-line flex items-center gap-2">
          <button onClick={exportCsv} disabled={loading || !filtered.length} className="ipc-btn ipc-btn-ghost !h-9 !text-xs disabled:opacity-50">
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
          <button
            onClick={() => deassign(filtered.map((l) => l.id))}
            disabled={busy || !filtered.length}
            className="ipc-btn ipc-btn-ghost !h-9 !text-xs !text-[#92400E] hover:!bg-[#FEF3C7] disabled:opacity-50"
          >
            De-assign all filtered ({filtered.length})
          </button>
          <div className="flex-1" />
          <button onClick={onClose} className="ipc-btn ipc-btn-black !h-9 !text-xs">Close</button>
        </div>
      </div>
    </div>
  );
}
