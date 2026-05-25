import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHead, SectionLabel } from "@/components/ui-bits";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft", ready_to_send: "Ready", sent: "Sent", viewed: "Viewed",
  signed: "Signed", expired: "Expired", cancelled: "Cancelled", failed: "Failed",
};

const REQUIRED_FIELDS: { key: string; label: string }[] = [
  { key: "name", label: "Template name" },
  { key: "document_title", label: "Document title" },
  { key: "program_name", label: "Program name" },
  { key: "party_a_name", label: "Party A / company legal name" },
  { key: "version", label: "Version" },
  { key: "expiry_days", label: "Link expiry days" },
  { key: "whatsapp_redirect_url", label: "WhatsApp group URL" },
  { key: "from_name", label: "From name" },
  { key: "from_email", label: "From email" },
  { key: "email_subject", label: "Email subject" },
  { key: "email_body", label: "Email body" },
];

export default function CodeOfConductAdmin() {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<"template" | "requests" | "diagnostics">("template");
  const [tpl, setTpl] = useState<any>(null);
  const [savingTpl, setSavingTpl] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [requests, setRequests] = useState<any[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [eventsFor, setEventsFor] = useState<any | null>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const loadTpl = async () => {
    const { data } = await (supabase as any).from("code_of_conduct_templates").select("*").eq("is_active", true).order("created_at", { ascending: false }).limit(1);
    setTpl(data?.[0] || blankTpl());
    if (data?.[0]?.updated_at) setLastSavedAt(data[0].updated_at);
  };
  const loadRequests = async () => {
    const { data } = await (supabase as any).from("code_of_conduct_requests").select("*").order("created_at", { ascending: false }).limit(200);
    setRequests(data || []);
  };
  useEffect(() => { loadTpl(); loadRequests(); }, []);

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    for (const f of REQUIRED_FIELDS) {
      const v = tpl?.[f.key];
      if (v === undefined || v === null || String(v).trim() === "") e[f.key] = `${f.label} is required`;
    }
    if (tpl?.from_email && !String(tpl.from_email).includes("@")) e.from_email = "From email looks invalid";
    if (tpl?.expiry_days && (Number(tpl.expiry_days) < 1 || Number(tpl.expiry_days) > 90)) e.expiry_days = "Expiry must be 1–90 days";
    if (!tpl?.template_pdf_url && !tpl?.html_content) e.template_pdf_url = "PDF URL or HTML body is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const saveTpl = async () => {
    if (savingTpl) return;
    if (!validate()) {
      toast({ title: "Please fix missing fields", description: "Required fields are highlighted in red.", variant: "destructive" });
      return;
    }
    setSavingTpl(true);
    try {
      const payload = { ...tpl }; delete payload.id;
      if (tpl?.id) {
        const { error } = await (supabase as any).from("code_of_conduct_templates").update(payload).eq("id", tpl.id);
        if (error) throw error;
      } else {
        const { data, error } = await (supabase as any).from("code_of_conduct_templates").insert(payload).select().single();
        if (error) throw error;
        setTpl(data);
      }
      toast({ title: "Code of Conduct template saved" });
      setLastSavedAt(new Date().toISOString());
      await loadTpl();
    } catch (e: any) {
      toast({ title: "Template save failed", description: e?.message || "Unknown error", variant: "destructive" });
    } finally { setSavingTpl(false); }
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
    if (!testEmail || !testEmail.includes("@")) { toast({ title: "Enter a valid test email", variant: "destructive" }); return; }
    if (!tpl?.id) { toast({ title: "Save the template first", variant: "destructive" }); return; }
    setSendingTest(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-code-of-conduct-email", {
        body: { is_test: true, member_name: "Test Recipient", member_email: testEmail, template_id: tpl.id, origin: window.location.origin },
      });
      if (error) throw error;
      if ((data as any)?.ok === false) throw new Error(`[${(data as any).error_code}] ${(data as any).message}`);
      toast({ title: "Test email sent", description: `Sent to ${testEmail}` });
    } catch (e: any) {
      toast({ title: "Test email failed", description: e?.message || "Unknown error", variant: "destructive" });
    } finally { setSendingTest(false); }
  };

  const openEvents = async (r: any) => {
    setEventsFor(r);
    const { data } = await (supabase as any).from("code_of_conduct_events").select("*").eq("request_id", r.id).order("created_at", { ascending: true });
    setEvents(data || []);
  };

  const copySigningLink = async (r: any) => {
    // We can't reconstruct token from hash; copy a quick-help link to the requests panel for admin to resend instead.
    // Best UX: ask admin to use Resend to get a fresh link, but if a public signing page can resolve by hash, show error.
    toast({ title: "Use Resend to get a new link", description: "Signing tokens are write-only hashed; resend to generate a fresh link." });
    await (supabase as any).from("code_of_conduct_events").insert({ request_id: r.id, event_type: "signing_link_copied_by_admin" });
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

  const filtered = filter === "all"
    ? requests
    : filter === "failed"
      ? requests.filter((r) => !!r.last_email_error_code)
      : requests.filter((r) => r.status === filter);

  const lastAttempt = useMemo(() => requests.find((r) => r.last_email_attempt_at || r.sent_at), [requests]);

  if (!isAdmin) {
    return <div className="max-w-[900px]"><PageHead title="Code of Conduct" sub="Admin only." /></div>;
  }

  return (
    <div className="max-w-[1200px]">
      <PageHead title="Code of Conduct" sub="Configure the agreement template and track every signing request." />
      <div className="flex gap-1 border-b border-line mb-5">
        {(["template", "requests", "diagnostics"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-[13px] font-medium border-b-2 -mb-[2px] ${tab === t ? "border-black text-black" : "border-transparent text-muted-foreground hover:text-black"}`}>
            {t === "template" ? "Template" : t === "requests" ? `Requests (${requests.length})` : "Diagnostics"}
          </button>
        ))}
      </div>

      {tab === "template" && tpl && (
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
          <Field label="HTML body (used if no PDF)">
            <TextArea value={tpl.html_content || ""} onChange={(v) => setTpl({ ...tpl, html_content: v })} rows={6} />
          </Field>
          <Field label="Success page message">
            <TextArea value={tpl.success_page_message || ""} onChange={(v) => setTpl({ ...tpl, success_page_message: v })} rows={2} placeholder="Your Code of Conduct has been acknowledged successfully." />
          </Field>

          <SectionLabel>Email</SectionLabel>
          <Grid>
            <Field label="From name" error={errors.from_name}><Input value={tpl.from_name || ""} onChange={(v) => setTpl({ ...tpl, from_name: v })} placeholder="IPC Control Center" /></Field>
            <Field label="From email (requires verified Resend domain)" error={errors.from_email}><Input value={tpl.from_email || ""} onChange={(v) => setTpl({ ...tpl, from_email: v })} placeholder="onboarding@resend.dev" /></Field>
          </Grid>
          <Field label="Email subject" error={errors.email_subject}><Input value={tpl.email_subject || ""} onChange={(v) => setTpl({ ...tpl, email_subject: v })} placeholder="Action Required: Sign Your IPC Diamond Membership Code of Conduct" /></Field>
          <Field label="Email body (supports {{member_name}}, {{program_name}}, {{signing_link}}, {{expiry_date}}, {{company_name}})" error={errors.email_body}>
            <TextArea value={tpl.email_body || ""} onChange={(v) => setTpl({ ...tpl, email_body: v })} rows={8} />
          </Field>

          <div className="flex items-center justify-end gap-3 pt-2">
            {lastSavedAt && <span className="text-[11.5px] text-muted-foreground">Last saved: {new Date(lastSavedAt).toLocaleString()}</span>}
            <button onClick={saveTpl} disabled={savingTpl} className="ipc-btn ipc-btn-black">
              {savingTpl ? "Saving…" : "Save Template"}
            </button>
          </div>
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
                  <th className="py-2 pr-3 font-medium">Member</th>
                  <th className="py-2 pr-3 font-medium">Email</th>
                  <th className="py-2 pr-3 font-medium">Phone</th>
                  <th className="py-2 pr-3 font-medium">Program</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Sent</th>
                  <th className="py-2 pr-3 font-medium">Viewed</th>
                  <th className="py-2 pr-3 font-medium">Signed</th>
                  <th className="py-2 pr-3 font-medium">Error</th>
                  <th className="py-2 pr-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && <tr><td colSpan={10} className="py-6 text-center text-muted-foreground">No requests.</td></tr>}
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-line/50 align-top">
                    <td className="py-2 pr-3">{r.member_name}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{r.member_email}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{r.member_phone || "—"}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{r.program_name || "—"}</td>
                    <td className="py-2 pr-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10.5px] font-medium border ${r.last_email_error_code ? "bg-rose-50 text-rose-700 border-rose-200" : r.status === "signed" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : r.status === "sent" ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-slate-100 text-slate-600 border-slate-200"}`}>
                        {r.last_email_error_code ? "Failed" : STATUS_LABELS[r.status] || r.status}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">{r.sent_at ? new Date(r.sent_at).toLocaleString() : "—"}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{r.viewed_at ? new Date(r.viewed_at).toLocaleString() : "—"}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{r.signed_at ? new Date(r.signed_at).toLocaleString() : "—"}</td>
                    <td className="py-2 pr-3 text-rose-600 max-w-[220px] truncate" title={r.last_email_error || ""}>{r.last_email_error_code ? `[${r.last_email_error_code}] ${r.last_email_error || ""}` : "—"}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <div className="flex gap-1.5 flex-wrap">
                        <button onClick={() => retrySend(r)} disabled={retryingId === r.id} className="text-[11px] px-2 py-1 border border-line rounded hover:bg-slate-50">{retryingId === r.id ? "Sending…" : (r.sent_at ? "Resend" : "Send")}</button>
                        <button onClick={() => openEvents(r)} className="text-[11px] px-2 py-1 border border-line rounded hover:bg-slate-50">Events</button>
                        {r.paid_pipeline_lead_id ? <Link to={`/paid-pipeline?lead=${r.paid_pipeline_lead_id}`} className="text-[11px] px-2 py-1 border border-line rounded hover:bg-slate-50 text-blue-700">Open Lead</Link>
                          : r.crm_lead_id ? <Link to={`/crm?lead=${r.crm_lead_id}`} className="text-[11px] px-2 py-1 border border-line rounded hover:bg-slate-50 text-blue-700">Open Lead</Link>
                          : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "diagnostics" && (
        <div className="bg-white border border-line rounded-xl p-6 space-y-4">
          <SectionLabel>Email Diagnostics</SectionLabel>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[12.5px]">
            <DiagRow label="Provider" value="Resend" />
            <DiagRow label="From name" value={tpl?.from_name || "—"} />
            <DiagRow label="From email" value={tpl?.from_email || "—"} />
            <DiagRow label="RESEND_API_KEY configured" value="Configured (managed by backend)" hint="Test below to verify the key actually works." />
          </div>
          <div className="text-[11.5px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
            For real recipients, the From email must be on a verified Resend domain. <code>onboarding@resend.dev</code> only delivers to the Resend account owner's email.
          </div>

          {lastAttempt && (
            <div className="border border-line rounded p-3 text-[12px]">
              <div className="font-medium text-slate-700 mb-1">Last attempt</div>
              <div>Recipient: <span className="text-muted-foreground">{lastAttempt.member_email}</span></div>
              <div>Status: <span className="text-muted-foreground">{lastAttempt.last_email_error_code ? `Failed [${lastAttempt.last_email_error_code}]` : lastAttempt.status}</span></div>
              <div>Time: <span className="text-muted-foreground">{(lastAttempt.last_email_attempt_at || lastAttempt.sent_at) ? new Date(lastAttempt.last_email_attempt_at || lastAttempt.sent_at).toLocaleString() : "—"}</span></div>
              {lastAttempt.last_email_error && <div className="text-rose-600 mt-1">Error: {lastAttempt.last_email_error}</div>}
            </div>
          )}

          <div className="flex flex-wrap items-end gap-3 pt-1">
            <div className="flex-1 min-w-[260px]">
              <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Send Test Email</label>
              <input value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="you@example.com"
                className="w-full border border-line rounded-md px-3 py-2 text-[13px]" />
            </div>
            <button onClick={sendTestEmail} disabled={sendingTest || !tpl?.id} className="ipc-btn ipc-btn-black">
              {sendingTest ? "Sending…" : "Send Test Email"}
            </button>
          </div>
          {!tpl?.id && <div className="text-[11.5px] text-rose-600">Save the template first before sending a test.</div>}
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
    from_email: "onboarding@resend.dev",
    from_name: "IPC Control Center",
    email_subject: "",
    email_body: "",
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
function DiagRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border border-line rounded p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-[12.5px] text-slate-800">{value}</div>
      {hint && <div className="text-[10.5px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}
