/*
'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''
                                            
                                            FINAL LIVE ACCEPTANCE + SOURCE-OF-TRUTH CLEANUP PLAN

Code of Conduct — Same Day vs Next Day Email Setup

Context:

The Same Day / Next Day Code of Conduct email architecture is implemented and typecheck is GREEN.

Current routing:

Same Day

→ completed_within_1_day

→ Same Day Email Setup

Next Day or Later

→ completed_after_1_day

→ Next Day Email Setup

Each setup now independently controls:

- Subject

- Body

- From Email override

- From Name override

- Reply-To override

- Active state

- Version

- Updated By / Updated At

The edge function resolves the correct setup and snapshots the sender/content values on first send.

Current QA status:

Code and simulated routing are GREEN.

However, the actual delivered Same Day and Next Day emails have not yet been verified in a real inbox.

Goal:

1. Run two real live acceptance tests.

2. Confirm the received emails exactly match the selected setup.

3. After live acceptance, audit the duplicate/legacy Admin tabs and prepare a safe consolidation plan.

4. Do NOT delete legacy database fields yet.

Do NOT add new functionality.

Do NOT rebuild the Code of Conduct flow.

Do NOT alter signing, PDF, Wistia, Access Follow-up, token handling, bonus email, stage automation, resend logic or historical requests.

────────────────────────────

PART 1 — REAL SAME DAY EMAIL

────────────────────────────

Use a safe test member/email address.

Requirement:

The member must not have a previous successful Code of Conduct first send.

Go to:

Calling CRM

→ Client

→ Code of Conduct

→ Send Code of Conduct

→ Same Day

Before sending, capture:

- selected condition

- resolved setup

- subject

- From Name

- From Email

- Reply-To

- template/setup version

Expected:

condition:

completed_within_1_day

setup:

Same Day Email Setup

Send the email.

Then verify the ACTUAL RECEIVED EMAIL in the inbox.

Confirm:

- received subject = Same Day subject

- received body = Same Day body

- received From Name = Same Day sender name

- received From Email = resolved Same Day sender

- Reply-To = Same Day reply-to

- signing link works

- no Next Day content appears

Also confirm the request snapshots contain the same values.

PASS only if the actual inbox email matches.

────────────────────────────

PART 2 — REAL NEXT DAY EMAIL

────────────────────────────

Use a second safe test member/email.

Go to:

Calling CRM

→ Client

→ Code of Conduct

→ Next Day or Later

Expected:

condition:

completed_after_1_day

setup:

Next Day Email Setup

Send.

Verify the actual received email:

- subject

- body

- From Name

- From Email

- Reply-To

- signing link

No Same Day content should appear.

PASS only if the real inbox email matches.

────────────────────────────

PART 3 — PREVIEW VS RECEIVED EMAIL

────────────────────────────

For both tests compare:

Admin/CRM preview

vs

actual received email

Verify:

Same Day preview

= Same Day actual email

Next Day preview

= Next Day actual email

Any mismatch means the feature remains YELLOW/RED.

────────────────────────────

PART 4 — REQUEST SNAPSHOT VERIFICATION

────────────────────────────

For both test requests verify:

- completion_condition_key

- email variant/setup ID

- version

- from_email_snapshot

- from_name_snapshot

- reply_to_email_snapshot

- email_subject_snapshot

- email_body_snapshot

- sent_at

- delivery status

Same Day request must contain Same Day values.

Next Day request must contain Next Day values.

────────────────────────────

PART 5 — NORMAL RESEND

────────────────────────────

Take the Same Day test member.

After the first successful send:

Temporarily edit the current Same Day setup.

Then perform normal Resend.

Expected:

The resend uses the ORIGINAL stored snapshot.

It must NOT use the newly edited live setup.

Verify the received resend email.

Then restore the production setup.

Do not modify the original snapshot.

────────────────────────────

PART 6 — ADMIN SOURCE-OF-TRUTH CLEANUP AUDIT

────────────────────────────

Current Admin Center contains:

- Email Setup

- Template

- Email Templates by Completion Time

- Trigger Rules

- Requests

- Diagnostics

The new intended source of truth is:

Email Setup

→ Same Day Setup

→ Next Day Setup

Audit all code references to:

- `code_of_conduct_templates`

- old email subject/body fields

- old sender fields

- Email Templates by Completion Time UI

- Template tab email fields

- any edge function or frontend component still reading legacy email fields

Classify each legacy field/component as:

A. Still required for non-email Code of Conduct content

B. Required for historical compatibility

C. No longer used by production sending

D. Safe to hide from Admin UI

E. Safe to deprecate later

Do NOT delete columns or historical data during this task.

────────────────────────────

PART 7 — RECOMMENDED ADMIN CLEANUP

────────────────────────────

If the audit confirms production sending now exclusively uses:

`code_of_conduct_email_variants`

then simplify the Admin interface.

Preferred result:

EMAIL SETUP

- Same Day

- Next Day

TEMPLATE

Keep only agreement/document content that is genuinely separate from the email.

EMAIL TEMPLATES BY COMPLETION TIME

If fully redundant:

remove/hide this tab from navigation.

Important:

Do NOT delete the underlying historical variant/template records.

Do NOT remove database columns yet.

Do NOT break old Code of Conduct requests.

This is UI/source-of-truth consolidation only.

────────────────────────────

PART 8 — LEGACY FIELD SAFETY

────────────────────────────

Do not immediately drop old fields such as:

- from_email

- email_subject

- email_body

- similar global email settings

First verify:

- zero production code reads them for new sends

- legacy reports/requests do not need them

- no migration/trigger depends on them

If unused:

mark them internally as deprecated.

Database removal, if ever desired, should happen in a separate future migration after an observation period.

────────────────────────────

PART 9 — UI CLARITY

────────────────────────────

The final Admin experience should make it obvious:

Code of Conduct → Email Setup

[ Same Day ] [ Next Day ]

There should not be three different places where an admin believes they must edit the same email.

The operator in Calling CRM should continue making only one choice:

Same Day

or

Next Day or Later

The system resolves everything else automatically.

────────────────────────────

PART 10 — BUILD

────────────────────────────

Run:

bunx tsgo --noEmit

Expected:

0 errors.

────────────────────────────

FINAL REPORT

────────────────────────────

Return:

- Build result

- Real Same Day email received: PASS/FAIL

- Real Next Day email received: PASS/FAIL

- Same Day preview vs actual

- Next Day preview vs actual

- Same Day sender result

- Next Day sender result

- Snapshot result

- Resend snapshot result

- Production source-of-truth result

- Legacy Template tab usage

- Completion Time Templates tab usage

- Fields safe to hide

- Fields that must remain

- Admin UI consolidation result/recommendation

- Historical safety result

- Existing CoC workflow safety

- Issues found

- Final verdict: GREEN / YELLOW / RED

CRITICAL CLOSURE RULE:

Do not mark this feature fully closed until:

1. One actual Same Day email has been received and verified.

2. One actual Next Day email has been received and verified.

3. Each email matches its corresponding Email Setup.

4. There is no silent cross-fallback between the two.
*/


import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  loadEmailVariants, renderPreview, validateVariant, conditionLabel,
  type CocEmailVariant,
} from "@/lib/cocCompletionTiming";
import { logActivity } from "@/lib/auditLog";
import { Loader2, AlertCircle, CheckCircle2, Save, Send, Eye, EyeOff, Mail } from "lucide-react";

const ORDER = ["completed_within_1_day", "completed_after_1_day"];

const PREVIEW_VARS: Record<string, string> = {
  member_name: "Aarav Sharma",
  program_name: "IPC Diamond Membership",
  signing_link: "https://ipccontrolcenter.lovable.app/code-of-conduct-guide/<secure-link>",
  expiry_days: "7",
  expiry_date: new Date(Date.now() + 7 * 86400000).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
  company_name: "India Photographers' Club",
  support_email: "support@indiaphotographersclub.com",
  completion_time: "Same day",
  completion_condition: "Completed Within 1 Day",
  access_link: "https://ipccommunity.in/steps-1/",
  access_duration: "2 Years",
  support_duration: "6 Months",
};

const VARIABLES = Object.keys(PREVIEW_VARS);

const DEFAULT_AGREEMENT_HTML = `<h2>CODE OF CONDUCT AGREEMENT</h2>
<p>As a member of our community, you agree to abide by the following standards...</p>`;

export default function CodeOfConductEmailVariantsTab() {
  const [rows, setRows] = useState<CocEmailVariant[]>([]);
  const [original, setOriginal] = useState<CocEmailVariant[]>([]);
  const [editors, setEditors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>(ORDER[0]);
  const [diag, setDiag] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [v, { data: d }] = await Promise.all([
        loadEmailVariants(),
        supabase.functions.invoke("send-code-of-conduct-email", { body: { action: "diagnostics" } }),
      ]);
      const sorted = v.sort((a, b) => ORDER.indexOf(a.condition_key) - ORDER.indexOf(b.condition_key));
      setRows(sorted);
      setOriginal(sorted.map((x) => ({ ...x })));
      setDiag(d);

      const ids = Array.from(new Set(sorted.map((x) => x.updated_by).filter(Boolean))) as string[];
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id,full_name").in("id", ids);
        setEditors(Object.fromEntries((profs || []).map((p: any) => [p.id, p.full_name || "—"])));
      }
    } catch (e: any) {
      toast.error("Could not load email templates", { description: e?.message });
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const patch = (id: string, p: Partial<CocEmailVariant>) =>
    setRows((r) => r.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const save = async (row: CocEmailVariant) => {
    const issue = validateVariant({ ...row, is_active: true });
    if (issue) { toast.error(issue.message); return; }
    const before = original.find((x) => x.id === row.id);
    setSavingKey(row.id);
    try {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await (supabase as any)
        .from("code_of_conduct_email_variants")
        .update({
          subject: row.subject.trim(),
          html_body: row.html_body,
          text_body: row.text_body,
          from_email: row.from_email?.trim() || null,
          from_name: row.from_name?.trim() || null,
          reply_to_email: row.reply_to_email?.trim() || null,
          test_recipient_email: row.test_recipient_email?.trim() || null,
          access_link: row.access_link?.trim() || null,
          access_duration_months: row.access_duration_months || null,
          support_duration_months: row.support_duration_months || null,
          is_active: row.is_active,
          version: (row.version || 1) + 1,
          updated_by: u?.user?.id || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (error) throw error;

      await logActivity({
        module_key: "code_of_conduct", module_label: "Code of Conduct",
        action_type: "coc_email_variant_updated", action_label: "Code of Conduct email template updated",
        entity_type: "code_of_conduct_email_variant", entity_id: row.id, entity_label: row.condition_name,
        metadata: { 
          condition_key: row.condition_key, 
          new_version: (row.version || 1) + 1, 
          subject_changed: before?.subject !== row.subject, 
          body_changed: before?.html_body !== row.html_body,
          sender_changed: before?.from_email !== row.from_email || before?.from_name !== row.from_name,
          entitlement_changed: before?.access_link !== row.access_link || before?.access_duration_months !== row.access_duration_months || before?.support_duration_months !== row.support_duration_months
        },
        summary: `${row.condition_name} email template updated to v${(row.version || 1) + 1}.`,
      });
      
      toast.success(`${row.condition_name} saved`);
      await load();
    } catch (e: any) {
      toast.error("Save failed", { description: e?.message });
    } finally { setSavingKey(null); }
  };

  const sendTest = async (row: CocEmailVariant) => {
    const issue = validateVariant(row);
    if (issue) { toast.error(issue.message); return; }
    const to = row.test_recipient_email || window.prompt("Send a test Code of Conduct email to:");
    if (!to || !to.includes("@")) { if (to !== null) toast.error("Enter a valid email address."); return; }
    
    setTestingKey(row.id);
    try {
      const { data, error } = await supabase.functions.invoke("send-code-of-conduct-email", {
        body: {
          member_name: "Test Member",
          member_email: to,
          is_test: true,
          origin: window.location.origin,
          completion: {
            selection: row.condition_key === "completed_within_1_day" ? "same_day" : "next_day_or_later",
            condition_key: row.condition_key,
            process_started_at: null,
            process_completed_at: new Date().toISOString(),
            duration_hours: null,
            duration_days: row.condition_key === "completed_within_1_day" ? 0 : 2,
            override_reason: null,
          },
        },
      });
      if (error) throw error;
      const res = data as any;
      if (res?.ok === false) throw new Error(`[${res.error_code}] ${res.message}`);
      
      toast.success(`Test email sent to ${to}`);
    } catch (e: any) {
      toast.error("Test email failed", { description: e?.message });
    } finally { setTestingKey(null); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const activeRow = rows.find(r => r.condition_key === activeTab);

  return (
    <div className="space-y-6">
      <div className="flex gap-1 border-b border-line">
        {ORDER.map((key) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-4 py-2 text-[13px] font-medium border-b-2 -mb-[2px] transition-colors ${
              activeTab === key ? "border-black text-black" : "border-transparent text-muted-foreground hover:text-black"
            }`}
          >
            {key === "completed_within_1_day" ? "SAME DAY SETUP" : "NEXT DAY SETUP"}
          </button>
        ))}
      </div>

      {!activeRow ? (
        <div className="text-[12.5px] text-rose-700 p-4 border border-rose-200 rounded-xl bg-rose-50">
          Template for {activeTab} not found.
        </div>
      ) : (
        <div className="space-y-5 animate-in fade-in slide-in-from-top-1 duration-300">
          {/* Status Alert */}
          <div className={`rounded-xl border p-4 flex items-start gap-3 ${
            activeRow.is_active && !validateVariant(activeRow) 
              ? "bg-emerald-50 border-emerald-200 text-emerald-800" 
              : "bg-amber-50 border-amber-200 text-amber-800"
          }`}>
            {activeRow.is_active && !validateVariant(activeRow) ? (
              <CheckCircle2 className="w-5 h-5 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 mt-0.5" />
            )}
            <div>
              <div className="font-semibold text-[13px]">
                {activeRow.is_active 
                  ? (validateVariant(activeRow) ? "Configuration incomplete" : `${activeRow.condition_name} is active`)
                  : "Template is currently inactive"
                }
              </div>
              <div className="text-[12px] opacity-90 mt-0.5">
                {activeRow.condition_key === "completed_within_1_day" 
                  ? "Used when onboarding is completed on the same day."
                  : "Used when onboarding is completed 1 day or more after start."
                }
              </div>
            </div>
          </div>

          <div className="bg-white border border-line rounded-xl overflow-hidden">
            <div className="p-6 space-y-8">
              {/* Client Entitlements */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span className="text-[13px] font-semibold uppercase tracking-wider text-slate-700">Client Entitlements</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-100">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Access Link</label>
                    <input 
                      value={activeRow.access_link || ""} 
                      onChange={(e) => patch(activeRow.id, { access_link: e.target.value })}
                      placeholder="https://ipccommunity.in/steps"
                      className="w-full border border-slate-200 rounded-md px-3 py-2 text-[13px] focus:ring-1 focus:ring-black outline-none bg-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Access Duration (Months)</label>
                    <input 
                      type="number"
                      value={activeRow.access_duration_months || ""} 
                      onChange={(e) => patch(activeRow.id, { access_duration_months: parseInt(e.target.value) || 0 })}
                      placeholder="12"
                      className="w-full border border-slate-200 rounded-md px-3 py-2 text-[13px] focus:ring-1 focus:ring-black outline-none bg-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Support Duration (Months)</label>
                    <input 
                      type="number"
                      value={activeRow.support_duration_months || ""} 
                      onChange={(e) => patch(activeRow.id, { support_duration_months: parseInt(e.target.value) || 0 })}
                      placeholder="3"
                      className="w-full border border-slate-200 rounded-md px-3 py-2 text-[13px] focus:ring-1 focus:ring-black outline-none bg-white"
                    />
                  </div>
                </div>
              </div>

              <div className="h-px bg-line" />

              {/* Sender Overrides */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <span className="text-[13px] font-semibold uppercase tracking-wider text-slate-700">Sender Overrides</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">From Email</label>
                    <input 
                      value={activeRow.from_email || ""} 
                      onChange={(e) => patch(activeRow.id, { from_email: e.target.value })}
                      placeholder={diag?.has_email_from_address ? "(using system default)" : "team@yourdomain.com"}
                      className="w-full border border-slate-200 rounded-md px-3 py-2 text-[13px] focus:ring-1 focus:ring-black outline-none"
                    />
                    <div className="text-[10px] text-muted-foreground">
                      {diag?.has_email_from_address ? "System default is set. Leave blank to use it." : "No system default. Required if not set in secrets."}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">From Name</label>
                    <input 
                      value={activeRow.from_name || ""} 
                      onChange={(e) => patch(activeRow.id, { from_name: e.target.value })}
                      placeholder={diag?.has_email_from_name ? "(using system default)" : "IPC Control Center"}
                      className="w-full border border-slate-200 rounded-md px-3 py-2 text-[13px] focus:ring-1 focus:ring-black outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Reply-To Email</label>
                    <input 
                      value={activeRow.reply_to_email || ""} 
                      onChange={(e) => patch(activeRow.id, { reply_to_email: e.target.value })}
                      placeholder="support@yourdomain.com"
                      className="w-full border border-slate-200 rounded-md px-3 py-2 text-[13px] focus:ring-1 focus:ring-black outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Test Recipient</label>
                    <input 
                      value={activeRow.test_recipient_email || ""} 
                      onChange={(e) => patch(activeRow.id, { test_recipient_email: e.target.value })}
                      placeholder="you@example.com"
                      className="w-full border border-slate-200 rounded-md px-3 py-2 text-[13px] focus:ring-1 focus:ring-black outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="h-px bg-line" />

              {/* Email Copy */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-muted-foreground" />
                    <span className="text-[13px] font-semibold uppercase tracking-wider text-slate-700">Email Copy</span>
                  </div>
                  <div className="text-[10.5px] text-muted-foreground">
                    Variables: {VARIABLES.map((v) => `{{${v}}}`).join(", ")}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Subject Line</label>
                    <input 
                      value={activeRow.subject || ""} 
                      onChange={(e) => patch(activeRow.id, { subject: e.target.value })}
                      className="w-full border border-slate-200 rounded-md px-3 py-2 text-[13px] focus:ring-1 focus:ring-black outline-none font-medium"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">HTML Body</label>
                    <textarea 
                      value={activeRow.html_body || ""} 
                      onChange={(e) => patch(activeRow.id, { html_body: e.target.value })}
                      rows={12}
                      className="w-full border border-slate-200 rounded-md px-3 py-2 text-[13px] focus:ring-1 focus:ring-black outline-none font-mono"
                    />
                  </div>
                </div>
              </div>

              {validateVariant(activeRow) && (
                <div className="text-[12px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  {validateVariant(activeRow)?.message}
                </div>
              )}

              {previewKey === activeRow.id && (
                <div className="rounded-xl border border-slate-200 overflow-hidden bg-slate-50 animate-in zoom-in-95 duration-200">
                  <div className="px-4 py-3 border-b border-slate-200 bg-white">
                    <div className="text-[11px] text-slate-500 uppercase tracking-wider mb-1">Subject Preview</div>
                    <div className="text-[13px] font-medium">{renderPreview(activeRow.subject || "", PREVIEW_VARS)}</div>
                  </div>
                  <div className="p-4 bg-white m-4 rounded-lg border shadow-sm max-h-[400px] overflow-y-auto">
                    <div 
                      className="prose prose-sm max-w-none text-[13px]"
                      dangerouslySetInnerHTML={{ __html: renderPreview(activeRow.html_body || "", PREVIEW_VARS) }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="bg-slate-50 px-6 py-4 flex items-center justify-between border-t border-line">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div className={`w-10 h-5 rounded-full relative transition-colors ${activeRow.is_active ? "bg-black" : "bg-slate-300"}`}>
                    <input 
                      type="checkbox" 
                      className="sr-only" 
                      checked={activeRow.is_active} 
                      onChange={(e) => patch(activeRow.id, { is_active: e.target.checked })} 
                    />
                    <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${activeRow.is_active ? "left-6" : "left-1"}`} />
                  </div>
                  <span className="text-[12.5px] font-medium text-slate-700 group-hover:text-black transition-colors">
                    {activeRow.is_active ? "Template Active" : "Template Inactive"}
                  </span>
                </label>
                <div className="text-[11px] text-muted-foreground">
                  v{activeRow.version} • Updated {activeRow.updated_at ? new Date(activeRow.updated_at).toLocaleDateString() : "Never"}
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setPreviewKey(previewKey === activeRow.id ? null : activeRow.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-medium hover:bg-slate-200 rounded-md transition-colors"
                >
                  {previewKey === activeRow.id ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  {previewKey === activeRow.id ? "Hide Preview" : "Live Preview"}
                </button>
                <button 
                  onClick={() => sendTest(activeRow)} 
                  disabled={testingKey === activeRow.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-medium hover:bg-slate-200 rounded-md transition-colors disabled:opacity-50"
                >
                  {testingKey === activeRow.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Test Send
                </button>
                <button 
                  onClick={() => save(activeRow)} 
                  disabled={savingKey === activeRow.id}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-[12.5px] font-semibold bg-black text-white rounded-md hover:bg-slate-800 transition-colors disabled:opacity-50 shadow-sm"
                >
                  {savingKey === activeRow.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}