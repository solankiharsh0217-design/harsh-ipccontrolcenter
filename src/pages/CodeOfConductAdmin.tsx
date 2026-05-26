import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHead, SectionLabel } from "@/components/ui-bits";
import { toast as sonnerToast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import CodeOfConductRulesTab from "@/components/admin/CodeOfConductRulesTab";
import { DEFAULT_AGREEMENT_HTML } from "@/lib/codeOfConductDefaults";
import EditMemberEmailModal from "@/components/paid-pipeline/EditMemberEmailModal";


const toast = ({ title, description, variant }: { title: string; description?: string; variant?: "destructive" }) => {
  if (variant === "destructive") sonnerToast.error(title, { description });
  else sonnerToast.success(title, { description });
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft", ready_to_send: "Ready", sent: "Sent", viewed: "Viewed",
  signed: "Signed", expired: "Expired", cancelled: "Cancelled", failed: "Failed",
};

const DEFAULT_EMAIL_SUBJECT = "Action Required: Sign Your IPC Diamond Membership Code of Conduct";
const DEFAULT_EMAIL_BODY = `Hi {{member_name}},

Welcome to the IPC Diamond Membership.

Before we activate your next steps and add you to the official Diamond Members group, please review and acknowledge your Code of Conduct using the secure link below:

{{signing_link}}

This document confirms that you have understood the program guidelines, participation expectations, support process, communication rules, and membership responsibilities.

Please complete this step within {{expiry_days}} days.

Once you sign and submit the acknowledgement, you will be redirected to the IPC Diamond Members WhatsApp group link. Our team will then review and guide you for the next access steps.

If you have any questions, you can reply to this email or contact Team IPC.

Regards,
Team IPC
India Photographers Club`;

// Full template required fields (used only for Save Template button on Template tab)
const REQUIRED_FIELDS: { key: string; label: string }[] = [
  { key: "name", label: "Template name" },
  { key: "document_title", label: "Document title" },
  { key: "program_name", label: "Program name" },
  { key: "party_a_name", label: "Party A / company legal name" },
  { key: "version", label: "Version" },
  { key: "expiry_days", label: "Link expiry days" },
  { key: "whatsapp_redirect_url", label: "WhatsApp group URL" },
  { key: "email_subject", label: "Email subject" },
  { key: "email_body", label: "Email body" },
];

// Email-settings-only fields (used by Save Email Settings button on Setup tab)
const EMAIL_SETTINGS_FIELDS = ["from_email", "from_name", "reply_to_email", "test_recipient_email", "email_subject", "email_body"];

type ChecklistItem = { key: string; label: string; ok: boolean; required: boolean; hint?: string };

export default function CodeOfConductAdmin() {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<"setup" | "template" | "rules" | "requests" | "diagnostics">("setup");
  const [tpl, setTpl] = useState<any>(null);
  const [savingTpl, setSavingTpl] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [requests, setRequests] = useState<any[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [eventsFor, setEventsFor] = useState<any | null>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [sendingTest, setSendingTest] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [diag, setDiag] = useState<any>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [lastTestResult, setLastTestResult] = useState<{ ok: boolean; message?: string; provider_message_id?: string | null; sent_at?: string | null; error_code?: string } | null>(null);
  const [savedEmailFlash, setSavedEmailFlash] = useState(false);
  const [savedTemplateFlash, setSavedTemplateFlash] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [generatedLinks, setGeneratedLinks] = useState<Record<string, string>>({});
  const [signedRecord, setSignedRecord] = useState<any | null>(null);
  const [signedRecordReceiptUrl, setSignedRecordReceiptUrl] = useState<string | null>(null);
  const [signedRecordEvents, setSignedRecordEvents] = useState<any[]>([]);
  const [editEmailReq, setEditEmailReq] = useState<any | null>(null);
  const [archiveInput, setArchiveInput] = useState("");

  const loadTpl = async () => {
    const { data } = await (supabase as any).from("code_of_conduct_templates").select("*").eq("is_active", true).order("created_at", { ascending: false }).limit(1);
    const row = data?.[0];
    if (row) {
      // Auto-fill defaults in-memory if subject/body are empty so admin never has to write them.
      if (!row.email_subject || !String(row.email_subject).trim()) row.email_subject = DEFAULT_EMAIL_SUBJECT;
      if (!row.email_body || !String(row.email_body).trim()) row.email_body = DEFAULT_EMAIL_BODY;
      setTpl(row);
      if (row.updated_at) setLastSavedAt(row.updated_at);
      setArchiveInput(Array.isArray(row.signed_copy_recipient_emails) ? row.signed_copy_recipient_emails.join(", ") : "");
    } else {
      setTpl(blankTpl());
      setArchiveInput("");
    }
  };
  const loadRequests = async () => {
    const { data } = await (supabase as any).from("code_of_conduct_requests").select("*").order("created_at", { ascending: false }).limit(200);
    setRequests(data || []);
  };
  const loadDiag = async () => {
    setDiagLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-code-of-conduct-email", { body: { action: "diagnostics" } });
      if (error) throw error;
      setDiag(data);
    } catch (e: any) {
      setDiag({ ok: false, error: e?.message });
    } finally { setDiagLoading(false); }
  };
  useEffect(() => { loadTpl(); loadRequests(); loadDiag(); }, []);

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    for (const f of REQUIRED_FIELDS) {
      const v = tpl?.[f.key];
      if (v === undefined || v === null || String(v).trim() === "") e[f.key] = `${f.label} is required`;
    }
    // Sender must come from template override OR backend secret
    if (!tpl?.from_email && !diag?.has_email_from_address) e.from_email = "Sender email required (set here or add EMAIL_FROM_ADDRESS secret)";
    if (!tpl?.from_name && !diag?.has_email_from_name) e.from_name = "Sender name required (set here or add EMAIL_FROM_NAME secret)";
    if (tpl?.from_email && !String(tpl.from_email).includes("@")) e.from_email = "From email looks invalid";
    if (tpl?.reply_to_email && !String(tpl.reply_to_email).includes("@")) e.reply_to_email = "Reply-to email looks invalid";
    if (tpl?.test_recipient_email && !String(tpl.test_recipient_email).includes("@")) e.test_recipient_email = "Test email looks invalid";
    if (tpl?.expiry_days && (Number(tpl.expiry_days) < 1 || Number(tpl.expiry_days) > 90)) e.expiry_days = "Expiry must be 1–90 days";
    if (!tpl?.template_pdf_url && !tpl?.html_content) e.template_pdf_url = "PDF URL or HTML body is required";
    if (tpl?.email_body && !String(tpl.email_body).includes("{{signing_link}}")) e.email_body = "Email body must include {{signing_link}}";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateEmailSettings = (): boolean => {
    const e: Record<string, string> = { ...errors };
    // Clear prior email-settings errors
    for (const k of EMAIL_SETTINGS_FIELDS) delete e[k];

    if (tpl?.from_email && !String(tpl.from_email).includes("@")) e.from_email = "From email looks invalid";
    if (tpl?.reply_to_email && !String(tpl.reply_to_email).includes("@")) e.reply_to_email = "Reply-to email looks invalid";
    if (tpl?.test_recipient_email && !String(tpl.test_recipient_email).includes("@")) e.test_recipient_email = "Test email looks invalid";
    if (!tpl?.from_email && !diag?.has_email_from_address) e.from_email = "Sender email required (set here or add EMAIL_FROM_ADDRESS secret)";
    if (!tpl?.from_name && !diag?.has_email_from_name) e.from_name = "Sender name required (set here or add EMAIL_FROM_NAME secret)";
    if (!tpl?.email_subject || !String(tpl.email_subject).trim()) e.email_subject = "Email subject is required";
    if (!tpl?.email_body || !String(tpl.email_body).trim()) e.email_body = "Email body is required";
    if (tpl?.email_body && !String(tpl.email_body).includes("{{signing_link}}")) e.email_body = "Email body must include {{signing_link}} so the member can sign the document.";
    setErrors(e);
    return !EMAIL_SETTINGS_FIELDS.some((k) => e[k]);
  };

  const persistTpl = async (): Promise<{ ok: boolean; error?: string; row?: any }> => {
    const payload = { ...tpl };
    delete payload.id;
    // Ensure new templates always have at least the minimum required NOT NULL fields
    if (!payload.name) payload.name = "Diamond Membership Code of Conduct";
    if (!payload.document_title) payload.document_title = payload.name;
    if (!payload.program_name) payload.program_name = "IPC Diamond Membership";
    if (!payload.party_a_name) payload.party_a_name = "India Photographers' Club";
    if (!payload.version) payload.version = "1.0";
    if (payload.is_active === undefined) payload.is_active = true;
    if (!payload.expiry_days) payload.expiry_days = 7;
    try {
      if (tpl?.id) {
        const { data, error } = await (supabase as any).from("code_of_conduct_templates").update(payload).eq("id", tpl.id).select().single();
        if (error) throw error;
        return { ok: true, row: data };
      } else {
        const { data, error } = await (supabase as any).from("code_of_conduct_templates").insert(payload).select().single();
        if (error) throw error;
        return { ok: true, row: data };
      }
    } catch (e: any) {
      return { ok: false, error: e?.message || "Unknown database error" };
    }
  };

  const saveEmailSettings = async (): Promise<boolean> => {
    if (savingTpl) return false;
    setSaveError(null);
    if (!validateEmailSettings()) {
      toast({ title: "Please fix the highlighted email fields", variant: "destructive" });
      return false;
    }
    setSavingTpl(true);
    try {
      const res = await persistTpl();
      if (!res.ok) {
        setSaveError(res.error || "Email settings failed to save");
        toast({ title: "Email settings failed to save", description: res.error, variant: "destructive" });
        return false;
      }
      if (res.row) setTpl(res.row);
      setLastSavedAt(new Date().toISOString());
      setSavedEmailFlash(true);
      toast({ title: "Saved successfully", description: "Email settings are ready for testing." });
      window.setTimeout(() => setSavedEmailFlash(false), 2000);
      await loadDiag();
      return true;
    } finally { setSavingTpl(false); }
  };

  const saveTpl = async (silent = false) => {
    if (savingTpl) return false;
    setSaveError(null);
    if (!validate()) {
      if (!silent) toast({ title: "Please fix missing fields", description: "Required fields are highlighted in red.", variant: "destructive" });
      return false;
    }
    setSavingTpl(true);
    try {
      const res = await persistTpl();
      if (!res.ok) {
        setSaveError(res.error || "Template failed to save");
        toast({ title: "Save failed", description: res.error, variant: "destructive" });
        return false;
      }
      if (res.row) setTpl(res.row);
      setLastSavedAt(new Date().toISOString());
      setSavedTemplateFlash(true);
      toast({ title: "Saved successfully", description: silent ? "Email settings were saved." : "Code of Conduct template was saved." });
      window.setTimeout(() => setSavedTemplateFlash(false), 2000);
      await loadDiag();
      return true;
    } finally { setSavingTpl(false); }
  };

  const applyDefaultEmailCopy = () => {
    const hasContent = (tpl?.email_subject && tpl.email_subject !== DEFAULT_EMAIL_SUBJECT) || (tpl?.email_body && tpl.email_body !== DEFAULT_EMAIL_BODY && tpl.email_body.trim() !== "");
    if (hasContent && !confirm("This will replace the current email copy. Continue?")) return;
    setTpl({ ...tpl, email_subject: DEFAULT_EMAIL_SUBJECT, email_body: DEFAULT_EMAIL_BODY });
    toast({ title: "Default email copy applied", description: "Click Save Email Settings to persist." });
  };

  const uploadPdf = async (file: File) => {
    setUploading(true);
    try {
      const path = `templates/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
      const { error } = await supabase.storage.from("code-of-conduct").upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from("code-of-conduct").getPublicUrl(path);
      setTpl({ ...tpl, template_pdf_url: data.publicUrl });
      toast({ title: "PDF uploaded", description: "Click Save to apply." });
    } catch (e: any) { toast({ title: "Upload failed", description: e?.message, variant: "destructive" }); }
    finally { setUploading(false); }
  };

  const sendTestEmail = async () => {
    const to = tpl?.test_recipient_email;
    if (!to || !to.includes("@")) { toast({ title: "Add a test recipient email first", variant: "destructive" }); return; }
    if (!tpl?.email_subject || !tpl?.email_body || !String(tpl.email_body).includes("{{signing_link}}")) {
      toast({ title: "Email settings incomplete", description: "Save email settings (subject + body with {{signing_link}}) first.", variant: "destructive" });
      return;
    }
    if (!tpl?.id) {
      const saved = await saveEmailSettings();
      if (!saved) return;
    }

    setSendingTest(true);
    setLastTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("send-code-of-conduct-email", {
        body: { is_test: true, member_name: "Test Recipient", member_email: to, template_id: tpl.id, origin: window.location.origin },
      });
      if (error) throw error;
      const res = data as any;
      if (res?.ok === false) {
        setLastTestResult({ ok: false, message: res.message, error_code: res.error_code });
        throw new Error(`[${res.error_code}] ${res.message}`);
      }
      setLastTestResult({ ok: true, provider_message_id: res?.provider_message_id, sent_at: res?.sent_at });
      toast({ title: `Test email sent to ${to}` });
      await loadDiag();
    } catch (e: any) {
      toast({ title: "Test email failed", description: e?.message || "Unknown error", variant: "destructive" });
    } finally { setSendingTest(false); }
  };

  const openEvents = async (r: any) => {
    setEventsFor(r);
    const { data } = await (supabase as any).from("code_of_conduct_events").select("*").eq("request_id", r.id).order("created_at", { ascending: true });
    setEvents(data || []);
  };

  const retrySend = async (r: any) => {
    setRetryingId(r.id);
    try {
      const { data, error } = await supabase.functions.invoke("send-code-of-conduct-email", {
        body: {
          request_id: r.id, paid_pipeline_lead_id: r.paid_pipeline_lead_id, crm_lead_id: r.crm_lead_id,
          member_name: r.member_name, member_email: r.member_email, member_phone: r.member_phone,
          program_name: r.program_name, deal_value: r.deal_value, origin: window.location.origin,
        },
      });
      if (error) throw error;
      if ((data as any)?.ok === false) throw new Error(`[${(data as any).error_code}] ${(data as any).message}`);
      toast({ title: "Email resent", description: r.member_email });
      loadRequests();
    } catch (e: any) {
      toast({ title: "Resend failed", description: e?.message, variant: "destructive" });
    } finally { setRetryingId(null); }
  };

  const copySigningLink = async (r: any) => {
    try {
      const existing = generatedLinks[r.id];
      if (existing) {
        await navigator.clipboard.writeText(existing);
        toast({ title: "Signing link copied" });
        return;
      }
      const { data, error } = await supabase.functions.invoke("send-code-of-conduct-email", {
        body: { action: "generate_signing_link", request_id: r.id, origin: window.location.origin },
      });
      if (error) throw error;
      if ((data as any)?.ok === false) throw new Error(`[${(data as any).error_code}] ${(data as any).message}`);
      const link = (data as any)?.signing_url;
      if (!link) throw new Error("No signing link returned");
      setGeneratedLinks((prev) => ({ ...prev, [r.id]: link }));
      await navigator.clipboard.writeText(link);
      toast({ title: "Signing link copied", description: "A fresh token was generated for this request." });
      await loadRequests();
    } catch (e: any) {
      toast({ title: "Copy link failed", description: e?.message || "Unknown error", variant: "destructive" });
    }
  };

  const getReceiptSignedUrl = async (r: any): Promise<string | null> => {
    const stored: string | null = r.signed_html_url || r.signed_receipt_url || null;
    if (!stored) return null;
    const m = stored.match(/(?:storage:|\/storage\/v1\/object\/(?:public|sign)\/)signed-code-of-conduct\/(.+?)(?:\?|$)/);
    const path = m ? m[1] : null;
    if (!path) return stored;
    const { data } = await supabase.storage.from("signed-code-of-conduct").createSignedUrl(path, 60 * 60 * 24 * 7);
    return data?.signedUrl || null;
  };

  const viewSigned = async (r: any) => {
    const u = await getReceiptSignedUrl(r);
    if (!u) { toast({ title: "Signed copy not available", variant: "destructive" }); return; }
    window.open(u, "_blank");
    await (supabase as any).from("code_of_conduct_events").insert({ request_id: r.id, event_type: "signed_copy_viewed_by_admin" });
  };
  const downloadSigned = async (r: any) => {
    const u = await getReceiptSignedUrl(r);
    if (!u) { toast({ title: "Signed copy not available", variant: "destructive" }); return; }
    const a = document.createElement("a"); a.href = u; a.download = `signed-coc-${r.id.slice(0,8)}.html`; document.body.appendChild(a); a.click(); a.remove();
  };
  const copySignedLinkRow = async (r: any) => {
    const u = await getReceiptSignedUrl(r);
    if (!u) { toast({ title: "Signed copy not available", variant: "destructive" }); return; }
    await navigator.clipboard.writeText(u);
    toast({ title: "Signed copy link copied (valid 7 days)" });
    await (supabase as any).from("code_of_conduct_events").insert({ request_id: r.id, event_type: "signed_copy_link_copied" });
  };
  const sendSignedCopyRow = async (r: any, mode: "admin" | "member") => {
    try {
      const { data, error } = await supabase.functions.invoke("send-coc-signed-copy", { body: { request_id: r.id, mode } });
      if (error) throw error;
      if ((data as any)?.ok === false) throw new Error((data as any).message);
      toast({ title: `Signed copy emailed to ${mode}` });
      loadRequests();
    } catch (e: any) { toast({ title: "Send failed", description: e?.message, variant: "destructive" }); }
  };
  const regenSigned = async (r: any) => {
    try {
      const { data, error } = await supabase.functions.invoke("code-of-conduct-public", { body: { action: "admin_regenerate_receipt", request_id: r.id } });
      if (error) throw error;
      if ((data as any)?.ok === false) throw new Error((data as any).message);
      toast({ title: "Signed copy regenerated" });
      loadRequests();
    } catch (e: any) { toast({ title: "Could not regenerate", description: e?.message, variant: "destructive" }); }
  };
  const openSignedRecord = async (r: any) => {
    setSignedRecord(r);
    const [{ data: ev }, url] = await Promise.all([
      (supabase as any).from("code_of_conduct_events").select("*").eq("request_id", r.id).order("created_at", { ascending: true }),
      getReceiptSignedUrl(r),
    ]);
    setSignedRecordEvents(ev || []);
    setSignedRecordReceiptUrl(url);
  };
  const cancelRequestRow = async (r: any) => {
    if (!confirm("Cancel this request? Link will stop working.")) return;
    await (supabase as any).from("code_of_conduct_requests").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", r.id);
    await (supabase as any).from("code_of_conduct_events").insert({ request_id: r.id, event_type: "request_cancelled" });
    toast({ title: "Request cancelled" });
    loadRequests();
  };
  const applyDefaultAgreementHtml = () => {
    const hasContent = tpl?.html_content && tpl.html_content.trim() !== "" && tpl.html_content !== DEFAULT_AGREEMENT_HTML;
    if (hasContent && !confirm("This will replace the current agreement body. Continue?")) return;
    setTpl({ ...tpl, html_content: DEFAULT_AGREEMENT_HTML });
    toast({ title: "Default agreement text applied", description: "Click Save Template to persist." });
  };
  const applyArchiveRecipients = () => {
    const list = archiveInput.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    const invalid = list.filter((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    if (invalid.length) { toast({ title: "Invalid email(s)", description: invalid.join(", "), variant: "destructive" }); return false; }
    setTpl({ ...tpl, signed_copy_recipient_emails: list });
    return true;
  };


  const filtered = filter === "all"
    ? requests
    : filter === "failed"
      ? requests.filter((r) => !!r.last_email_error_code)
      : requests.filter((r) => r.status === filter);

  const checklist: ChecklistItem[] = useMemo(() => {
    const t = tpl || {};
    const hasFromEmail = !!t.from_email || !!diag?.has_email_from_address;
    const hasFromName = !!t.from_name || !!diag?.has_email_from_name;
    const items: ChecklistItem[] = [
      { key: "from_email", label: "Sender email configured (template or EMAIL_FROM_ADDRESS secret)", ok: hasFromEmail, required: true, hint: "Use an address on a domain verified with your email provider." },
      { key: "from_name", label: "Sender name configured (template or EMAIL_FROM_NAME secret)", ok: hasFromName, required: true },
      { key: "email_subject", label: "Email subject added", ok: !!t.email_subject, required: true },
      { key: "email_body", label: "Email body added", ok: !!t.email_body, required: true },
      { key: "doc", label: "PDF or HTML document added", ok: !!(t.template_pdf_url || t.html_content), required: true },
      { key: "whatsapp", label: "WhatsApp redirect URL added", ok: !!t.whatsapp_redirect_url, required: true },
      { key: "api_key", label: "RESEND_API_KEY configured in backend secrets", ok: !!diag?.has_resend_api_key, required: true, hint: "Stored securely in backend secrets — never entered in this UI." },
      { key: "test", label: "Test email sent successfully", ok: !!(lastTestResult?.ok || (diag?.last_attempt?.status === "sent" && !diag?.last_attempt?.last_email_error_code)), required: false },
    ];
    return items;
  }, [tpl, diag, lastTestResult]);

  const setupComplete = checklist.filter((c) => c.required).every((c) => c.ok);
  const lastAttempt = diag?.last_attempt;

  if (!isAdmin) {
    return <div className="max-w-[900px]"><PageHead title="Code of Conduct" sub="Admin only." /></div>;
  }

  if (!tpl) return <div className="p-6 text-[12.5px] text-muted-foreground">Loading…</div>;

  return (
    <div className="max-w-[1200px]">
      <PageHead title="Code of Conduct" sub="Configure the agreement template, set up your sender, and track every signing request." />
      <div className="flex gap-1 border-b border-line mb-5 flex-wrap">
        {(["setup", "template", "rules", "requests", "diagnostics"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-[13px] font-medium border-b-2 -mb-[2px] ${tab === t ? "border-black text-black" : "border-transparent text-muted-foreground hover:text-black"}`}>
            {t === "setup" ? "Email Setup" : t === "template" ? "Template" : t === "rules" ? "Trigger Rules" : t === "requests" ? `Requests (${requests.length})` : "Diagnostics"}
          </button>
        ))}
      </div>

      {tab === "setup" && (
        <div className="space-y-5">
          <div className={`rounded-xl border p-4 ${setupComplete ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
            <div className="font-semibold text-[13px]">{setupComplete ? "✓ Email setup complete — you can send Code of Conduct emails." : "Email setup incomplete — complete the checklist before sending Code of Conduct emails."}</div>
          </div>

          <div className="bg-white border border-line rounded-xl p-6 space-y-4">
            <SectionLabel>Email Sending Setup</SectionLabel>
            <div className="text-[12.5px] text-muted-foreground -mt-2">Tell members who the email comes from. The API key stays in backend secrets — never entered here.</div>
            <Grid>
              <Field label="Sender email override (leave blank to use EMAIL_FROM_ADDRESS secret)" error={errors.from_email}>
                <Input value={tpl.from_email || ""} onChange={(v) => setTpl({ ...tpl, from_email: v })} placeholder={diag?.has_email_from_address ? "(using secret)" : "team@yourdomain.com"} />
                <div className="text-[10.5px] text-muted-foreground mt-1">{diag?.has_email_from_address ? "Backend secret EMAIL_FROM_ADDRESS is set — leave blank to use it." : "No secret set. Use a verified domain in your Resend account."}</div>
              </Field>
              <Field label="Sender name override (leave blank to use EMAIL_FROM_NAME secret)" error={errors.from_name}>
                <Input value={tpl.from_name || ""} onChange={(v) => setTpl({ ...tpl, from_name: v })} placeholder={diag?.has_email_from_name ? "(using secret)" : "IPC Control Center"} />
              </Field>
              <Field label="Reply-to email (optional)" error={errors.reply_to_email}>
                <Input value={tpl.reply_to_email || ""} onChange={(v) => setTpl({ ...tpl, reply_to_email: v })} placeholder="support@yourdomain.com" />
              </Field>
              <Field label="Test recipient email" error={errors.test_recipient_email}>
                <Input value={tpl.test_recipient_email || ""} onChange={(v) => setTpl({ ...tpl, test_recipient_email: v })} placeholder="your-own@email.com" />
              </Field>
            </Grid>

            <div className="border-t border-line pt-4 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <SectionLabel>Email Copy</SectionLabel>
                <button type="button" onClick={applyDefaultEmailCopy} className="text-[11.5px] px-2.5 py-1 border border-line rounded hover:bg-slate-50">Use Default Email Copy</button>
              </div>
              <div className="text-[11.5px] text-muted-foreground -mt-2">Supports {"{{member_name}}"}, {"{{program_name}}"}, {"{{signing_link}}"}, {"{{expiry_days}}"}, {"{{expiry_date}}"}, {"{{company_name}}"}, {"{{support_email}}"}.</div>
              <Field label="Email subject" error={errors.email_subject}>
                <Input value={tpl.email_subject || ""} onChange={(v) => setTpl({ ...tpl, email_subject: v })} placeholder={DEFAULT_EMAIL_SUBJECT} />
              </Field>
              <Field label="Email body" error={errors.email_body}>
                <TextArea value={tpl.email_body || ""} onChange={(v) => setTpl({ ...tpl, email_body: v })} rows={10} />
              </Field>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              {lastSavedAt && <span className="text-[11.5px] text-muted-foreground">Last saved: {new Date(lastSavedAt).toLocaleString()}</span>}
              <button onClick={saveEmailSettings} disabled={savingTpl} className={`ipc-btn ${savedEmailFlash ? "bg-[hsl(var(--success))] text-primary-foreground" : "ipc-btn-black"}`}>{savingTpl ? "Saving..." : savedEmailFlash ? "Saved ✓" : "Save Email Settings"}</button>
            </div>
            {saveError && <div className="text-[12px] text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">Save failed: {saveError}</div>}
          </div>


          <div className="bg-white border border-line rounded-xl p-6 space-y-3">
            <SectionLabel>Email Setup Checklist</SectionLabel>
            <ul className="space-y-1.5">
              {checklist.map((item) => (
                <li key={item.key} className="flex items-start gap-2 text-[12.5px]">
                  <span className={`mt-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold ${item.ok ? "bg-emerald-100 text-emerald-700" : item.required ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>
                    {item.ok ? "✓" : item.required ? "!" : "·"}
                  </span>
                  <div>
                    <div className={item.ok ? "text-slate-700" : "text-slate-900 font-medium"}>{item.label}</div>
                    {item.hint && <div className="text-[10.5px] text-muted-foreground">{item.hint}</div>}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-white border border-line rounded-xl p-6 space-y-3">
            <SectionLabel>Send Test Email</SectionLabel>
            <div className="text-[12.5px] text-muted-foreground">Uses your current sender and the active template. Will be marked <code>[TEST]</code> in the subject.</div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[260px]">
                <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Test recipient</label>
                <Input value={tpl.test_recipient_email || ""} onChange={(v) => setTpl({ ...tpl, test_recipient_email: v })} placeholder="you@example.com" />
              </div>
              <button onClick={sendTestEmail} disabled={sendingTest} className="ipc-btn ipc-btn-black">
                {sendingTest ? "Sending…" : "Send Test Email"}
              </button>
            </div>
            {lastTestResult?.ok && (
              <div className="text-[12px] bg-emerald-50 border border-emerald-200 text-emerald-800 rounded p-2">
                Test sent. Provider id: <code>{lastTestResult.provider_message_id || "—"}</code> · {lastTestResult.sent_at ? new Date(lastTestResult.sent_at).toLocaleString() : ""}
              </div>
            )}
            {lastTestResult && !lastTestResult.ok && (
              <div className="text-[12px] bg-rose-50 border border-rose-200 text-rose-700 rounded p-2">
                <div className="font-medium">[{lastTestResult.error_code}] {lastTestResult.message}</div>
                <div className="text-[11px] mt-1 opacity-80">{errorHint(lastTestResult.error_code)}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "template" && (
        <div className="bg-white border border-line rounded-xl p-6 space-y-4">
          <SectionLabel>Template Settings</SectionLabel>
          <Grid>
            <Field label="Template name" error={errors.name}><Input value={tpl.name || ""} onChange={(v) => setTpl({ ...tpl, name: v })} /></Field>
            <Field label="Version" error={errors.version}><Input value={tpl.version || ""} onChange={(v) => setTpl({ ...tpl, version: v })} /></Field>
            <Field label="Document title" error={errors.document_title}><Input value={tpl.document_title || ""} onChange={(v) => setTpl({ ...tpl, document_title: v })} /></Field>
            <Field label="Program name" error={errors.program_name}><Input value={tpl.program_name || ""} onChange={(v) => setTpl({ ...tpl, program_name: v })} /></Field>
            <Field label="Party A (company legal name)" error={errors.party_a_name}><Input value={tpl.party_a_name || ""} onChange={(v) => setTpl({ ...tpl, party_a_name: v })} /></Field>
            <Field label="Link expiry (days)" error={errors.expiry_days}><Input type="number" value={String(tpl.expiry_days ?? 7)} onChange={(v) => setTpl({ ...tpl, expiry_days: Number(v) || 7 })} /></Field>
          </Grid>

          <SectionLabel>Agreement Document</SectionLabel>
          <Grid>
            <Field label="PDF URL (or upload)" error={errors.template_pdf_url}>
              <Input value={tpl.template_pdf_url || ""} onChange={(v) => setTpl({ ...tpl, template_pdf_url: v })} placeholder="https://…" />
              <input type="file" accept="application/pdf" onChange={(e) => e.target.files?.[0] && uploadPdf(e.target.files[0])}
                className="mt-2 text-[12px]" disabled={uploading} />
              {uploading && <div className="text-[11px] text-slate-500 mt-1">Uploading…</div>}
            </Field>
            <Field label="WhatsApp group redirect URL" error={errors.whatsapp_redirect_url}><Input value={tpl.whatsapp_redirect_url || ""} onChange={(v) => setTpl({ ...tpl, whatsapp_redirect_url: v })} placeholder="https://chat.whatsapp.com/…" /></Field>
          </Grid>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <SectionLabel>Agreement Document Body (HTML)</SectionLabel>
            <div className="flex gap-2">
              <button type="button" onClick={applyDefaultAgreementHtml} className="text-[11.5px] px-2.5 py-1 border border-line rounded hover:bg-slate-50">Generate Default Agreement Text</button>
              <button type="button" onClick={() => { const w = window.open("", "_blank"); if (w) { w.document.write(`<!doctype html><html><head><meta charset='utf-8'><title>Agreement Preview</title><style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:780px;margin:40px auto;padding:24px;color:#0f172a;line-height:1.55}h2{font-size:18px;margin-top:24px}h3{font-size:14px;margin-top:18px}</style></head><body>${tpl.html_content || "<p style='color:#94a3b8'>No agreement body yet — click Generate Default Agreement Text.</p>"}</body></html>`); w.document.close(); } }} className="text-[11.5px] px-2.5 py-1 border border-line rounded hover:bg-slate-50">Preview Agreement</button>
            </div>
          </div>
          <div className="text-[11.5px] text-muted-foreground -mt-2">Rendered on the public signing page as the Google Docs-style agreement. PDF (above) remains available as a reference attachment.</div>
          <Field label="HTML agreement body">
            <TextArea value={tpl.html_content || ""} onChange={(v) => setTpl({ ...tpl, html_content: v })} rows={14} />
          </Field>
          <Field label="Success page message">
            <TextArea value={tpl.success_page_message || ""} onChange={(v) => setTpl({ ...tpl, success_page_message: v })} rows={2} placeholder="Your Code of Conduct has been acknowledged successfully." />
          </Field>

          <SectionLabel>Signed Copy Distribution</SectionLabel>
          <div className="text-[11.5px] text-muted-foreground -mt-2">After a member signs, the signed receipt is generated and emailed to the recipients below.</div>
          <Field label="Archive recipient emails (comma separated)">
            <Input value={archiveInput} onChange={setArchiveInput} placeholder="ops@yourdomain.com, records@yourdomain.com" />
            <div className="text-[10.5px] text-muted-foreground mt-1">If empty, EMAIL_REPLY_TO will be used as a fallback.</div>
          </Field>
          <label className="flex items-center gap-2 text-[12.5px]">
            <input type="checkbox" checked={!!tpl.send_signed_copy_to_member} onChange={(e) => setTpl({ ...tpl, send_signed_copy_to_member: e.target.checked })} className="w-4 h-4" />
            <span>Also email the signed copy to the member after signing</span>
          </label>


          <div className="flex items-center justify-between gap-3 flex-wrap">
            <SectionLabel>Email Body</SectionLabel>
            <button type="button" onClick={applyDefaultEmailCopy} className="text-[11.5px] px-2.5 py-1 border border-line rounded hover:bg-slate-50">Use Default Email Copy</button>
          </div>
          <div className="text-[11.5px] text-muted-foreground -mt-2">Sender is set in the <button onClick={() => setTab("setup")} className="underline">Email Setup</button> tab. Body must include {"{{signing_link}}"}.</div>

          <Field label="Email subject" error={errors.email_subject}><Input value={tpl.email_subject || ""} onChange={(v) => setTpl({ ...tpl, email_subject: v })} placeholder="Action Required: Sign Your IPC Diamond Membership Code of Conduct" /></Field>
          <Field label="Email body (supports {{member_name}}, {{program_name}}, {{signing_link}}, {{expiry_date}}, {{company_name}})" error={errors.email_body}>
            <TextArea value={tpl.email_body || ""} onChange={(v) => setTpl({ ...tpl, email_body: v })} rows={8} />
          </Field>

          <div className="flex items-center justify-end gap-3 pt-2">
            {lastSavedAt && <span className="text-[11.5px] text-muted-foreground">Last saved: {new Date(lastSavedAt).toLocaleString()}</span>}
            <button onClick={() => { if (applyArchiveRecipients()) saveTpl(); }} disabled={savingTpl} className={`ipc-btn ${savedTemplateFlash ? "bg-[hsl(var(--success))] text-primary-foreground" : "ipc-btn-black"}`}>
              {savingTpl ? "Saving..." : savedTemplateFlash ? "Saved ✓" : "Save Template"}
            </button>
          </div>
          {saveError && <div className="text-[12px] text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">Save failed: {saveError}</div>}
        </div>
      )}

      {tab === "requests" && (
        <div className="bg-white border border-line rounded-xl p-6">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {["all", "ready_to_send", "sent", "viewed", "signed", "failed", "expired", "cancelled"].map((s) => (
              <button key={s} onClick={() => setFilter(s)}
                className={`px-3 py-1.5 rounded-full text-[11.5px] font-medium border ${filter === s ? "bg-black text-white border-black" : "bg-white border-line text-muted-foreground hover:text-black"}`}>
                {s === "all" ? `All (${requests.length})` : `${STATUS_LABELS[s] || s} (${s === "failed" ? requests.filter(r => !!r.last_email_error_code).length : requests.filter(r => r.status === s).length})`}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead className="text-left text-muted-foreground border-b border-line">
                <tr>
                  <th className="py-2 pr-3 font-medium">Request ID</th>
                  <th className="py-2 pr-3 font-medium">Member</th>
                  <th className="py-2 pr-3 font-medium">Email</th>
                  <th className="py-2 pr-3 font-medium">Program</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Sent</th>
                  <th className="py-2 pr-3 font-medium">Viewed</th>
                  <th className="py-2 pr-3 font-medium">Signed</th>
                  <th className="py-2 pr-3 font-medium">Token expires</th>
                  <th className="py-2 pr-3 font-medium">Active token</th>
                  <th className="py-2 pr-3 font-medium">Last error</th>
                  <th className="py-2 pr-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && <tr><td colSpan={12} className="py-6 text-center text-muted-foreground">No requests.</td></tr>}
                {filtered.map((r) => {
                  const hasActiveToken = !!r.token_hash && !!r.token_expires_at && new Date(r.token_expires_at) > new Date() && !["cancelled", "expired"].includes(r.status);
                  return (
                  <tr key={r.id} className="border-b border-line/50 align-top">
                    <td className="py-2 pr-3"><code className="text-[11px]">{r.id}</code></td>
                    <td className="py-2 pr-3 min-w-[140px]">{r.member_name}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{r.member_email}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{r.program_name || "—"}</td>
                    <td className="py-2 pr-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10.5px] font-medium border ${r.last_email_error_code ? "bg-rose-50 text-rose-700 border-rose-200" : r.status === "signed" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : r.status === "sent" ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-slate-100 text-slate-600 border-slate-200"}`}>
                        {r.last_email_error_code ? "Failed" : STATUS_LABELS[r.status] || r.status}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">{r.sent_at ? new Date(r.sent_at).toLocaleString() : "—"}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{r.viewed_at ? new Date(r.viewed_at).toLocaleString() : "—"}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{r.signed_at ? new Date(r.signed_at).toLocaleString() : "—"}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{r.token_expires_at ? new Date(r.token_expires_at).toLocaleString() : "—"}</td>
                    <td className="py-2 pr-3"><span className={hasActiveToken ? "text-emerald-700" : "text-muted-foreground"}>{hasActiveToken ? "Yes" : "No"}</span></td>
                    <td className="py-2 pr-3 text-rose-600 max-w-[220px] truncate" title={r.last_email_error || ""}>{r.last_email_error_code ? `[${r.last_email_error_code}] ${r.last_email_error || ""}` : "—"}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <div className="flex gap-1.5 flex-wrap">
                        <button onClick={() => retrySend(r)} disabled={retryingId === r.id} className="text-[11px] px-2 py-1 border border-line rounded hover:bg-slate-50">{retryingId === r.id ? "Sending…" : (r.sent_at ? "Resend" : "Send")}</button>
                        <button onClick={() => copySigningLink(r)} className="text-[11px] px-2 py-1 border border-line rounded hover:bg-slate-50">Copy Signing Link</button>
                        <button onClick={() => openEvents(r)} className="text-[11px] px-2 py-1 border border-line rounded hover:bg-slate-50">Events</button>
                        {r.paid_pipeline_lead_id ? <Link to={`/paid-pipeline?lead=${r.paid_pipeline_lead_id}`} className="text-[11px] px-2 py-1 border border-line rounded hover:bg-slate-50 text-blue-700">Open Lead</Link>
                          : r.crm_lead_id ? <Link to={`/crm?lead=${r.crm_lead_id}`} className="text-[11px] px-2 py-1 border border-line rounded hover:bg-slate-50 text-blue-700">Open Lead</Link>
                          : null}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "rules" && <CodeOfConductRulesTab />}

      {tab === "diagnostics" && (
        <div className="bg-white border border-line rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <SectionLabel>Live Diagnostics</SectionLabel>
            <button onClick={loadDiag} disabled={diagLoading} className="text-[11.5px] px-2.5 py-1 border border-line rounded hover:bg-slate-50">{diagLoading ? "Refreshing…" : "Refresh"}</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[12.5px]">
            <DiagRow label="Provider" value="Resend" />
            <DiagRow label="RESEND_API_KEY" value={diag?.has_resend_api_key ? "Configured" : "Missing"} hint={diag?.has_resend_api_key ? "Stored securely in backend secrets. Value never exposed." : "Add RESEND_API_KEY in backend secrets."} bad={!diag?.has_resend_api_key} />
            <DiagRow label="EMAIL_FROM_ADDRESS" value={diag?.has_email_from_address ? "Configured" : "Missing"} hint={diag?.has_email_from_address ? "Default sender email secret is set." : "Add EMAIL_FROM_ADDRESS in backend secrets."} bad={!diag?.has_email_from_address && !tpl?.from_email} />
            <DiagRow label="EMAIL_FROM_NAME" value={diag?.has_email_from_name ? "Configured" : "Missing"} hint={diag?.has_email_from_name ? "Default sender name secret is set." : "Add EMAIL_FROM_NAME in backend secrets."} bad={!diag?.has_email_from_name && !tpl?.from_name} />
            <DiagRow label="EMAIL_REPLY_TO" value={diag?.has_email_reply_to ? "Configured" : "Not set (optional)"} hint={diag?.has_email_reply_to ? "Default reply-to secret is set." : "Optional — replies will go to the sender address."} />
            <DiagRow label="Resolved sender email" value={diag?.resolved_from_email || "—"} hint={diag?.sender_source === "template" ? "Source: template override" : diag?.sender_source === "secret" ? "Source: EMAIL_FROM_ADDRESS secret" : "No sender configured"} bad={!diag?.resolved_from_email} />
            <DiagRow label="Resolved sender name" value={diag?.resolved_from_name || "—"} bad={!diag?.resolved_from_name} />
            <DiagRow label="Resolved reply-to" value={diag?.resolved_reply_to || "—"} />
            <DiagRow label="Test recipient" value={tpl?.test_recipient_email || "—"} />
          </div>
          {tpl?.from_email === "onboarding@resend.dev" && (
            <div className="text-[11.5px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
              <code>onboarding@resend.dev</code> only delivers to your Resend account owner. Switch to a verified domain sender for real members.
            </div>
          )}
          {lastAttempt && (
            <div className="border border-line rounded p-3 text-[12px]">
              <div className="font-medium text-slate-700 mb-1">Last attempt</div>
              <div>Recipient: <span className="text-muted-foreground">{lastAttempt.member_email}</span></div>
              <div>Status: <span className="text-muted-foreground">{lastAttempt.last_email_error_code ? `Failed [${lastAttempt.last_email_error_code}]` : lastAttempt.status}</span></div>
              <div>Time: <span className="text-muted-foreground">{(lastAttempt.last_email_attempt_at || lastAttempt.sent_at) ? new Date(lastAttempt.last_email_attempt_at || lastAttempt.sent_at).toLocaleString() : "—"}</span></div>
              {lastAttempt.provider_message_id && <div>Provider id: <code>{lastAttempt.provider_message_id}</code></div>}
              {lastAttempt.last_email_error && <div className="text-rose-600 mt-1">Error: {lastAttempt.last_email_error}</div>}
            </div>
          )}
          <button onClick={() => setTab("setup")} className="ipc-btn ipc-btn-ghost">Open Email Setup</button>
        </div>
      )}

      {eventsFor && (
        <div className="fixed inset-0 bg-black/40 z-50 flex justify-end" onClick={() => setEventsFor(null)}>
          <div className="w-full max-w-[480px] bg-white h-full overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-[14px] font-semibold">Events</div>
                <div className="text-[11.5px] text-muted-foreground">{eventsFor.member_name} • {eventsFor.member_email}</div>
              </div>
              <button onClick={() => setEventsFor(null)} className="text-[12px] text-muted-foreground">Close</button>
            </div>
            <div className="space-y-2">
              {events.length === 0 && <div className="text-[12px] text-muted-foreground">No events recorded.</div>}
              {events.map((ev) => (
                <div key={ev.id} className="border border-line rounded p-2 text-[12px]">
                  <div className="flex justify-between"><span className="font-medium">{ev.event_type}</span><span className="text-muted-foreground">{new Date(ev.created_at).toLocaleString()}</span></div>
                  {ev.metadata && <pre className="text-[11px] text-slate-600 mt-1 whitespace-pre-wrap break-all">{JSON.stringify(ev.metadata, null, 2)}</pre>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function errorHint(code?: string) {
  switch (code) {
    case "MISSING_RESEND_API_KEY": return "Add RESEND_API_KEY in backend secrets.";
    case "MISSING_EMAIL_FROM_ADDRESS": return "Add EMAIL_FROM_ADDRESS in backend secrets (or set a template From email).";
    case "MISSING_EMAIL_FROM_NAME": return "Add EMAIL_FROM_NAME in backend secrets (or set a template From name).";
    case "MISSING_FROM_EMAIL": return "Add the sender email connected to your email provider in Email Setup.";
    case "RESEND_DOMAIN_NOT_VERIFIED": return "Use a verified sender/domain inside Resend.";
    case "EMAIL_PROVIDER_REJECTED": return "Your email provider rejected the request. Check sender domain, recipient, and provider limits.";
    case "NO_TEMPLATE_CONFIGURED":
    case "TEMPLATE_MISSING_EMAIL_BODY": return "Save the Code of Conduct template first.";
    default: return "Check the diagnostics tab and provider logs.";
  }
}

function blankTpl() {
  return {
    name: "Diamond Membership Code of Conduct",
    program_name: "IPC Diamond Membership",
    document_title: "Diamond Membership Code of Conduct",
    party_a_name: "India Photographers' Club",
    version: "1.0",
    is_active: true,
    expiry_days: 7,
    html_content: "",
    template_pdf_url: "",
    whatsapp_redirect_url: "",
    success_page_message: "",
    from_email: "",
    from_name: "IPC Control Center",
    reply_to_email: "",
    test_recipient_email: "",
    email_subject: DEFAULT_EMAIL_SUBJECT,
    email_body: DEFAULT_EMAIL_BODY,

  };
}

function Grid({ children }: { children: React.ReactNode }) { return <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>; }
function Field({ label, children, error }: { label: string; children: React.ReactNode; error?: string }) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">{label}</label>
      {children}
      {error && <div className="text-[11px] text-rose-600 mt-1">{error}</div>}
    </div>
  );
}
function Input(p: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return <input type={p.type || "text"} value={p.value} onChange={(e) => p.onChange(e.target.value)} placeholder={p.placeholder} className="w-full border border-line rounded-md px-3 py-2 text-[13px]" />;
}
function TextArea(p: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return <textarea value={p.value} onChange={(e) => p.onChange(e.target.value)} placeholder={p.placeholder} rows={p.rows || 3} className="w-full border border-line rounded-md px-3 py-2 text-[13px] font-mono" />;
}
function DiagRow({ label, value, hint, bad }: { label: string; value: string; hint?: string; bad?: boolean }) {
  return (
    <div className={`border rounded p-2 ${bad ? "border-rose-200 bg-rose-50" : "border-line"}`}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-[12.5px] ${bad ? "text-rose-700" : "text-slate-800"}`}>{value}</div>
      {hint && <div className="text-[10.5px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}
