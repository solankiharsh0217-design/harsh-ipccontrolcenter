import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { logActivity } from "@/lib/auditLog";
import { getCanonicalMediaBuyers, refreshMediaBuyerCache, type MediaBuyerAlias } from "@/lib/mediaBuyers";
import { LoadingRow, EmptyRow } from "@/components/ui-bits";

const cardCls = "border border-line rounded-lg bg-white";
const inputCls = "w-full h-10 border border-line rounded-md px-3.5 font-sans text-[13px] focus:outline-none focus:border-gold bg-white";
const btnPrimary = "h-10 px-4 bg-black text-white font-sans text-[12.5px] rounded-md hover:opacity-90";
const btnGhost = "h-9 px-3 font-sans text-[12px] text-muted-foreground hover:text-black";

export default function MediaBuyerAliasManager() {
  const { user, isAdmin } = useAuth();
  const [rows, setRows] = useState<MediaBuyerAlias[]>([]);
  const [canonical, setCanonical] = useState<string[]>([]);
  const [aliasName, setAliasName] = useState("");
  const [canonicalName, setCanonicalName] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    const [{ data }, mb] = await Promise.all([
      (supabase as any)
        .from("media_buyer_aliases")
        .select("*")
        .eq("is_deleted", false)
        .order("created_at", { ascending: false }),
      getCanonicalMediaBuyers(),
    ]);
    setRows((data as MediaBuyerAlias[]) || []);
    setCanonical(mb);
    setLoading(false);
  };
  useEffect(() => { reload(); }, []);

  const addAlias = async () => {
    const a = aliasName.trim();
    const c = canonicalName.trim();
    if (!a || !c) { toast.error("Alias and Canonical name are required."); return; }
    if (a.toLowerCase() === c.toLowerCase()) { toast.error("Alias and canonical must differ."); return; }
    const { error } = await (supabase as any).from("media_buyer_aliases").insert({
      alias_name: a, canonical_name: c, reason: reason.trim() || null, created_by: user?.id ?? null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(`Alias added: ${a} → ${c}`);
    logActivity({
      module_key: "master_settings", module_label: "Master Settings",
      action_type: "media_buyer_alias_created", entity_type: "media_buyer_alias", entity_label: a,
      new_values: { alias_name: a, canonical_name: c, reason: reason || null },
      summary: `Media buyer alias created: ${a} → ${c}.`,
    });
    setAliasName(""); setCanonicalName(""); setReason("");
    await refreshMediaBuyerCache();
    reload();
  };

  const toggleActive = async (r: MediaBuyerAlias) => {
    const next = !r.is_active;
    const { error } = await (supabase as any).from("media_buyer_aliases").update({ is_active: next }).eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    logActivity({
      module_key: "master_settings", module_label: "Master Settings",
      action_type: "media_buyer_alias_updated", entity_type: "media_buyer_alias", entity_id: r.id, entity_label: r.alias_name,
      summary: `Media buyer alias ${r.alias_name} → ${r.canonical_name} ${next ? "activated" : "deactivated"}.`,
    });
    await refreshMediaBuyerCache();
    reload();
  };

  const remove = async (r: MediaBuyerAlias) => {
    if (!confirm(`Delete alias "${r.alias_name}" → "${r.canonical_name}"?`)) return;
    const { error } = await (supabase as any).from("media_buyer_aliases").update({ is_deleted: true, is_active: false }).eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    logActivity({
      module_key: "master_settings", module_label: "Master Settings",
      action_type: "media_buyer_alias_updated", entity_type: "media_buyer_alias", entity_id: r.id, entity_label: r.alias_name,
      summary: `Media buyer alias removed: ${r.alias_name} → ${r.canonical_name}.`,
      severity: "warning",
    });
    await refreshMediaBuyerCache();
    reload();
  };

  if (!isAdmin) {
    return <div className="font-sans text-[13px] text-muted-foreground">Admin access required.</div>;
  }

  return (
    <div className={cardCls + " p-6"}>
      <h2 className="font-serif text-[20px] text-black">Media Buyer Name Cleanup</h2>
      <p className="font-sans text-[12.5px] font-light text-muted-foreground mt-1">
        Map misspelled or alternate media buyer names to the canonical saved name.
        Once mapped, the alias is treated as the canonical name across attribution, daily reports, comparison, and filters.
      </p>

      <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-3 mt-5 items-end">
        <div>
          <label className="block font-sans text-[11px] uppercase tracking-[0.12em] text-muted-foreground mb-1.5">Wrong / Alias name</label>
          <input className={inputCls} placeholder="e.g. Hemant" value={aliasName} onChange={(e) => setAliasName(e.target.value)} />
        </div>
        <div>
          <label className="block font-sans text-[11px] uppercase tracking-[0.12em] text-muted-foreground mb-1.5">Canonical media buyer</label>
          <input
            className={inputCls}
            list="mb-canonical-list"
            placeholder="e.g. Hemanth"
            value={canonicalName}
            onChange={(e) => setCanonicalName(e.target.value)}
          />
          <datalist id="mb-canonical-list">
            {canonical.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>
        <div>
          <label className="block font-sans text-[11px] uppercase tracking-[0.12em] text-muted-foreground mb-1.5">Reason (optional)</label>
          <input className={inputCls} placeholder="Spelling correction…" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <button className={btnPrimary} onClick={addAlias}>+ Add alias</button>
      </div>

      <div className="mt-6 border border-line rounded-md overflow-hidden">
        <table className="w-full font-sans text-[12.5px]">
          <thead className="bg-off text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2">Alias / Wrong Name</th>
              <th className="text-left px-3 py-2">Canonical Name</th>
              <th className="text-left px-3 py-2">Reason</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-right px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <LoadingRow colSpan={5} />}
            {!loading && rows.length === 0 && (
              <EmptyRow colSpan={5} title="No aliases yet." />
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-line">
                <td className="px-3 py-2">{r.alias_name}</td>
                <td className="px-3 py-2 font-medium">{r.canonical_name}</td>
                <td className="px-3 py-2 text-muted-foreground">{r.reason || "—"}</td>
                <td className="px-3 py-2">
                  <span className={"px-2 py-0.5 rounded-full text-[11px] " + (r.is_active ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600")}>
                    {r.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  <button className={btnGhost} onClick={() => toggleActive(r)}>{r.is_active ? "Deactivate" : "Activate"}</button>
                  <button className={btnGhost + " text-red-600 hover:text-red-700"} onClick={() => remove(r)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
