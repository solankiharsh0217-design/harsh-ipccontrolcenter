import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { PageHead, SectionLabel } from "@/components/ui-bits";
import { useAuth } from "@/context/AuthContext";
import {
  createServicePackage,
  deleteServicePackage,
  listServicePackages,
  updateServicePackage,
  type ServicePackage,
} from "@/lib/servicePackages";
import { listProcessTemplates, type ProcessTemplate } from "@/lib/operationsTemplates";

const inputCls =
  "h-8 w-full border border-line rounded-md px-2 text-[12.5px] focus:outline-none focus:border-gold font-sans bg-white";
const labelCls = "block text-[10px] uppercase tracking-[0.08em] text-muted-foreground mb-1 font-sans";

export default function ServicePackagesPage() {
  const { isAdmin, loading } = useAuth();
  const [items, setItems] = useState<ServicePackage[]>([]);
  const [templates, setTemplates] = useState<ProcessTemplate[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<ServicePackage | null>(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    try {
      const [pkgs, tmpls] = await Promise.all([listServicePackages(true), listProcessTemplates(false)]);
      setItems(pkgs);
      setTemplates(tmpls);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/admin-center" replace />;

  const visible = items.filter((i) => (showArchived ? true : i.is_active));
  const tmplName = (id: string | null) => templates.find((t) => t.id === id)?.name ?? null;

  return (
    <div className="max-w-[1060px]">
      <PageHead
        title="Service Packages / Tiers"
        sub="Define the service tiers (e.g. Normal vs Specialized) your team can attach to paid buyers during import. These travel from Calling CRM → Paid Pipeline → Operations."
      />
      <SectionLabel>Packages ({visible.length})</SectionLabel>
      <div className="flex items-center justify-between mb-3">
        <label className="flex items-center gap-2 text-[12px] text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived
        </label>
        <button onClick={() => setCreating(true)} className="h-9 px-4 bg-black text-white text-[12.5px] rounded-md">
          + New service package
        </button>
      </div>

      <div className="border border-line rounded-md bg-white divide-y divide-line">
        {visible.length === 0 && (
          <div className="p-4 text-[12.5px] text-muted-foreground">No service packages yet.</div>
        )}
        {visible.map((it) => (
          <div key={it.id} className="p-3 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="font-medium text-[13px] text-black truncate">{it.name}</div>
                {it.code && <span className="text-[10px] text-muted-foreground">· {it.code}</span>}
                {!it.is_active && (
                  <span className="text-[10px] uppercase bg-off px-1.5 py-0.5 rounded text-muted-foreground">
                    Archived
                  </span>
                )}
              </div>
              {it.description && (
                <div className="text-[11.5px] text-muted-foreground mt-0.5 truncate">{it.description}</div>
              )}
              <div className="text-[11px] text-muted-foreground mt-0.5">
                Default template: {tmplName(it.default_process_template_id) || "—"}
                {it.default_service_duration_days != null && <> · {it.default_service_duration_days} day default</>}
                {it.included_services && it.included_services.length > 0 && <> · {it.included_services.length} included service(s)</>}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditing(it)} className="h-8 px-3 border border-line text-[11.5px] rounded-md">
                Edit
              </button>
              {it.is_active ? (
                <button
                  onClick={async () => {
                    await updateServicePackage(it.id, { is_active: false });
                    toast.success("Archived");
                    load();
                  }}
                  className="h-8 px-3 border border-line text-[11.5px] rounded-md text-muted-foreground"
                >
                  Archive
                </button>
              ) : (
                <button
                  onClick={async () => {
                    await updateServicePackage(it.id, { is_active: true });
                    toast.success("Reactivated");
                    load();
                  }}
                  className="h-8 px-3 border border-line text-[11.5px] rounded-md"
                >
                  Reactivate
                </button>
              )}
              <button
                onClick={async () => {
                  if (!confirm(`Delete "${it.name}"? Historical snapshots on leads stay intact.`)) return;
                  try {
                    await deleteServicePackage(it.id);
                    toast.success("Deleted");
                    load();
                  } catch (e: any) {
                    toast.error(e.message);
                  }
                }}
                className="h-8 px-3 border border-red-200 text-red-600 text-[11.5px] rounded-md"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {(editing || creating) && (
        <EditModal
          item={editing}
          templates={templates}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSaved={() => {
            setEditing(null);
            setCreating(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function EditModal({
  item,
  templates,
  onClose,
  onSaved,
}: {
  item: ServicePackage | null;
  templates: ProcessTemplate[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(item?.name || "");
  const [code, setCode] = useState(item?.code || "");
  const [description, setDescription] = useState(item?.description || "");
  const [tmpl, setTmpl] = useState(item?.default_process_template_id || "");
  const [days, setDays] = useState<string>(item?.default_service_duration_days?.toString() || "");
  const [included, setIncluded] = useState((item?.included_services || []).join("\n"));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) {
      toast.error("Name required");
      return;
    }
    setBusy(true);
    try {
      const incArr = included
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      const payload: Partial<ServicePackage> = {
        name: name.trim(),
        code: code.trim() || null,
        description: description.trim() || null,
        default_process_template_id: tmpl || null,
        default_service_duration_days: days === "" ? null : Number(days),
        included_services: incArr.length ? incArr : null,
      };
      if (item) await updateServicePackage(item.id, payload);
      else await createServicePackage(payload);
      toast.success(item ? "Updated" : "Created");
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1200] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-[560px] max-h-[90vh] overflow-y-auto p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="font-serif text-[18px]">{item ? "Edit service package" : "New service package"}</div>
        <div>
          <label className={labelCls}>Name *</label>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Specialized Diamond Service" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>Code (optional)</label>
            <input className={inputCls} value={code} onChange={(e) => setCode(e.target.value)} placeholder="SPEC-DIA" />
          </div>
          <div>
            <label className={labelCls}>Default duration (days)</label>
            <input type="number" className={inputCls} value={days} onChange={(e) => setDays(e.target.value)} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Description</label>
          <textarea className={inputCls + " !h-auto py-2"} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Default Operations Process Template</label>
          <select className={inputCls} value={tmpl} onChange={(e) => setTmpl(e.target.value)}>
            <option value="">—</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Included services (one per line)</label>
          <textarea
            className={inputCls + " !h-auto py-2"}
            rows={4}
            value={included}
            onChange={(e) => setIncluded(e.target.value)}
            placeholder={"6 months ad support\nPortfolio review\nStrategy call"}
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="h-9 px-4 border border-line rounded-md text-[12.5px]">
            Cancel
          </button>
          <button onClick={save} disabled={busy} className="h-9 px-4 bg-black text-white rounded-md text-[12.5px] disabled:opacity-40">
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
