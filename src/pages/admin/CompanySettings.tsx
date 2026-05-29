import { useEffect, useRef, useState } from "react";
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

type AssetKind = "logo_url" | "signature_url" | "stamp_url";
type AssetPathKind = "logo_path" | "signature_path" | "stamp_path";
const ASSET_FOLDER: Record<AssetKind, string> = {
  logo_url: "logo",
  signature_url: "signature",
  stamp_url: "stamp",
};
const ASSET_PATH_FIELD: Record<AssetKind, AssetPathKind> = {
  logo_url: "logo_path",
  signature_url: "signature_path",
  stamp_url: "stamp_path",
};
const ASSET_LABEL: Record<AssetKind, string> = {
  logo_url: "Company Logo",
  signature_url: "Authorized Signature",
  stamp_url: "Company Stamp",
};
const ALLOWED_MIME = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

function mapUploadError(msg: string): string {
  const m = (msg || "").toLowerCase();
  if (m.includes("row-level security") || m.includes("rls") || m.includes("violates row"))
    return "Upload blocked by storage policy. Please check invoice-assets bucket RLS.";
  if (m.includes("mime") || (m.includes("type") && m.includes("not")))
    return "Only PNG, JPG, JPEG, and WebP files are allowed.";
  if (m.includes("payload too large") || m.includes("size") || m.includes("exceed"))
    return "File must be under 5 MB.";
  return msg || "Upload failed";
}

function sanitizeFileName(name: string) {
  const ext = (name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  const base = name
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "asset";
  return `${base}.${ext}`;
}

function buildAssetPath(workspace: string | null | undefined, folder: string, fileName: string) {
  const safeWorkspace = (workspace || "default").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "default";
  return `${safeWorkspace}/${folder}/${Date.now()}-${sanitizeFileName(fileName)}`;
}

function maskPath(path?: string | null) {
  if (!path) return "—";
  return path.length > 54 ? `${path.slice(0, 28)}…${path.slice(-18)}` : path;
}

function pathFromPublicUrl(url?: string | null) {
  if (!url) return null;
  const marker = "/storage/v1/object/public/invoice-assets/";
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(url.slice(idx + marker.length).split("?")[0]);
}

export default function CompanySettingsPage() {
  const { user, profile, isAdmin } = useAuth();
  const [s, setS] = useState<Partial<CompanySettings>>({ workspace: "default", country: "India", accent_color: "#111827" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyKind, setBusyKind] = useState<AssetKind | null>(null);
  const [failedKind, setFailedKind] = useState<AssetKind | null>(null);
  const fileInputs = useRef<Record<AssetKind, HTMLInputElement | null>>({ logo_url: null, signature_url: null, stamp_url: null });
  const [lastUploadError, setLastUploadError] = useState<string | null>(null);
  const [lastSaveError, setLastSaveError] = useState<string | null>(null);
  const [lastUploadPath, setLastUploadPath] = useState<string | null>(null);
  const [testRunning, setTestRunning] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [diag, setDiag] = useState<any>(null);
  const [signedUrls, setSignedUrls] = useState<Record<AssetKind, string | null>>({ logo_url: null, signature_url: null, stamp_url: null });

  async function refreshDiagnostics() {
    const { data, error } = await (supabase as any).rpc("get_invoice_assets_storage_diagnostics");
    if (!error && data) setDiag(data);
  }

  async function refreshSignedUrls(src: Partial<CompanySettings>) {
    const next: Record<AssetKind, string | null> = { logo_url: null, signature_url: null, stamp_url: null };
    for (const k of ["logo_url", "signature_url", "stamp_url"] as const) {
      const path = ((src as any)[ASSET_PATH_FIELD[k]] as string | null | undefined) || pathFromPublicUrl(src[k] as string | null | undefined);
      if (path) {
        const { data } = await supabase.storage.from("invoice-assets").createSignedUrl(path, 3600);
        if (data?.signedUrl) next[k] = data.signedUrl;
      }
    }
    setSignedUrls(next);
  }

  useEffect(() => { (async () => {
    const [data] = await Promise.all([loadCompanySettings(), refreshDiagnostics()]);
    if (data) { setS(data); await refreshSignedUrls(data); }
    setLoading(false);
  })(); }, []);

  const set = (k: keyof CompanySettings, v: any) => setS((p) => ({ ...p, [k]: v }));

  async function uploadAsset(kind: AssetKind, file: File) {
    if (!ALLOWED_MIME.includes(file.type)) {
      const m = "Only PNG, JPG, JPEG, and WebP files are allowed.";
      setLastUploadError(m); toast.error(m); return;
    }
    if (file.size > MAX_BYTES) {
      const m = "File must be under 5 MB.";
      setLastUploadError(m); toast.error(m); return;
    }
    setBusyKind(kind);
    setFailedKind(null);
    setLastUploadError(null);
    try {
      const path = buildAssetPath(s.workspace, ASSET_FOLDER[kind], file.name);
      const pathField = ASSET_PATH_FIELD[kind];
      setLastUploadPath(path);
      const { error } = await supabase.storage
        .from("invoice-assets")
        .upload(path, file, { upsert: false, contentType: file.type, cacheControl: "3600" });
      if (error) {
        const friendly = mapUploadError(error.message);
        setFailedKind(kind);
        setLastUploadError(friendly);
        toast.error(friendly);
        return;
      }
      const { data } = await supabase.storage.from("invoice-assets").createSignedUrl(path, 3600);
      const previewUrl = data?.signedUrl || null;
      const nextSettings = { ...s, [kind]: null, [pathField]: path };
      setS(nextSettings);
      setSignedUrls((prev) => ({ ...prev, [kind]: previewUrl }));
      if (user) {
        try {
          const saved = await saveCompanySettings(nextSettings, user.id);
          if (saved) { setS(saved); await refreshSignedUrls(saved); }
          setLastSaveError(null);
          await refreshDiagnostics();
          toast.success(`${ASSET_LABEL[kind]} uploaded successfully`);
        } catch (e: any) {
          const m = "File uploaded but settings could not be saved. Please retry Save Company Settings.";
          setFailedKind(kind);
          setLastSaveError(e?.message || m);
          toast.error(m);
        }
      } else {
        toast.success("Uploaded");
      }
    } finally {
      setBusyKind(null);
    }
  }

  async function removeAsset(kind: AssetKind) {
    if (!confirm(`Remove ${ASSET_LABEL[kind].toLowerCase()}?`)) return;
    const pathField = ASSET_PATH_FIELD[kind];
    const existingPath = (s as any)[pathField] || pathFromPublicUrl(s[kind] as string | null | undefined);
    const nextSettings = { ...s, [kind]: null, [pathField]: null };
    setS(nextSettings);
    setSignedUrls((prev) => ({ ...prev, [kind]: null }));
    if (user) {
      try {
        const saved = await saveCompanySettings(nextSettings, user.id);
        if (saved) setS(saved);
        if (existingPath) await supabase.storage.from("invoice-assets").remove([existingPath]);
        setLastSaveError(null);
        await refreshDiagnostics();
        toast.success("Removed");
      } catch (e: any) {
        setLastSaveError(e?.message || "Remove failed");
        toast.error(e?.message || "Remove failed");
      }
    }
  }

  async function runStorageUploadTest() {
    if (!user) return;
    setTestRunning(true);
    setTestResult(null);
    setLastUploadError(null);
    try {
      const path = `debug/${user.id}-${Date.now()}.txt`;
      setLastUploadPath(path);
      const bytes = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
      const file = new Blob([bytes], { type: "image/png" });
      const { error } = await supabase.storage.from("invoice-assets").upload(path, file, { contentType: "image/png", upsert: false });
      if (error) throw error;
      const { error: removeError } = await supabase.storage.from("invoice-assets").remove([path]);
      if (removeError) throw removeError;
      setTestResult("Upload test passed");
      toast.success("Storage upload test passed");
    } catch (e: any) {
      const m = mapUploadError(e?.message || "Storage upload test failed");
      setLastUploadError(m);
      setTestResult(`Upload test failed: ${m}`);
      toast.error(m);
    } finally {
      setTestRunning(false);
      await refreshDiagnostics();
    }
  }

  async function save() {
    if (!user) return;
    setSaving(true);
    try {
      const saved = await saveCompanySettings(s, user.id);
      if (saved) setS(saved);
      setLastSaveError(null);
      toast.success("Company settings saved");
    } catch (e: any) {
      setLastSaveError(e?.message || "Save failed");
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
            const label = ASSET_LABEL[k];
            const pathField = ASSET_PATH_FIELD[k];
            const pathField = ASSET_PATH_FIELD[k];
            const storedPath = ((s as any)[pathField] as string | null | undefined) || pathFromPublicUrl(s[k] as string | null | undefined);
            const present = !!storedPath || !!s[k];
            const busy = busyKind === k;
            const previewUrl = signedUrls[k] || (s[k] as string | null | undefined) || null;
            const status = busy ? "Uploading" : failedKind === k ? "Failed" : present ? "Uploaded" : "Missing";
            const statusCls = busy
              ? "bg-primary/10 text-primary"
              : failedKind === k
                ? "bg-destructive/10 text-destructive"
                : present
                  ? "bg-accent text-accent-foreground"
                  : "bg-muted text-muted-foreground";
            return (
              <div key={k} className="border border-line rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs font-medium">{label}</Label>
                  <span className={`text-[10.5px] px-1.5 py-0.5 rounded ${statusCls}`}>{status}</span>
                </div>
                <div className="h-20 flex items-center justify-center bg-muted/30 rounded mb-2 overflow-hidden">
                  {previewUrl ? <img src={previewUrl} alt={label} className="max-h-20 max-w-full object-contain" /> : <span className="text-[11px] text-muted-foreground">No file</span>}
                </div>
                {present && <div className="text-[10px] text-muted-foreground mb-2 break-all">Path: {maskPath(storedPath)}</div>}
                <Input
                  ref={(el) => { fileInputs.current[k] = el; }}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadAsset(k, f);
                    e.target.value = "";
                  }}
                  className="hidden"
                />
                <div className="flex gap-2">
                  <Button size="sm" variant={present ? "outline" : "default"} className="h-7 text-[11px]" disabled={busy} onClick={() => fileInputs.current[k]?.click()}>
                    {present ? "Replace" : "Upload"}
                  </Button>
                  {present && !busy && (
                    <Button size="sm" variant="ghost" className="h-7 text-[11px] text-destructive hover:text-destructive" onClick={() => removeAsset(k)}>Remove</Button>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">PNG, JPG or WebP · up to 5 MB</div>
              </div>
            );
          })}
        </div>
      </div>

      <details className="mb-8 bg-white border border-line rounded-xl p-4 text-[11px]">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Admin debug · Invoice branding</summary>
        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 font-mono">
          <div>Bucket exists</div><div>{diag ? String(!!diag.bucket_exists) : "checking"}</div>
          <div>Bucket public</div><div>{diag ? String(!!diag.bucket_public) : "checking"}</div>
          <div>Workspace</div><div>{s.workspace || "default"}</div>
          <div>Current user id</div><div className="break-all">{user?.id || "—"}</div>
          <div>Current role</div><div>{isAdmin ? "admin" : profile?.role || "—"}</div>
          <div>Is admin</div><div>{String(isAdmin)}</div>
          <div>Can manage invoice settings</div><div>{diag ? String(!!diag.can_manage_invoice_settings) : String(isAdmin)}</div>
          <div>Can upload logo</div><div>{diag ? String(!!diag.can_manage_invoice_settings) : String(isAdmin)}</div>
          <div>Can upload signature</div><div>{diag ? String(!!diag.can_manage_invoice_settings) : String(isAdmin)}</div>
          <div>Can upload stamp</div><div>{diag ? String(!!diag.can_manage_invoice_settings) : String(isAdmin)}</div>
          <div>logo_url</div><div>{s.logo_url ? "present" : "missing"}</div>
          <div>logo_path</div><div className="break-all">{maskPath(s.logo_path)}</div>
          <div>signature_url</div><div>{s.signature_url ? "present" : "missing"}</div>
          <div>signature_path</div><div className="break-all">{maskPath(s.signature_path)}</div>
          <div>stamp_url</div><div>{s.stamp_url ? "present" : "missing"}</div>
          <div>stamp_path</div><div className="break-all">{maskPath(s.stamp_path)}</div>
          <div>Last upload path</div><div className="break-all">{lastUploadPath || "—"}</div>
          <div>Last upload error</div><div className="text-destructive break-all">{lastUploadError || "—"}</div>
          <div>Last settings save error</div><div className="text-destructive break-all">{lastSaveError || "—"}</div>
          <div>Storage upload test</div><div>{testResult || "Not run"}</div>
        </div>
        <Button size="sm" variant="outline" className="mt-3 h-8 text-xs" disabled={testRunning} onClick={runStorageUploadTest}>
          {testRunning ? "Testing…" : "Run Storage Upload Test"}
        </Button>
      </details>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Company Settings"}</Button>
      </div>
    </div>
  );
}
