// Quick lead notes section shown near the top of the Lead Drawer.
// Allows a sales executive to capture call discussion / objections / promises
// against a CRM lead. Notes are stored in public.lead_notes and are immutable
// history (no deletes; only the author can edit their own).

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { StickyNote, Loader2, ChevronDown, ChevronUp } from "lucide-react";

interface Props {
  leadId: string;
  paidPipelineLeadId?: string | null;
}

interface NoteRow {
  id: string;
  note_text: string;
  note_type: string;
  created_by: string | null;
  created_at: string;
  author_name?: string | null;
}

function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function LeadNotesSection({ leadId, paidPipelineLeadId }: Props) {
  const { profile } = useAuth();
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("lead_notes")
        .select("id, note_text, note_type, created_by, created_at")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data || []) as NoteRow[];
      const authorIds = Array.from(new Set(rows.map(r => r.created_by).filter(Boolean) as string[]));
      let nameMap: Record<string, string> = {};
      if (authorIds.length) {
        const { data: profs } = await (supabase as any)
          .from("profiles").select("id, full_name").in("id", authorIds);
        nameMap = Object.fromEntries((profs || []).map((p: any) => [p.id, p.full_name]));
      }
      setNotes(rows.map(r => ({ ...r, author_name: r.created_by ? nameMap[r.created_by] || null : null })));
    } catch (e: any) {
      console.error("[LeadNotesSection] load failed", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [leadId]);

  const addNote = async () => {
    const t = text.trim();
    if (!t) return;
    if (!profile?.id) { toast.error("You must be signed in to add notes."); return; }
    setSaving(true);
    try {
      const { error } = await (supabase as any).from("lead_notes").insert({
        lead_id: leadId,
        paid_pipeline_lead_id: paidPipelineLeadId || null,
        note_text: t,
        note_type: "general",
        created_by: profile.id,
      });
      if (error) throw error;
      setText("");
      toast.success("Note added");
      await load();
    } catch (e: any) {
      toast.error(e.message || "Failed to add note");
    } finally {
      setSaving(false);
    }
  };

  const visible = showAll ? notes : notes.slice(0, 3);

  return (
    <div className="rounded-xl border border-line bg-white p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-foreground/80">
          <StickyNote className="w-3.5 h-3.5" /> Lead Notes
          {notes.length > 0 && <span className="text-[10px] font-normal text-muted-foreground">({notes.length})</span>}
        </div>
      </div>

      <div className="space-y-1.5">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add call discussion, objection, promise, next context…"
          rows={2}
          className="w-full text-[12.5px] rounded-md border border-line bg-white px-2.5 py-1.5 resize-y min-h-[52px] focus:outline-none focus:ring-1 focus:ring-black/20"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); addNote(); }
          }}
        />
        <div className="flex items-center justify-between">
          <div className="text-[10px] text-muted-foreground">⌘/Ctrl + Enter to save</div>
          <button
            onClick={addNote}
            disabled={saving || !text.trim()}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] bg-black text-white disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
            Add Note
          </button>
        </div>
      </div>

      {loading && notes.length === 0 && (
        <div className="mt-2 text-[11px] text-muted-foreground">Loading notes…</div>
      )}

      {notes.length > 0 && (
        <div className="mt-2.5 space-y-1.5">
          {visible.map((n) => (
            <div key={n.id} className="rounded-md border border-line bg-off/60 px-2.5 py-1.5">
              <div className="text-[12.5px] whitespace-pre-wrap leading-snug">{n.note_text}</div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                {n.author_name || "Unknown"} · {timeAgo(n.created_at)}
              </div>
            </div>
          ))}
          {notes.length > 3 && (
            <button
              onClick={() => setShowAll(s => !s)}
              className="text-[11px] text-foreground/80 hover:text-foreground inline-flex items-center gap-1"
            >
              {showAll ? <><ChevronUp className="w-3 h-3" /> Show less</> : <><ChevronDown className="w-3 h-3" /> View all {notes.length} notes</>}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
