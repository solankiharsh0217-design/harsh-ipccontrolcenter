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
import type { CompanySettings, BonusResource } from "@/lib/invoices/types";

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
  const [paidStages, setPaidStages] = useState<Array<{ id: string; name: string; pipeline_name: string }>>([]);

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
    try {
      const [data] = await Promise.all([loadCompanySettings(), refreshDiagnostics()]);
      if (data) { setS(data); await refreshSignedUrls(data); }
    } catch (e) { console.error("[CompanySettings] load failed", e); }
    // Load paid pipeline stages for CoC stage pickers (resilient: never block page render)
    try {
      const { data: pipes } = await (supabase as any)
        .from("pipelines")
        .select("id, name, type")
        .eq("type", "paid");
      const pipeIds = (pipes || []).map((p: any) => p.id);
      const pipeMap = new Map<string, string>((pipes || []).map((p: any) => [p.id, p.name]));
      if (pipeIds.length) {
        const { data: stages } = await (supabase as any)
          .from("stages")
          .select("id, name, position, pipeline_id")
          .in("pipeline_id", pipeIds)
          .order("position");
        if (stages) setPaidStages(stages.map((st: any) => ({ id: st.id, name: st.name, pipeline_name: pipeMap.get(st.pipeline_id) || "" })));
      }
    } catch (e) { console.error("[CompanySettings] stage load failed", e); }
    setLoading(false);
  })(); }, []);

  async function saveCocAutomation() {
    if (!user) return;
    setSaving(true);
    try {
      const saved = await saveCompanySettings({
        coc_link_opened_stage_id: (s as any).coc_link_opened_stage_id ?? null,
        coc_access_done_stage_id: (s as any).coc_access_done_stage_id ?? null,
        coc_auto_move_link_opened: (s as any).coc_auto_move_link_opened !== false,
        coc_auto_move_access_done: !!(s as any).coc_auto_move_access_done,
      } as any, user.id);
      if (saved) setS(saved);
      toast.success("Code of Conduct automation settings saved.");
    } catch (e: any) {
      toast.error(e?.message || "Save failed");
    } finally { setSaving(false); }
  }

  const bonusResources: BonusResource[] = Array.isArray((s as any).bonus_resources) ? (s as any).bonus_resources : [];
  const setBonusResources = (next: BonusResource[]) => setS((p) => ({ ...p, bonus_resources: next } as any));
  const addBonusResource = () => setBonusResources([...bonusResources, { id: `r_${Date.now()}`, title: "New bonus", description: "", url: "", type: "Training", active: true }]);
  const updateBonusResource = (idx: number, patch: Partial<BonusResource>) => setBonusResources(bonusResources.map((r, i) => i === idx ? { ...r, ...patch } : r));
  const removeBonusResource = (idx: number) => setBonusResources(bonusResources.filter((_, i) => i !== idx));
  const moveBonusResource = (idx: number, dir: -1 | 1) => {
    const j = idx + dir; if (j < 0 || j >= bonusResources.length) return;
    const next = [...bonusResources]; [next[idx], next[j]] = [next[j], next[idx]]; setBonusResources(next);
  };

  const [bonusSaving, setBonusSaving] = useState(false);
  const [bonusPreviewOpen, setBonusPreviewOpen] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [termsSaving, setTermsSaving] = useState(false);

  async function saveBonusEmail() {
    if (!user) return;
    setBonusSaving(true);
    try {
      const saved = await saveCompanySettings({
        bonus_email_auto_send: (s as any).bonus_email_auto_send !== false,
        bonus_email_subject: (s as any).bonus_email_subject ?? "",
        bonus_email_body: (s as any).bonus_email_body ?? "",
        bonus_email_support_email: (s as any).bonus_email_support_email ?? "",
        bonus_email_subscription_duration: (s as any).bonus_email_subscription_duration ?? "",
        bonus_resources: bonusResources,
      } as any, user.id);
      if (saved) setS(saved);
      toast.success("Bonus email settings saved.");
    } catch (e: any) { toast.error(e?.message || "Save failed"); }
    finally { setBonusSaving(false); }
  }

  async function saveBonusTermsNewVersion() {
    if (!user) return;
    setTermsSaving(true);
    try {
      const nextVersion = Number((s as any).bonus_terms_version || 0) + 1;
      const saved = await saveCompanySettings({
        bonus_terms_text: (s as any).bonus_terms_text ?? "",
        bonus_terms_version: nextVersion,
        bonus_terms_updated_at: new Date().toISOString(),
      } as any, user.id);
      if (saved) setS(saved);
      toast.success(`Bonus terms saved as version ${nextVersion}.`);
    } catch (e: any) { toast.error(e?.message || "Save failed"); }
    finally { setTermsSaving(false); }
  }

  async function sendBonusTestEmail() {
    if (!testEmail.trim()) { toast.error("Enter a test email address"); return; }
    setTestSending(true);
    try {
      // Persist current edits first so test uses latest copy
      if (user) {
        await saveCompanySettings({
          bonus_email_subject: (s as any).bonus_email_subject ?? "",
          bonus_email_body: (s as any).bonus_email_body ?? "",
          bonus_email_support_email: (s as any).bonus_email_support_email ?? "",
          bonus_email_subscription_duration: (s as any).bonus_email_subscription_duration ?? "",
          bonus_resources: bonusResources,
        } as any, user.id);
      }
      const { data, error } = await supabase.functions.invoke("send-bonus-access-email", { body: { mode: "test", test_email: testEmail.trim() } });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data?.message || "Send failed");
      toast.success(`Test email sent to ${testEmail.trim()}`);
    } catch (e: any) { toast.error(e?.message || "Test send failed"); }
    finally { setTestSending(false); }
  }

  function renderBonusPreview() {
    const subject = String((s as any).bonus_email_subject || "");
    const bodyRaw = String((s as any).bonus_email_body || "");
    const support = String((s as any).bonus_email_support_email || "");
    const dur = String((s as any).bonus_email_subscription_duration || "");
    const ctx: Record<string, string> = {
      member_name: "Sample Member",
      support_email: support,
      activation_date: new Date().toLocaleDateString("en-IN", { dateStyle: "long" }),
      subscription_duration: dur,
    };
    const subj = subject.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => ctx[k] ?? "");
    const body = bodyRaw.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => ctx[k] ?? "");
    return { subj, body, support, dur };
  }

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

      <SectionLabel>Code of Conduct Guide Video</SectionLabel>
      <div className="bg-white border border-line rounded-xl p-5 mb-8 grid grid-cols-2 gap-4">
        <div className="col-span-2 text-[12px] text-muted-foreground -mt-1">
          Shown on the guided Code of Conduct page (<code>/code-of-conduct-guide/:token</code>). Members must watch the configured percentage before the signature button unlocks.
        </div>
        <div>
          <Label className="text-xs">Wistia video ID</Label>
          <Input value={s.guide_video_id || ""} onChange={(e) => set("guide_video_id" as any, e.target.value)} placeholder="e.g. abc123xyz" />
        </div>
        <div>
          <Label className="text-xs">Video title (optional)</Label>
          <Input value={s.guide_video_title || ""} onChange={(e) => set("guide_video_title" as any, e.target.value)} placeholder="Welcome to IPC" />
        </div>
        <div>
          <Label className="text-xs">Required watch %</Label>
          <Input type="number" min={1} max={100} value={s.guide_video_required_percent ?? 95} onChange={(e) => set("guide_video_required_percent" as any, Number(e.target.value) || 95)} />
        </div>
        <div className="flex items-end gap-2">
          <input
            id="guide_video_is_active"
            type="checkbox"
            className="h-4 w-4"
            checked={s.guide_video_is_active !== false}
            onChange={(e) => set("guide_video_is_active" as any, e.target.checked)}
          />
          <Label htmlFor="guide_video_is_active" className="text-xs">Video gate active</Label>
        </div>
      </div>

      <SectionLabel>Code of Conduct Stage Automation</SectionLabel>
      <div className="bg-white border-2 border-primary/30 rounded-xl p-5 mb-8 grid grid-cols-2 gap-4 shadow-sm">
        <div className="col-span-2 text-[12px] text-muted-foreground -mt-1">
          When members open or complete the Code of Conduct, automatically advance their Paid Onboarding stage. Backward moves are never performed.
        </div>
        {paidStages.length === 0 && (
          <div className="col-span-2 text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
            No Paid Onboarding stages found. Create stages in Calling CRM → Paid — Onboarding → Add Stage.
          </div>
        )}
        <div>
          <Label className="text-xs">Link Opened stage</Label>
          <select
            className="w-full h-9 px-2 text-sm border border-line rounded bg-white"
            value={(s as any).coc_link_opened_stage_id || ""}
            onChange={(e) => set("coc_link_opened_stage_id" as any, e.target.value || null)}
          >
            <option value="">— Not configured —</option>
            {paidStages.map((st) => (
              <option key={st.id} value={st.id}>{st.pipeline_name} · {st.name}</option>
            ))}
          </select>
          <div className="text-[11px] text-muted-foreground mt-1">
            Link Opened means the member clicked the Code of Conduct URL. It does not mean access is done.
          </div>
          {!paidStages.some((st) => /link\s*opened/i.test(st.name)) && paidStages.length > 0 && (
            <div className="text-[11px] text-amber-700 mt-1">
              Tip: no “Code of Conduct Link Opened” stage exists. Create this stage in Calling CRM → Paid — Onboarding → Add Stage.
            </div>
          )}
        </div>
        <div className="flex items-end gap-2">
          <input
            id="coc_auto_move_link_opened"
            type="checkbox"
            className="h-4 w-4"
            checked={(s as any).coc_auto_move_link_opened !== false}
            onChange={(e) => set("coc_auto_move_link_opened" as any, e.target.checked)}
          />
          <Label htmlFor="coc_auto_move_link_opened" className="text-xs">Auto-move to Link Opened stage when URL is visited</Label>
        </div>
        <div>
          <Label className="text-xs">Access Done stage</Label>
          <select
            className="w-full h-9 px-2 text-sm border border-line rounded bg-white"
            value={(s as any).coc_access_done_stage_id || ""}
            onChange={(e) => set("coc_access_done_stage_id" as any, e.target.value || null)}
          >
            <option value="">— Not configured —</option>
            {paidStages.map((st) => (
              <option key={st.id} value={st.id}>{st.pipeline_name} · {st.name}</option>
            ))}
          </select>
          <div className="text-[11px] text-muted-foreground mt-1">
            Access Done should be selected only after signing/completion requirements are met.
          </div>
        </div>
        <div className="flex items-end gap-2">
          <input
            id="coc_auto_move_access_done"
            type="checkbox"
            className="h-4 w-4"
            checked={!!(s as any).coc_auto_move_access_done}
            onChange={(e) => set("coc_auto_move_access_done" as any, e.target.checked)}
          />
          <Label htmlFor="coc_auto_move_access_done" className="text-xs">Auto-move to Access Done stage after Code of Conduct completion</Label>
        </div>
        <div className="col-span-2 flex justify-end pt-1">
          <Button size="sm" onClick={saveCocAutomation} disabled={saving}>
            {saving ? "Saving…" : "Save automation settings"}
          </Button>
        </div>
      </div>

      <SectionLabel>Bonus Access Email</SectionLabel>
      <div className="bg-white border-2 border-primary/30 rounded-xl p-5 mb-8 shadow-sm space-y-4">
        <div className="text-[12px] text-muted-foreground">
          Email sent to members after Code of Conduct completion. Placeholders: <code>{"{{member_name}}"}</code>, <code>{"{{support_email}}"}</code>, <code>{"{{activation_date}}"}</code>, <code>{"{{subscription_duration}}"}</code>.
        </div>
        <div className="flex items-center gap-2">
          <input
            id="bonus_email_auto_send"
            type="checkbox"
            className="h-4 w-4"
            checked={(s as any).bonus_email_auto_send !== false}
            onChange={(e) => set("bonus_email_auto_send" as any, e.target.checked)}
          />
          <Label htmlFor="bonus_email_auto_send" className="text-xs">Auto-send bonus email after Code of Conduct completion</Label>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">Email subject</Label>
            <Input value={(s as any).bonus_email_subject || ""} onChange={(e) => set("bonus_email_subject" as any, e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Support email</Label>
            <Input value={(s as any).bonus_email_support_email || ""} onChange={(e) => set("bonus_email_support_email" as any, e.target.value)} />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Subscription duration text</Label>
            <Input value={(s as any).bonus_email_subscription_duration || ""} onChange={(e) => set("bonus_email_subscription_duration" as any, e.target.value)} />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Email body</Label>
            <Textarea rows={8} value={(s as any).bonus_email_body || ""} onChange={(e) => set("bonus_email_body" as any, e.target.value)} />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-xs font-semibold">Bonus resources</Label>
            <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={addBonusResource}>+ Add resource</Button>
          </div>
          <div className="space-y-2">
            {bonusResources.length === 0 && <div className="text-[12px] text-muted-foreground">No bonus resources yet.</div>}
            {bonusResources.map((r, idx) => (
              <div key={r.id} className="border border-line rounded-lg p-3 grid grid-cols-12 gap-2 items-start">
                <div className="col-span-4">
                  <Label className="text-[10px]">Title</Label>
                  <Input value={r.title || ""} onChange={(e) => updateBonusResource(idx, { title: e.target.value })} />
                </div>
                <div className="col-span-3">
                  <Label className="text-[10px]">Type</Label>
                  <select className="w-full h-10 px-2 text-sm border border-input rounded-md bg-background" value={r.type || "Training"} onChange={(e) => updateBonusResource(idx, { type: e.target.value })}>
                    {["Training", "Prompt Sheet", "Document", "Portfolio Support", "Other"].map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="col-span-5">
                  <Label className="text-[10px]">URL</Label>
                  <Input value={r.url || ""} onChange={(e) => updateBonusResource(idx, { url: e.target.value })} placeholder="https://…" />
                </div>
                <div className="col-span-12">
                  <Label className="text-[10px]">Description</Label>
                  <Input value={r.description || ""} onChange={(e) => updateBonusResource(idx, { description: e.target.value })} />
                </div>
                <div className="col-span-12 flex items-center gap-3 text-[11px]">
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={r.active !== false} onChange={(e) => updateBonusResource(idx, { active: e.target.checked })} />
                    Active
                  </label>
                  <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => moveBonusResource(idx, -1)} disabled={idx === 0}>↑ Move up</button>
                  <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => moveBonusResource(idx, 1)} disabled={idx === bonusResources.length - 1}>↓ Move down</button>
                  <button type="button" className="ml-auto text-destructive hover:underline" onClick={() => removeBonusResource(idx)}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-line">
          <Button size="sm" variant="outline" onClick={() => setBonusPreviewOpen((v) => !v)}>{bonusPreviewOpen ? "Hide preview" : "Preview email"}</Button>
          <Input className="max-w-[260px] h-9" placeholder="you@example.com" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} />
          <Button size="sm" variant="outline" disabled={testSending} onClick={sendBonusTestEmail}>{testSending ? "Sending…" : "Send test email"}</Button>
          <Button size="sm" className="ml-auto" onClick={saveBonusEmail} disabled={bonusSaving}>{bonusSaving ? "Saving…" : "Save bonus email settings"}</Button>
        </div>

        {bonusPreviewOpen && (() => {
          const { subj, body, support, dur } = renderBonusPreview();
          const active = bonusResources.filter((r) => r.active !== false);
          return (
            <div className="border border-line rounded-lg p-4 bg-muted/30">
              <div className="text-[11px] text-muted-foreground mb-2">PREVIEW · placeholder values shown with sample data</div>
              <div className="bg-white rounded p-4 border border-line">
                <div className="text-[11px] text-muted-foreground">Subject</div>
                <div className="font-semibold mb-3">{subj}</div>
                <div className="text-sm whitespace-pre-wrap">{body}</div>
                <div className="mt-4">
                  <div className="text-sm font-semibold mb-1">Your Bonus Resources</div>
                  <ul className="list-disc pl-5 space-y-1 text-sm">
                    {active.length === 0 && <li className="text-muted-foreground">No active resources</li>}
                    {active.map((r) => (
                      <li key={r.id}>
                        <span className="font-medium">{r.title}</span>
                        {r.type && <span className="text-muted-foreground text-xs"> · {r.type}</span>}
                        {r.description && <div className="text-xs text-muted-foreground">{r.description}</div>}
                        {r.url && <a href={r.url} target="_blank" rel="noreferrer" className="text-xs text-primary break-all">{r.url}</a>}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="text-xs text-muted-foreground mt-4">Support: {support || "—"} · Subscription: {dur || "—"}</div>
              </div>
            </div>
          );
        })()}
      </div>

      <SectionLabel>Bonus Agreement Terms</SectionLabel>
      <div className="bg-white border border-line rounded-xl p-5 mb-8 space-y-3">
        <div className="text-[12px] text-muted-foreground">
          Current version: <span className="font-mono">v{(s as any).bonus_terms_version || 1}</span>
          {(s as any).bonus_terms_updated_at ? <> · updated {new Date((s as any).bonus_terms_updated_at).toLocaleString("en-IN")}</> : null}
        </div>
        <div>
          <Label className="text-xs">Bonus terms text</Label>
          <Textarea rows={10} value={(s as any).bonus_terms_text || ""} onChange={(e) => set("bonus_terms_text" as any, e.target.value)} />
        </div>
        <div className="text-[11px] text-muted-foreground">
          Saving as a new version increments the version number. Already-accepted members keep their original snapshot — they are not forced to re-accept.
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={saveBonusTermsNewVersion} disabled={termsSaving}>{termsSaving ? "Saving…" : "Save as new version"}</Button>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Company Settings"}</Button>
      </div>
    </div>
  );
}
