import { useEffect, useState } from "react";
import { PageHead, SectionLabel } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { loadInvoiceSettings, saveInvoiceSettings } from "@/lib/invoices/api";
import type { InvoiceSettings } from "@/lib/invoices/types";

export default function InvoiceSettingsPage() {
  const { user, isAdmin } = useAuth();
  const [s, setS] = useState<Partial<InvoiceSettings>>({
    workspace: "default",
    invoice_prefix: "INV-",
    next_invoice_number: 1,
    number_padding: 4,
    reset_yearly: false,
    gst_enabled_default: true,
    allow_invoice_level_gst_choice: true,
    default_invoice_type: "gst",
    default_gst_rate: 18,
    default_tax_mode: "exclusive",
    default_tax_split: "cgst_sgst",
    hsn_sac_required: true,
    require_authorized_signature: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const cur = await loadInvoiceSettings();
      if (cur) setS({ ...s, ...cur });
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k: keyof InvoiceSettings, v: any) => setS((p) => ({ ...p, [k]: v }));

  const previewNumber = () => {
    const padding = Math.max(1, Number(s.number_padding) || 4);
    const num = String(s.next_invoice_number || 1).padStart(padding, "0");
    let fy = "";
    if (s.fy_format) {
      const d = new Date();
      const mo = d.getMonth() + 1;
      const yr = d.getFullYear();
      const a = mo >= 4 ? yr : yr - 1;
      const b = mo >= 4 ? yr + 1 : yr;
      fy = `${String(a).slice(2)}-${String(b).slice(2)}/`;
    }
    return `${s.invoice_prefix || "INV-"}${fy}${num}`;
  };

  const onSave = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      await saveInvoiceSettings(s, user.id);
      toast.success("Invoice settings saved");
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally { setSaving(false); }
  };

  if (!isAdmin) return <div className="p-8 text-sm">Admin access required.</div>;
  if (loading) return <div className="p-8 text-sm">Loading…</div>;

  return (
    <div className="max-w-[900px]">
      <PageHead title="Invoice Settings" sub="Numbering, GST defaults and standard invoice text." />

      <div className="border border-line bg-white rounded-xl p-5 mb-5">
        <SectionLabel>Invoice Numbering</SectionLabel>
        <div className="grid grid-cols-2 gap-4 mt-3">
          <Field label="Invoice prefix"><Input value={s.invoice_prefix ?? ""} onChange={(e) => set("invoice_prefix", e.target.value)} /></Field>
          <Field label="Next number"><Input type="number" value={s.next_invoice_number ?? 1} onChange={(e) => set("next_invoice_number", Number(e.target.value))} /></Field>
          <Field label="Number padding"><Input type="number" value={s.number_padding ?? 4} onChange={(e) => set("number_padding", Number(e.target.value))} /></Field>
          <Field label="FY format (e.g. 25-26)"><Input value={s.fy_format ?? ""} onChange={(e) => set("fy_format", e.target.value)} placeholder="leave empty to disable" /></Field>
          <Field label="Reset yearly"><Toggle on={!!s.reset_yearly} onChange={(v) => set("reset_yearly", v)} /></Field>
          <div className="text-[12px] text-muted-foreground self-end">Preview: <span className="font-mono text-foreground">{previewNumber()}</span></div>
        </div>
      </div>

      <div className="border border-line bg-white rounded-xl p-5 mb-5">
        <SectionLabel>Tax Defaults</SectionLabel>
        <div className="grid grid-cols-2 gap-4 mt-3">
          <Field label="GST enabled by default"><Toggle on={!!s.gst_enabled_default} onChange={(v) => set("gst_enabled_default", v)} /></Field>
          <Field label="Allow invoice-level GST choice"><Toggle on={!!s.allow_invoice_level_gst_choice} onChange={(v) => set("allow_invoice_level_gst_choice", v)} /></Field>
          <Field label="Default invoice type">
            <select className="ipc-input" value={s.default_invoice_type ?? "gst"} onChange={(e) => set("default_invoice_type", e.target.value)}>
              <option value="gst">GST</option><option value="non_gst">Non-GST</option>
            </select>
          </Field>
          <Field label="Default GST rate (%)"><Input type="number" value={s.default_gst_rate ?? 18} onChange={(e) => set("default_gst_rate", Number(e.target.value))} /></Field>
          <Field label="Default tax mode">
            <select className="ipc-input" value={s.default_tax_mode ?? "exclusive"} onChange={(e) => set("default_tax_mode", e.target.value as any)}>
              <option value="exclusive">GST exclusive</option><option value="inclusive">GST inclusive</option>
            </select>
          </Field>
          <Field label="Default tax split">
            <select className="ipc-input" value={s.default_tax_split ?? "cgst_sgst"} onChange={(e) => set("default_tax_split", e.target.value as any)}>
              <option value="cgst_sgst">CGST + SGST</option><option value="igst">IGST</option><option value="none">No GST</option>
            </select>
          </Field>
          <Field label="Default place of supply"><Input value={s.default_place_of_supply ?? ""} onChange={(e) => set("default_place_of_supply", e.target.value)} /></Field>
          <Field label="HSN/SAC required"><Toggle on={!!s.hsn_sac_required} onChange={(v) => set("hsn_sac_required", v)} /></Field>
          <Field label="Default HSN/SAC"><Input value={s.default_hsn_sac ?? ""} onChange={(e) => set("default_hsn_sac", e.target.value)} /></Field>
          <Field label="Require authorized signature before issuing invoice"><Toggle on={!!s.require_authorized_signature} onChange={(v) => set("require_authorized_signature", v)} /></Field>
        </div>
      </div>

      <div className="border border-line bg-white rounded-xl p-5 mb-5">
        <SectionLabel>Default Invoice Text</SectionLabel>
        <div className="grid grid-cols-1 gap-4 mt-3">
          <Field label="Customer notes"><Textarea rows={3} value={s.default_notes ?? ""} onChange={(e) => set("default_notes", e.target.value)} /></Field>
          <Field label="Terms & Conditions"><Textarea rows={4} value={s.default_terms ?? ""} onChange={(e) => set("default_terms", e.target.value)} /></Field>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button onClick={onSave} disabled={saving}>{saving ? "Saving…" : "Save Invoice Settings"}</Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-[11.5px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className={`h-7 w-12 rounded-full transition-colors relative ${on ? "bg-emerald-500" : "bg-gray-300"}`}>
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}
