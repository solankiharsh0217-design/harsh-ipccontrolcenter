import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHead, SectionLabel } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { loadCompanySettings, saveCompanySettings } from "@/lib/invoices/api";
import type { CompanySettings } from "@/lib/invoices/types";

const FIELD_GROUPS: { title: string; fields: { key: keyof CompanySettings; label: string; multiline?: boolean }[] }[] = [
  { title: "Business Identity", fields: [
    { key: "legal_name", label: "Legal company name" },
    { key: "brand_name", label: "Brand name" },
    { key: "business_type", label: "Business type" },
    { key: "company_id", label: "Company ID / CIN" },
    { key: "gstin", label: "GSTIN" },
    { key: "pan", label: "PAN" },
    { key: "address", label: "Registered address", multiline: true },
    { key: "city", label: "City" },
    { key: "state", label: "State" },
    { key: "state_code", label: "State code" },
    { key: "country", label: "Country" },
    { key: "phone", label: "Phone" },
    { key: "email", label: "Email" },
    { key: "website", label: "Website" },
  ]},
  { title: "Bank Details", fields: [
    { key: "bank_account_name", label: "Account name" },
    { key: "bank_account_number", label: "Account number" },
    { key: "bank_ifsc", label: "IFSC code" },
    { key: "bank_account_type", label: "Account type" },
    { key: "bank_name", label: "Bank name" },
    { key: "bank_branch", label: "Branch" },
    { key: "upi_id", label: "UPI ID (optional)" },
  ]},
  { title: "Email Sender", fields: [
    { key: "sender_name", label: "Sender name" },
    { key: "sender_email", label: "Sender email" },
    { key: "reply_to_email", label: "Reply-to email" },
    { key: "support_email", label: "Support email" },
  ]},
];

export default function CompanySettingsPage() {
  const { user, isAdmin } = useAuth();
  const [s, setS] = useState<Partial<CompanySettings>>({ workspace: "default", country: "India", accent_color: "#111827" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { (async () => {
    const data = await loadCompanySettings();
    if (data) setS(data);
    setLoading(false);
  })(); }, []);

  const set = (k: keyof CompanySettings, v: any) => setS((p) => ({ ...p, [k]: v }));

  async function uploadAsset(kind: "logo_url" | "signature_url" | "stamp_url", file: File) {
    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const path = `${kind}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("invoice-assets").upload(path, file, { upsert: true });
    if (error) { toast.error("Upload failed: " + error.message); return; }
    const { data } = supabase.storage.from("invoice-assets").getPublicUrl(path);
    const url = data.publicUrl;
    set(kind, url);
    // Persist immediately so the URL isn't lost if the user forgets to click Save
    if (user) {
      try {
        const saved = await saveCompanySettings({ ...s, [kind]: url }, user.id);
        if (saved) setS(saved);
        toast.success("Uploaded & saved");
      } catch (e: any) {
        toast.error("Uploaded but save failed: " + (e?.message || ""));
      }
    } else {
      toast.success("Uploaded");
    }
  }

  async function removeAsset(kind: "logo_url" | "signature_url" | "stamp_url") {
    set(kind, null);
    if (user) {
      try {
        const saved = await saveCompanySettings({ ...s, [kind]: null }, user.id);
        if (saved) setS(saved);
        toast.success("Removed");
      } catch (e: any) { toast.error(e?.message || "Remove failed"); }
    }
  }

  async function save() {
    if (!user) return;
    setSaving(true);
    try {
      const saved = await saveCompanySettings(s, user.id);
      if (saved) setS(saved);
      toast.success("Company settings saved");
    } catch (e: any) {
      toast.error(e?.message || "Save failed");
    } finally { setSaving(false); }
  }

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!isAdmin) return <div className="p-6 text-sm text-muted-foreground">Admins only.</div>;

  return (
    <div className="max-w-[900px]">
      <PageHead title="Company Settings" sub="Used as default seller details on invoices and other documents." back />
      {FIELD_GROUPS.map((g) => (
        <div key={g.title} className="mb-8">
          <SectionLabel>{g.title}</SectionLabel>
          <div className="grid grid-cols-2 gap-4 bg-white border border-line rounded-xl p-5">
            {g.fields.map((f) => (
              <div key={f.key as string} className={f.multiline ? "col-span-2" : ""}>
                <Label className="text-xs">{f.label}</Label>
                {f.multiline ? (
                  <Textarea value={(s as any)[f.key] || ""} onChange={(e) => set(f.key, e.target.value)} rows={2} />
                ) : (
                  <Input value={(s as any)[f.key] || ""} onChange={(e) => set(f.key, e.target.value)} />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      <SectionLabel>Invoice Branding</SectionLabel>
      <div className="bg-white border border-line rounded-xl p-5 mb-8 space-y-5">
        <div>
          <Label className="text-xs">Accent color</Label>
          <Input type="color" className="w-24 h-9" value={s.accent_color || "#111827"} onChange={(e) => set("accent_color", e.target.value)} />
        </div>
        <div className="grid grid-cols-3 gap-4">
          {(["logo_url", "signature_url", "stamp_url"] as const).map((k) => {
            const label = k === "logo_url" ? "Logo" : k === "signature_url" ? "Authorized Signature" : "Company Stamp";
            const present = !!s[k];
            const url = s[k] as string | null | undefined;
            const masked = url ? (url.length > 48 ? url.slice(0, 24) + "…" + url.slice(-16) : url) : "";
            return (
              <div key={k} className="border border-line rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs font-medium">{label}</Label>
                  <span className={`text-[10.5px] px-1.5 py-0.5 rounded ${present ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
                    {present ? "Uploaded" : "Missing"}
                  </span>
                </div>
                <div className="h-20 flex items-center justify-center bg-muted/30 rounded mb-2 overflow-hidden">
                  {url ? <img src={url} alt={label} className="max-h-20 max-w-full object-contain" /> : <span className="text-[11px] text-muted-foreground">No file</span>}
                </div>
                {present && <div className="text-[10px] text-muted-foreground mb-2 break-all">{masked}</div>}
                <Input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAsset(k, f); }} className="text-[11px]" />
                {present && (
                  <Button size="sm" variant="ghost" className="mt-1 h-7 text-[11px] text-red-600 hover:text-red-700" onClick={() => removeAsset(k)}>Remove</Button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Company Settings"}</Button>
      </div>
    </div>
  );
}
