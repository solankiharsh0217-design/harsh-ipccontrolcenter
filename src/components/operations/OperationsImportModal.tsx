import { useState } from "react";
import { X as XIcon, Upload, Link as LinkIcon, Plus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { parseCsvText, importRows, fetchSheetCsv, type ParsedRow, type ImportPreview } from "@/lib/operationsIntake";
import { listProcessTemplates, type ProcessTemplate } from "@/lib/operationsTemplates";
import { useEffect } from "react";

type Mode = "csv" | "sheet" | "manual";

export default function OperationsImportModal({
  onClose, onDone,
}: { onClose: () => void; onDone: () => void }) {
  const { profile } = useAuth();
  const [mode, setMode] = useState<Mode>("csv");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [templates, setTemplates] = useState<ProcessTemplate[]>([]);
  const [templateId, setTemplateId] = useState<string>("");
  const [sheetUrl, setSheetUrl] = useState("");
  const [fileName, setFileName] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState<ParsedRow>({
    name: "", email: null, phone: null, brand_name: null, product_name: null, batch_name: null, notes: null, raw: {},
  });

  useEffect(() => {
    listProcessTemplates(true).then(setTemplates).catch(() => {});
  }, []);

  const onFile = async (f: File) => {
    setFileName(f.name);
    const txt = await f.text();
    const p = parseCsvText(txt);
    setPreview(p);
  };

  const onSheet = async () => {
    if (!sheetUrl.trim()) { toast.error("Paste a Google Sheets link"); return; }
    setBusy(true);
    try {
      const csv = await fetchSheetCsv(sheetUrl.trim());
      const p = parseCsvText(csv);
      setPreview(p);
    } catch (e: any) {
      toast.error(e.message || "Failed to load sheet");
    } finally { setBusy(false); }
  };

  const confirmImport = async () => {
    if (mode === "manual") {
      if (!manual.name.trim()) { toast.error("Name is required"); return; }
      setBusy(true);
      try {
        const res = await importRows([manual], {
          source: "manual",
          templateId: templateId || null,
          createdBy: profile?.id ?? null,
        });
        toast.success(`Added ${res.imported} · Updated ${res.updated} · Skipped ${res.skipped}`);
        onDone();
      } catch (e: any) {
        toast.error(e.message || "Failed to add");
      } finally { setBusy(false); }
      return;
    }
    if (!preview || preview.rows.length === 0) { toast.error("Nothing to import"); return; }
    setBusy(true);
    try {
      const res = await importRows(preview.rows, {
        source: mode === "csv" ? "csv" : "sheet_link",
        fileName: fileName || undefined,
        sheetUrl: sheetUrl || undefined,
        templateId: templateId || null,
        createdBy: profile?.id ?? null,
      });
      toast.success(`Imported ${res.imported} · Updated ${res.updated} · Skipped ${res.skipped}`);
      if (res.errors.length) {
        console.warn("Import errors", res.errors);
        toast.warning(`${res.errors.length} row(s) had issues. Check console.`);
      }
      onDone();
    } catch (e: any) {
      toast.error(e.message || "Import failed");
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[1200] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl border border-line shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-line flex items-center justify-between">
          <div className="font-serif text-lg">Import to Intake</div>
          <button onClick={onClose} className="w-7 h-7 rounded hover:bg-off flex items-center justify-center"><XIcon className="w-4 h-4" /></button>
        </div>

        <div className="border-b border-line px-5 flex gap-1">
          {[
            { k: "csv" as Mode, label: "CSV upload", icon: Upload },
            { k: "sheet" as Mode, label: "Google Sheet link", icon: LinkIcon },
            { k: "manual" as Mode, label: "Manual add", icon: Plus },
          ].map(({ k, label, icon: Icon }) => (
            <button key={k} onClick={() => { setMode(k); setPreview(null); }}
              className={`px-3 py-2 text-xs flex items-center gap-1.5 ${mode === k ? "text-black border-b-2 border-gold -mb-px" : "text-muted-foreground hover:text-black"}`}>
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Apply process template (optional)</label>
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="ipc-input !h-9 !text-xs w-full max-w-sm">
              <option value="">— No template —</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          {mode === "csv" && (
            <div>
              <input type="file" accept=".csv,text/csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
                className="text-xs" />
              {fileName && <div className="text-[11px] text-muted-foreground mt-1">{fileName}</div>}
            </div>
          )}
          {mode === "sheet" && (
            <div className="flex gap-2">
              <input value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." className="ipc-input !h-9 !text-xs flex-1" />
              <button onClick={onSheet} disabled={busy} className="ipc-btn ipc-btn-ghost !h-9 !text-xs">Load</button>
            </div>
          )}
          {mode === "manual" && (
            <div className="grid grid-cols-2 gap-2">
              <Input label="Name *" v={manual.name} set={(x) => setManual({ ...manual, name: x })} />
              <Input label="Email" v={manual.email ?? ""} set={(x) => setManual({ ...manual, email: x || null })} />
              <Input label="Phone" v={manual.phone ?? ""} set={(x) => setManual({ ...manual, phone: x || null })} />
              <Input label="Brand / Business" v={manual.brand_name ?? ""} set={(x) => setManual({ ...manual, brand_name: x || null })} />
              <Input label="Product / Program" v={manual.product_name ?? ""} set={(x) => setManual({ ...manual, product_name: x || null })} />
              <Input label="Batch / Source" v={manual.batch_name ?? ""} set={(x) => setManual({ ...manual, batch_name: x || null })} />
              <div className="col-span-2">
                <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Notes</label>
                <textarea value={manual.notes ?? ""} onChange={(e) => setManual({ ...manual, notes: e.target.value || null })} className="ipc-input !text-xs w-full" rows={2} />
              </div>
            </div>
          )}

          {preview && (mode === "csv" || mode === "sheet") && (
            <div className="border border-line rounded-md">
              <div className="px-3 py-2 border-b border-line bg-off/40 flex items-center justify-between">
                <div className="text-xs"><span className="font-medium">{preview.rows.length}</span> valid rows · {preview.totalRows} total</div>
                <div className="text-[10px] text-muted-foreground">Detected: {Object.entries(preview.detectedColumns).filter(([, v]) => v).map(([k]) => k).join(", ") || "none"}</div>
              </div>
              {preview.warnings.length > 0 && (
                <div className="px-3 py-2 bg-[#FEF3C7] text-[#92400E] text-[11px] border-b border-line">
                  {preview.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
                </div>
              )}
              <div className="max-h-64 overflow-y-auto text-[11px]">
                <table className="w-full">
                  <thead className="bg-off sticky top-0">
                    <tr className="text-left">
                      <th className="px-2 py-1.5">Name</th><th className="px-2 py-1.5">Email</th><th className="px-2 py-1.5">Phone</th><th className="px-2 py-1.5">Brand</th><th className="px-2 py-1.5">Program</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(0, 50).map((r, i) => (
                      <tr key={i} className="border-t border-line">
                        <td className="px-2 py-1">{r.name}</td><td className="px-2 py-1">{r.email ?? "—"}</td><td className="px-2 py-1">{r.phone ?? "—"}</td><td className="px-2 py-1">{r.brand_name ?? "—"}</td><td className="px-2 py-1">{r.product_name ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.rows.length > 50 && <div className="px-3 py-2 text-muted-foreground">+{preview.rows.length - 50} more rows…</div>}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-line flex justify-end gap-2 bg-off/30">
          <button onClick={onClose} className="ipc-btn ipc-btn-ghost !text-xs">Cancel</button>
          <button onClick={confirmImport} disabled={busy || (mode !== "manual" && (!preview || preview.rows.length === 0))}
            className="ipc-btn ipc-btn-black !text-xs">
            {busy ? "Working…" : mode === "manual" ? "Add to Intake" : `Import ${preview?.rows.length ?? 0} rows`}
          </button>
        </div>
      </div>
    </div>
  );
}

function Input({ label, v, set }: { label: string; v: string; set: (s: string) => void }) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</label>
      <input value={v} onChange={(e) => set(e.target.value)} className="ipc-input !h-8 !text-xs w-full" />
    </div>
  );
}
