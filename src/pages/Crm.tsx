import { useEffect, useMemo, useState } from "react";
import { PageHead } from "@/components/ui-bits";
import { supabase } from "@/integrations/supabase/client";
import { GRADE_STYLES, STAGE_COLORS, STAGE_COLOR_OPTIONS, DEFAULT_PIPELINE_TEMPLATES, ensurePipelineExists, type Lead, type Pipeline, type Stage } from "@/lib/crmTypes";
import LeadDrawer from "@/components/LeadDrawer";
import { Plus, LayoutGrid, List, Settings2, Download, ArrowUp, ArrowDown, Trash2, Trophy, X as XIcon } from "lucide-react";
import { toast } from "sonner";

type View = "kanban" | "list" | "stages";

export default function Crm() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [agents, setAgents] = useState<{ id: string; full_name: string }[]>([]);
  const [activePipeline, setActivePipeline] = useState<string | null>(null);
  const [view, setView] = useState<View>("kanban");
  const [openLead, setOpenLead] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all"|"super-hot"|"hot"|"warm"|"cold">("all");
  const [newPipeline, setNewPipeline] = useState(false);
  const [newPipelineName, setNewPipelineName] = useState("");
  const [newPipelineType, setNewPipelineType] = useState<"unpaid"|"paid"|"custom">("custom");
  const [newPipelineSeed, setNewPipelineSeed] = useState(true);
  const [newStageName, setNewStageName] = useState("");
  const [newStageColor, setNewStageColor] = useState("gray");

  const load = async () => {
    const [{ data: p }, { data: s }, { data: l }, { data: ag }] = await Promise.all([
      supabase.from("pipelines").select("*").order("position"),
      supabase.from("stages").select("*").order("position"),
      supabase.from("leads").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name, role, status").eq("status","active"),
    ]);
    setPipelines((p || []) as any);
    setStages((s || []) as any);
    setLeads((l || []) as any);
    setAgents(((ag || []) as any).filter((a: any) => /BDE|Sales|Agent/i.test(a.role || "")));
    if (!activePipeline && p && p.length) setActivePipeline(p[0].id);
  };
  useEffect(() => { load(); }, []);

  const pipelineStages = useMemo(() => stages.filter((s) => s.pipeline_id === activePipeline).sort((a, b) => a.position - b.position), [stages, activePipeline]);
  const pipelineLeads = useMemo(() => {
    let list = leads.filter((l) => l.pipeline_id === activePipeline);
    if (filter !== "all") list = list.filter((l) => filter === "super-hot" ? l.is_super_hot : l.grade === filter);
    return list;
  }, [leads, activePipeline, filter]);

  const onDrop = async (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    await supabase.from("leads").update({ stage_id: stageId }).eq("id", id);
    setLeads((prev) => prev.map((l) => l.id === id ? { ...l, stage_id: stageId } : l));
  };

  const createPipeline = async () => {
    if (!newPipelineName.trim()) return;
    const { data, error } = await supabase.from("pipelines").insert({ name: newPipelineName.trim(), type: "custom", position: pipelines.length }).select().maybeSingle();
    if (error) { toast.error(error.message); return; }
    if (data) {
      await supabase.from("stages").insert([
        { pipeline_id: data.id, name: "New", color: "purple", position: 0 },
        { pipeline_id: data.id, name: "In Progress", color: "blue", position: 1 },
        { pipeline_id: data.id, name: "Closed Won", color: "green", position: 2, is_protected: true, is_won: true },
        { pipeline_id: data.id, name: "Closed Lost", color: "red", position: 3, is_protected: true, is_lost: true },
      ]);
      setNewPipeline(false); setNewPipelineName("");
      await load();
      setActivePipeline(data.id);
    }
  };

  const addStage = async () => {
    if (!newStageName.trim() || !activePipeline) return;
    await supabase.from("stages").insert({ pipeline_id: activePipeline, name: newStageName.trim(), color: "gray", position: pipelineStages.length });
    setNewStageName("");
    await load();
  };

  const deleteStage = async (s: Stage) => {
    if (s.is_protected) { toast.error("Protected stage"); return; }
    const count = leads.filter((l) => l.stage_id === s.id).length;
    if (count > 0) { toast.error(`${count} leads in this stage`); return; }
    await supabase.from("stages").delete().eq("id", s.id);
    await load();
  };

  const exportCsv = () => {
    const rows = [["Name","Email","Phone","Score","Grade","Stage","Webinar","Agent","Deal"]];
    for (const l of pipelineLeads) {
      const stg = stages.find((s) => s.id === l.stage_id)?.name || "";
      const ag = agents.find((a) => a.id === l.assigned_agent_id)?.full_name || "";
      rows.push([l.full_name||"", l.email||"", l.phone||"", String(l.score), l.grade, stg, l.webinar_source||"", ag, String(l.deal_value)]);
    }
    const csv = rows.map((r) => r.map((c) => `"${(c||"").replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `crm-leads-${Date.now()}.csv`; a.click();
  };

  return (
    <div>
      <PageHead title="Calling CRM" sub="Diamond Program sales pipeline" />

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <div className="flex items-center gap-1 p-1 rounded-lg border border-line bg-white">
          <button onClick={() => setView("kanban")} className={`px-3 py-1.5 rounded-md text-xs flex items-center gap-1.5 ${view === "kanban" ? "bg-black text-white" : "text-muted-foreground hover:text-black"}`}><LayoutGrid className="w-3.5 h-3.5" /> Kanban</button>
          <button onClick={() => setView("list")} className={`px-3 py-1.5 rounded-md text-xs flex items-center gap-1.5 ${view === "list" ? "bg-black text-white" : "text-muted-foreground hover:text-black"}`}><List className="w-3.5 h-3.5" /> List</button>
          <button onClick={() => setView("stages")} className={`px-3 py-1.5 rounded-md text-xs flex items-center gap-1.5 ${view === "stages" ? "bg-black text-white" : "text-muted-foreground hover:text-black"}`}><Settings2 className="w-3.5 h-3.5" /> Stages</button>
        </div>
        <div className="flex items-center gap-2">
          <select className="ipc-input !h-10 !text-xs" value={filter} onChange={(e) => setFilter(e.target.value as any)}>
            <option value="all">All grades</option>
            <option value="super-hot">★ Super Hot</option>
            <option value="hot">Hot</option>
            <option value="warm">Warm</option>
            <option value="cold">Cold</option>
          </select>
          <button onClick={exportCsv} className="ipc-btn ipc-btn-ghost !h-10"><Download className="w-3.5 h-3.5" /> Export</button>
        </div>
      </div>

      {/* Kanban */}
      {view === "kanban" && (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-3" style={{ minWidth: pipelineStages.length * 280 }}>
            {pipelineStages.map((s) => {
              const items = pipelineLeads.filter((l) => l.stage_id === s.id);
              const total = items.reduce((sum, l) => sum + Number(l.deal_value || 0), 0);
              const color = STAGE_COLORS[s.color] || "#888";
              return (
                <div key={s.id} className="w-[270px] flex-shrink-0 bg-off rounded-xl border border-line flex flex-col" onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop(e, s.id)}>
                  <div className="px-3 pt-3 pb-2 border-b-2" style={{ borderBottomColor: color }}>
                    <div className="flex items-center justify-between">
                      <div className="font-sans text-[11px] uppercase tracking-wider font-medium flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                        {s.name}
                      </div>
                      <div className="text-xs text-muted-foreground">{items.length}</div>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">₹{total.toLocaleString("en-IN")}</div>
                  </div>
                  <div className="p-2 space-y-2 flex-1 min-h-[120px]">
                    {items.map((l) => {
                      const g = GRADE_STYLES[l.grade];
                      const ag = agents.find((a) => a.id === l.assigned_agent_id);
                      const cardBg = l.is_super_hot ? "#FDF2F8" : l.lead_type === "paid" ? "#F0FDF4" : "white";
                      const cardBorder = l.is_super_hot ? "#FBCFE8" : l.lead_type === "paid" ? "#BBF7D0" : "#E8E5DE";
                      return (
                        <div key={l.id}
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData("text/plain", l.id)}
                          onClick={() => setOpenLead(l.id)}
                          className="p-3 rounded-lg border cursor-pointer hover:shadow-sm"
                          style={{ background: cardBg, borderColor: cardBorder }}>
                          {l.webinar_source && <div className="uppercase-label !text-[8px] mb-1">{l.webinar_source}</div>}
                          <div className="font-serif text-sm">{l.full_name || "Unnamed"}</div>
                          <div className="text-[11px] text-muted-foreground">{l.program_name}</div>
                          <div className="text-[11px] mt-0.5">{l.phone || "—"}</div>
                          <div className="text-[11px] mt-1">₹{Number(l.deal_value).toLocaleString("en-IN")}</div>
                          <div className="flex items-center justify-between mt-2 gap-2">
                            <span className="inline-flex px-1.5 py-0.5 rounded-full text-[9px] uppercase tracking-wider" style={{ background: g.bg, color: g.fg, border: `1px solid ${g.border}` }}>{g.label}</span>
                            {ag && <div className="w-5 h-5 rounded-full bg-black text-gold font-serif text-[9px] flex items-center justify-center" title={ag.full_name}>{ag.full_name.slice(0,1)}</div>}
                          </div>
                        </div>
                      );
                    })}
                    {items.length === 0 && <div className="text-[10px] text-muted-foreground text-center py-4">Drop leads here</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* List view */}
      {view === "list" && (
        <div className="rounded-xl border border-line overflow-hidden">
          <table className="w-full font-sans text-sm">
            <thead className="bg-off">
              <tr className="text-left">
                {["Lead","Phone","Score","Grade","Stage","Webinar","Agent","Deal"].map((h) => <th key={h} className="px-4 py-2.5 uppercase-label !text-[10px]">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {pipelineLeads.length === 0 && <tr><td colSpan={8} className="p-10 text-center text-muted-foreground">No leads.</td></tr>}
              {pipelineLeads.map((l) => {
                const g = GRADE_STYLES[l.grade];
                const stg = pipelineStages.find((s) => s.id === l.stage_id);
                const ag = agents.find((a) => a.id === l.assigned_agent_id);
                return (
                  <tr key={l.id} className="border-t border-line cursor-pointer hover:bg-off" onClick={() => setOpenLead(l.id)}>
                    <td className="px-4 py-3">
                      <div className="font-serif text-sm">{l.full_name || "—"}</div>
                      <div className="text-xs text-muted-foreground">{l.email}</div>
                    </td>
                    <td className="px-4 py-3 text-xs">{l.phone || "—"}</td>
                    <td className="px-4 py-3 text-xs">{l.score}</td>
                    <td className="px-4 py-3"><span className="inline-flex px-2 py-0.5 rounded-full text-[10px] uppercase" style={{ background: g.bg, color: g.fg, border: `1px solid ${g.border}` }}>{g.label}</span></td>
                    <td className="px-4 py-3 text-xs">{stg?.name || "—"}</td>
                    <td className="px-4 py-3 text-xs">{l.webinar_source || "—"}</td>
                    <td className="px-4 py-3 text-xs">{ag?.full_name || "—"}</td>
                    <td className="px-4 py-3 text-xs">₹{Number(l.deal_value).toLocaleString("en-IN")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Stage manager */}
      {view === "stages" && (
        <div className="max-w-2xl space-y-2">
          {pipelineStages.map((s) => {
            const count = leads.filter((l) => l.stage_id === s.id).length;
            const color = STAGE_COLORS[s.color] || "#888";
            return (
              <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg border border-line bg-white">
                <span className="text-muted-foreground">⠿</span>
                <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                <span className="font-sans text-sm flex-1">{s.name}</span>
                <span className="text-xs text-muted-foreground">{count} leads</span>
                {s.is_protected ? <span className="text-[10px] uppercase text-muted-foreground">Protected</span> :
                  <button onClick={() => deleteStage(s)} className="text-muted-foreground hover:text-[#DC2626] text-xs">✕</button>}
              </div>
            );
          })}
          <div className="flex gap-2 pt-2">
            <input type="text" className="ipc-input flex-1" placeholder="New stage name…" value={newStageName} onChange={(e) => setNewStageName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addStage()} />
            <button onClick={addStage} className="ipc-btn ipc-btn-black"><Plus className="w-3.5 h-3.5" /> Add stage</button>
          </div>
        </div>
      )}

      {/* Pipeline tabs (bottom bar) */}
      <div className="fixed bottom-0 left-[228px] right-0 bg-white border-t border-line px-10 py-2.5 flex items-center gap-2 z-40">
        {pipelines.map((p) => {
          const isActive = p.id === activePipeline;
          const dot = p.type === "paid" ? "#16A34A" : p.type === "unpaid" ? "#2563EB" : "#C8A84B";
          return (
            <button key={p.id} onClick={() => setActivePipeline(p.id)} className={`px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 border ${isActive ? "bg-black text-white border-black" : "bg-white border-line hover:bg-off"}`}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: dot }} />
              {p.name}
              <span className={`text-[10px] ${isActive ? "text-white/70" : "text-muted-foreground"}`}>{leads.filter((l) => l.pipeline_id === p.id).length}</span>
            </button>
          );
        })}
        <button onClick={() => setNewPipeline(true)} className="px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 border border-dashed border-line text-muted-foreground hover:text-black">
          <Plus className="w-3.5 h-3.5" /> New Pipeline
        </button>
      </div>

      {/* New pipeline modal */}
      {newPipeline && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6" onClick={() => setNewPipeline(false)}>
          <div className="bg-white rounded-xl border border-line w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="font-serif text-xl mb-4">New pipeline</div>
            <input type="text" className="ipc-input mb-4" placeholder="Pipeline name…" value={newPipelineName} onChange={(e) => setNewPipelineName(e.target.value)} autoFocus />
            <div className="flex justify-end gap-2">
              <button onClick={() => setNewPipeline(false)} className="ipc-btn ipc-btn-ghost">Cancel</button>
              <button onClick={createPipeline} className="ipc-btn ipc-btn-black">Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Spacer for fixed bottom bar */}
      <div className="h-14" />

      {openLead && <LeadDrawer leadId={openLead} stages={stages} agents={agents} onClose={() => setOpenLead(null)} onChanged={load} />}
    </div>
  );
}
