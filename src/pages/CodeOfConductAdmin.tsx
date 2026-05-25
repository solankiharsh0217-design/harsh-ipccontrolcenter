import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHead, SectionLabel } from "@/components/ui-bits";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft", ready_to_send: "Ready", sent: "Sent", viewed: "Viewed",
  signed: "Signed", expired: "Expired", cancelled: "Cancelled",
};

export default function CodeOfConductAdmin() {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<"template" | "requests">("template");
  const [tpl, setTpl] = useState<any>(null);
  const [savingTpl, setSavingTpl] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [requests, setRequests] = useState<any[]>([]);
  const [filter, setFilter] = useState<string>("all");

  const loadTpl = async () => {
    const { data } = await (supabase as any).from("code_of_conduct_templates").select("*").eq("is_active", true).order("created_at", { ascending: false }).limit(1);
    setTpl(data?.[0] || blankTpl());
  };
  const loadRequests = async () => {
    const { data } = await (supabase as any).from("code_of_conduct_requests").select("*").order("created_at", { ascending: false }).limit(200);
    setRequests(data || []);
  };
  useEffect(() => { loadTpl(); loadRequests(); }, []);

  const saveTpl = async () => {
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
      toast({ title: "Template saved" });
      loadTpl();
    } catch (e: any) { toast({ title: "Save failed", description: e?.message, variant: "destructive" }); }
    finally { setSavingTpl(false); }
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

  const filtered = filter === "all" ? requests : requests.filter((r) => r.status === filter);

  if (!isAdmin) {
    return <div className="max-w-[900px]"><PageHead title="Code of Conduct" sub="Admin only." /></div>;
  }

  return (
    <div className="max-w-[1100px]">
      <PageHead title="Code of Conduct" sub="Configure the agreement template and track every signing request." />
      <div className="flex gap-1 border-b border-line mb-5">
        {(["template", "requests"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-[13px] font-medium border-b-2 -mb-[2px] ${tab === t ? "border-black text-black" : "border-transparent text-muted-foreground hover:text-black"}`}>
            {t === "template" ? "Template" : `Requests (${requests.length})`}
          </button>
        ))}
      </div>

      {tab === "template" && tpl && (
        <div className="bg-white border border-line rounded-xl p-6 space-y-4">
          <SectionLabel>Template Settings</SectionLabel>
          <Grid>
            <Field label="Template name"><Input value={tpl.name || ""} onChange={(v) => setTpl({ ...tpl, name: v })} /></Field>
            <Field label="Version"><Input value={tpl.version || ""} onChange={(v) => setTpl({ ...tpl, version: v })} /></Field>
            <Field label="Document title"><Input value={tpl.document_title || ""} onChange={(v) => setTpl({ ...tpl, document_title: v })} /></Field>
            <Field label="Program name"><Input value={tpl.program_name || ""} onChange={(v) => setTpl({ ...tpl, program_name: v })} /></Field>
            <Field label="Party A (company legal name)"><Input value={tpl.party_a_name || ""} onChange={(v) => setTpl({ ...tpl, party_a_name: v })} /></Field>
            <Field label="Link expiry (days)"><Input type="number" value={String(tpl.expiry_days ?? 7)} onChange={(v) => setTpl({ ...tpl, expiry_days: Number(v) || 7 })} /></Field>
          </Grid>

          <SectionLabel>Agreement Document</SectionLabel>
          <Grid>
            <Field label="PDF URL (or upload)">
              <Input value={tpl.template_pdf_url || ""} onChange={(v) => setTpl({ ...tpl, template_pdf_url: v })} placeholder="https://…" />
              <input type="file" accept="application/pdf" onChange={(e) => e.target.files?.[0] && uploadPdf(e.target.files[0])}
                className="mt-2 text-[12px]" disabled={uploading} />
              {uploading && <div className="text-[11px] text-slate-500 mt-1">Uploading…</div>}
            </Field>
            <Field label="WhatsApp group redirect URL"><Input value={tpl.whatsapp_redirect_url || ""} onChange={(v) => setTpl({ ...tpl, whatsapp_redirect_url: v })} placeholder="https://chat.whatsapp.com/…" /></Field>
          </Grid>
          <Field label="HTML body (used if no PDF)">
            <TextArea value={tpl.html_content || ""} onChange={(v) => setTpl({ ...tpl, html_content: v })} rows={6} />
          </Field>
          <Field label="Success page message">
            <TextArea value={tpl.success_page_message || ""} onChange={(v) => setTpl({ ...tpl, success_page_message: v })} rows={2} placeholder="Your Code of Conduct has been acknowledged successfully." />
          </Field>

          <SectionLabel>Email</SectionLabel>
          <Grid>
            <Field label="From name"><Input value={tpl.from_name || ""} onChange={(v) => setTpl({ ...tpl, from_name: v })} placeholder="IPC Control Center" /></Field>
            <Field label="From email (requires verified Resend domain)"><Input value={tpl.from_email || ""} onChange={(v) => setTpl({ ...tpl, from_email: v })} placeholder="onboarding@resend.dev" /></Field>
          </Grid>
          <Field label="Email subject"><Input value={tpl.email_subject || ""} onChange={(v) => setTpl({ ...tpl, email_subject: v })} placeholder="Action Required: Sign Your IPC Diamond Membership Code of Conduct" /></Field>
          <Field label="Email body (supports {{member_name}}, {{program_name}}, {{signing_link}}, {{expiry_date}}, {{company_name}})">
            <TextArea value={tpl.email_body || ""} onChange={(v) => setTpl({ ...tpl, email_body: v })} rows={8} />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={saveTpl} disabled={savingTpl} className="ipc-btn ipc-btn-black">
              {savingTpl ? "Saving…" : "Save Template"}
            </button>
          </div>
        </div>
      )}

      {tab === "requests" && (
        <div className="bg-white border border-line rounded-xl p-6">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {["all", "ready_to_send", "sent", "viewed", "signed", "expired", "cancelled"].map((s) => (
              <button key={s} onClick={() => setFilter(s)}
                className={`px-3 py-1.5 rounded-full text-[11.5px] font-medium border ${filter === s ? "bg-black text-white border-black" : "bg-white border-line text-muted-foreground hover:text-black"}`}>
                {s === "all" ? `All (${requests.length})` : `${STATUS_LABELS[s] || s} (${requests.filter(r => r.status === s).length})`}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead className="text-left text-muted-foreground border-b border-line">
                <tr>
                  <th className="py-2 pr-3 font-medium">Member</th>
                  <th className="py-2 pr-3 font-medium">Email</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Sent</th>
                  <th className="py-2 pr-3 font-medium">Signed</th>
                  <th className="py-2 pr-3 font-medium">Version</th>
                  <th className="py-2 pr-3 font-medium">Open</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">No requests.</td></tr>}
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-line/50">
                    <td className="py-2 pr-3">{r.member_name}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{r.member_email}</td>
                    <td className="py-2 pr-3">{STATUS_LABELS[r.status] || r.status}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{r.sent_at ? new Date(r.sent_at).toLocaleDateString() : "—"}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{r.signed_at ? new Date(r.signed_at).toLocaleDateString() : "—"}</td>
                    <td className="py-2 pr-3 text-muted-foreground">v{r.template_version || "—"}</td>
                    <td className="py-2 pr-3">
                      {r.paid_pipeline_lead_id ? <Link to={`/paid-pipeline?lead=${r.paid_pipeline_lead_id}`} className="text-blue-600 hover:underline">Paid</Link>
                        : r.crm_lead_id ? <Link to={`/crm?lead=${r.crm_lead_id}`} className="text-blue-600 hover:underline">CRM</Link>
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">{label}</label>{children}</div>;
}
function Input(p: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return <input type={p.type || "text"} value={p.value} onChange={(e) => p.onChange(e.target.value)} placeholder={p.placeholder} className="w-full border border-line rounded-md px-3 py-2 text-[13px]" />;
}
function TextArea(p: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return <textarea value={p.value} onChange={(e) => p.onChange(e.target.value)} placeholder={p.placeholder} rows={p.rows || 3} className="w-full border border-line rounded-md px-3 py-2 text-[13px] font-mono" />;
}
