import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { IpcCombobox, IpcComboboxOption } from "@/components/ui/ipc-combobox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MoreVertical } from "lucide-react";

export interface TagRow { id: string; name: string; color: string | null; is_active: boolean; is_deleted?: boolean }

interface Props {
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
}

const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ");

export default function TagCombobox({ value, onChange, placeholder = "— No tag —" }: Props) {
  const { profile, isAdmin } = useAuth();
  const [tags, setTags] = useState<TagRow[]>([]);
  const [showArchived, setShowArchived] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("tags")
      .select("id,name,color,is_active,is_deleted")
      .eq("is_deleted", false)
      .eq("module_scope", "all")
      .order("name");
    setTags((data || []) as TagRow[]);
  };
  useEffect(() => { load(); }, []);

  const visible = tags.filter((t) => (showArchived ? true : t.is_active));

  const handleCreate = async (typed: string) => {
    if (!typed) return;
    const exists = tags.find((t) => norm(t.name) === norm(typed));
    if (exists) { onChange(exists.id); return; }
    const { data, error } = await supabase
      .from("tags")
      .insert({ name: typed, color: "#16A34A", module_scope: "all", created_by: profile?.id || null } as any)
      .select("id,name,color,is_active,is_deleted")
      .maybeSingle();
    if (error) { toast.error(`Could not create tag: ${error.message}`); return; }
    if (data) {
      setTags((p) => [...p, data as TagRow]);
      onChange((data as any).id);
      toast.success(`Tag "${typed}" created`);
      try {
        await (supabase as any).from("code_of_conduct_events").insert({
          event_type: "coc_tag_created_from_rule",
          metadata: { tag_id: (data as any).id, name: typed, performed_by: profile?.id || null },
        });
      } catch { /* ignore */ }
    }
  };

  const rename = async (tag: TagRow) => {
    const next = prompt("Rename tag", tag.name);
    if (!next || norm(next) === norm(tag.name)) return;
    const { error } = await supabase.from("tags").update({ name: next.trim() } as any).eq("id", tag.id);
    if (error) { toast.error(error.message); return; }
    setTags((p) => p.map((t) => (t.id === tag.id ? { ...t, name: next.trim() } : t)));
    toast.success("Tag renamed");
    try { await (supabase as any).from("code_of_conduct_events").insert({ event_type: "coc_tag_updated_from_rule", metadata: { tag_id: tag.id, name: next.trim() } }); } catch { /* ignore */ }
  };

  const archive = async (tag: TagRow) => {
    const { count } = await supabase.from("lead_tag_assignments").select("id", { count: "exact", head: true }).eq("tag_id", tag.id);
    const used = (count ?? 0) > 0;
    if (!used) {
      if (!confirm(`Delete tag "${tag.name}"? It is unused.`)) return;
      const { error } = await supabase.from("tags").update({ is_deleted: true, is_active: false } as any).eq("id", tag.id);
      if (error) { toast.error(error.message); return; }
      setTags((p) => p.filter((t) => t.id !== tag.id));
      if (value === tag.id) onChange(null);
      toast.success("Tag deleted");
    } else {
      if (!confirm(`Archive tag "${tag.name}"? It is used on ${count} lead${count === 1 ? "" : "s"}.`)) return;
      const { error } = await supabase.from("tags").update({ is_active: false } as any).eq("id", tag.id);
      if (error) { toast.error(error.message); return; }
      setTags((p) => p.map((t) => (t.id === tag.id ? { ...t, is_active: false } : t)));
      toast.success("Tag archived");
    }
    try { await (supabase as any).from("code_of_conduct_events").insert({ event_type: "coc_tag_archived_from_rule", metadata: { tag_id: tag.id, name: tag.name } }); } catch { /* ignore */ }
  };

  const restore = async (tag: TagRow) => {
    const { error } = await supabase.from("tags").update({ is_active: true } as any).eq("id", tag.id);
    if (error) { toast.error(error.message); return; }
    setTags((p) => p.map((t) => (t.id === tag.id ? { ...t, is_active: true } : t)));
    toast.success("Tag restored");
  };

  const options: IpcComboboxOption[] = visible.map((t) => ({
    value: t.id,
    label: t.name,
    description: t.is_active ? undefined : "Archived",
    rightSlot: isAdmin ? (
      <Popover>
        <PopoverTrigger asChild>
          <button className="p-1 rounded hover:bg-slate-100" aria-label="Tag actions">
            <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="p-1 w-40 bg-white border-line">
          <button onClick={() => rename(t)} className="block w-full text-left text-[12px] px-2 py-1.5 hover:bg-slate-50 rounded">Rename</button>
          {t.is_active ? (
            <button onClick={() => archive(t)} className="block w-full text-left text-[12px] px-2 py-1.5 hover:bg-slate-50 rounded text-rose-600">Archive / delete</button>
          ) : (
            <button onClick={() => restore(t)} className="block w-full text-left text-[12px] px-2 py-1.5 hover:bg-slate-50 rounded text-emerald-700">Restore</button>
          )}
        </PopoverContent>
      </Popover>
    ) : null,
  }));

  return (
    <IpcCombobox
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      emptyText="No tags found"
      allowClear
      onCreate={isAdmin ? handleCreate : undefined}
      createLabel={(v) => `Create "${v}"`}
      headerSlot={
        <div className="px-3 py-1.5 border-b border-line flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{visible.length} tag{visible.length === 1 ? "" : "s"}</span>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="h-3 w-3" />
            Show archived
          </label>
        </div>
      }
    />
  );
}
