import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { logActivity } from "@/lib/auditLog";
import MediaBuyerAliasManager from "@/components/admin/MediaBuyerAliasManager";


const MS = "master_settings";
const MSL = "Master Settings";

// ───────────────────────── Types ─────────────────────────
type PPSetting = {
  id: string;
  setting_type: string;
  label: string;
  value: string | null;
  sort_order: number;
  is_active: boolean;
  business_unit: string | null;
};
type QSEntry = { id: string; field_key: string; value: string; sort_order: number; is_active: boolean };
type AppSetting = { id: string; setting_group: string; setting_key: string; setting_value: any };
type Product = {
  id: string;
  product_name: string;
  product_price_including_gst: number;
  currency: string;
  gst_applicable: boolean;
  gst_rate: number;
  default_token_amount: number;
  revenue_recognition_rule: string;
  business_unit: string;
  is_active: boolean;
  is_deleted: boolean;
};
type Pipeline = { id: string; name: string; type: string; position: number };
type Stage = { id: string; pipeline_id: string; name: string; position: number; color: string | null };

// ───────────────────────── Section list ─────────────────────────
const SECTIONS = [
  { key: "business", label: "Business Profile" },
  { key: "products", label: "Products / Programs" },
  { key: "payments", label: "Payment Settings" },
  { key: "paid_pipeline", label: "Paid Pipeline" },
  { key: "calling_crm", label: "Calling CRM" },
  { key: "followup", label: "Follow-Up" },
  { key: "recovery", label: "Payment Recovery" },
  { key: "finance", label: "Finance / EMI" },
  { key: "webinar", label: "Webinar" },
  { key: "team", label: "Roles & Departments" },
  { key: "eligibility", label: "Assignment Eligibility" },
  { key: "tags", label: "Tags" },
  { key: "stage_sync", label: "Stage Sync Rules" },
  { key: "whatsapp", label: "WhatsApp Templates" },
  { key: "dropdowns", label: "General Dropdowns" },
  { key: "media_buyer_cleanup", label: "Media Buyer Name Cleanup" },
];


// ───────────────────────── Helpers ─────────────────────────
const cardCls = "border border-line rounded-lg bg-white";
const labelCls = "block font-sans text-[11px] uppercase tracking-[0.12em] text-muted-foreground mb-1.5";
const inputCls = "w-full h-10 border border-line rounded-md px-3.5 font-sans text-[13px] focus:outline-none focus:border-gold bg-white";
const btnPrimary = "h-10 px-5 bg-black text-white font-sans text-[13px] rounded-md hover:opacity-90";
const btnGhost = "h-9 px-3 font-sans text-[12px] text-muted-foreground hover:text-black";
const h2Cls = "font-serif text-[20px] text-black";
const subCls = "font-sans text-[12.5px] font-light text-muted-foreground mt-1";

const REVENUE_RULES = [
  { v: "token_collected_only", l: "Token Collected Only" },
  { v: "full_deal_value", l: "Full Deal Value" },
  { v: "realized_revenue_only", l: "Realized Revenue Only" },
  { v: "finance_approved_amount", l: "Finance Approved Amount" },
  { v: "custom", l: "Custom" },
];

// ───────────────────────── Page ─────────────────────────
export default function MasterSettings() {
  const { isAdmin } = useAuth();
  const [activeSection, setActive] = useState("business");

  if (!isAdmin) {
    return (
      <div className="max-w-[800px]">
        <h1 className="font-serif text-[28px] text-black">Master Settings</h1>
        <p className="mt-4 font-sans text-[14px] text-muted-foreground">
          You do not have access to Master Settings.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-[1200px]">
      <h1 className="font-serif text-[28px] text-black">Master Settings</h1>
      <p className="font-sans text-[13px] font-light text-muted-foreground mt-1 mb-2">
        Customize products, payment models, pipeline stages, finance partners, follow-up reasons, roles,
        departments, templates, and business rules for your coaching business.
      </p>
      <p className="font-sans text-[12px] text-muted-foreground mb-7">
        These settings control reusable dropdowns, quick-save options, and business rules across the Control Center.
      </p>

      <div className="grid grid-cols-[220px_1fr] gap-6">
        {/* Side nav */}
        <nav className="border border-line rounded-lg bg-white p-1.5 h-fit sticky top-20">
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              onClick={() => setActive(s.key)}
              className={
                "w-full text-left px-3 py-2 rounded-md font-sans text-[12.5px] transition-colors " +
                (activeSection === s.key
                  ? "bg-black text-white"
                  : "text-black hover:bg-off")
              }
            >
              {s.label}
            </button>
          ))}
        </nav>

        <div>
          {activeSection === "business" && <BusinessProfileSection />}
          {activeSection === "products" && <ProductsSection />}
          {activeSection === "payments" && (
            <PPSettingsGroup
              title="Payment Settings"
              subtitle="Manage Payment Models, Payment Types, and Revenue Recognition Rules used across the pipeline."
              groups={[
                { type: "payment_model", label: "Payment Models" },
                { type: "payment_type", label: "Payment Types / Categories" },
                { type: "revenue_recognition_rule", label: "Revenue Recognition Rules" },
              ]}
            />
          )}
          {activeSection === "paid_pipeline" && (
            <PPSettingsGroup
              title="Paid Pipeline Settings"
              subtitle="Manage paid pipeline stages, lead priorities, and balance categories."
              groups={[
                { type: "pipeline_stage", label: "Paid Pipeline Stages" },
                { type: "lead_priority", label: "Lead Priority Options" },
                { type: "balance_category", label: "Balance Categories" },
                { type: "payment_status", label: "Payment Statuses" },
              ]}
            />
          )}
          {activeSection === "calling_crm" && <CrmPipelinesSection />}
          {activeSection === "followup" && (
            <PPSettingsGroup
              title="Follow-Up Settings"
              subtitle="Manage follow-up types, reasons, priorities, and statuses used by Follow-Up Command Center."
              groups={[
                { type: "follow_up_type", label: "Follow-Up Types" },
                { type: "follow_up_reason", label: "Follow-Up Reasons" },
                { type: "follow_up_priority", label: "Follow-Up Priorities" },
                { type: "follow_up_status", label: "Follow-Up Statuses" },
              ]}
            />
          )}
          {activeSection === "recovery" && <RecoverySettingsSection />}
          {activeSection === "finance" && (
            <PPSettingsGroup
              title="Finance / EMI Settings"
              subtitle="Manage finance partners, statuses, document types, and rejection reasons."
              groups={[
                { type: "finance_partner", label: "Finance Partners" },
                { type: "finance_status", label: "Finance Statuses" },
                { type: "finance_document_type", label: "Finance Document Types" },
                { type: "finance_rejection_reason", label: "Rejection Reasons" },
              ]}
            />
          )}
          {activeSection === "webinar" && <WebinarSettingsSection />}
          {activeSection === "team" && (
            <QSGroup
              title="Roles & Departments"
              subtitle="Manage team roles and departments used in Team Directory and Manage Member."
              groups={[
                { field: "team_role", label: "Team Roles" },
                { field: "department", label: "Departments" },
                { field: "designation", label: "Designations" },
                { field: "employment_type", label: "Employment Types" },
              ]}
            />
          )}
          {activeSection === "eligibility" && <EligibilitySection />}
          {activeSection === "tags" && <TagsSection />}
          {activeSection === "stage_sync" && <StageSyncRulesSection />}
          {activeSection === "whatsapp" && <WhatsAppTemplatesSection />}
          {activeSection === "dropdowns" && <GeneralDropdownsSection />}
          {activeSection === "media_buyer_cleanup" && <MediaBuyerAliasManager />}

        </div>
      </div>
    </div>
  );
}

// ───────────────────────── 1. Business Profile ─────────────────────────
function BusinessProfileSection() {
  const [form, setForm] = useState<any>({
    business_name: "",
    business_type: "Coaching Business",
    default_currency: "INR",
    gst_applicable: true,
    gst_rate: 18,
    country: "India",
    timezone: "Asia/Kolkata",
    default_business_unit: "IPC",
    founder_name: "",
    support_phone: "",
    support_email: "",
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("app_settings" as any)
        .select("setting_key, setting_value")
        .eq("setting_group", "business_profile")
        .eq("is_deleted", false);
      const next = { ...form };
      (data as any[] | null)?.forEach((r) => { next[r.setting_key] = r.setting_value?.v ?? r.setting_value; });
      setForm(next);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const rows = Object.entries(form).map(([k, v]) => ({
      setting_group: "business_profile",
      setting_key: k,
      setting_value: { v },
      created_by: user?.id ?? null,
    }));
    for (const row of rows) {
      const { data: existing } = await supabase.from("app_settings" as any)
        .select("id").eq("setting_group", row.setting_group).eq("setting_key", row.setting_key)
        .eq("is_deleted", false).maybeSingle();
      if (existing) {
        await supabase.from("app_settings" as any).update({ setting_value: row.setting_value }).eq("id", (existing as any).id);
      } else {
        await supabase.from("app_settings" as any).insert(row as any);
      }
    }
    toast.success("Business profile saved");
    logActivity({ module_key: MS, module_label: MSL, action_type: "business_profile_updated", entity_type: "business_profile", new_values: form, summary: "Business profile updated." });
  };

  if (loading) return <div className="font-sans text-[13px] text-muted-foreground">Loading…</div>;
  const F = (key: string) => ({ value: form[key] ?? "", onChange: (e: any) => setForm({ ...form, [key]: e.target.value }) });

  return (
    <div className={cardCls + " p-6"}>
      <h2 className={h2Cls}>Business Profile</h2>
      <p className={subCls}>Core information about your business. Used across reports and exports.</p>
      <div className="grid grid-cols-2 gap-4 mt-6">
        <div><label className={labelCls}>Business Name</label><input className={inputCls} {...F("business_name")} /></div>
        <div>
          <label className={labelCls}>Business Type</label>
          <select className={inputCls} {...F("business_type")}>
            {["Coaching Business","Consulting Business","Training Institute","Webinar Business","Ed-Tech","Service Business","Community Business","Other"].map(o => <option key={o}>{o}</option>)}
          </select>
        </div>
        <div><label className={labelCls}>Default Currency</label><input className={inputCls} {...F("default_currency")} /></div>
        <div>
          <label className={labelCls}>GST Applicable</label>
          <select className={inputCls} value={String(form.gst_applicable)} onChange={(e) => setForm({ ...form, gst_applicable: e.target.value === "true" })}>
            <option value="true">Yes</option><option value="false">No</option>
          </select>
        </div>
        <div><label className={labelCls}>GST Rate (%)</label><input type="number" className={inputCls} value={form.gst_rate} onChange={(e) => setForm({ ...form, gst_rate: Number(e.target.value) })} /></div>
        <div><label className={labelCls}>Country</label><input className={inputCls} {...F("country")} /></div>
        <div><label className={labelCls}>Timezone</label><input className={inputCls} {...F("timezone")} /></div>
        <div><label className={labelCls}>Default Business Unit</label><input className={inputCls} {...F("default_business_unit")} /></div>
        <div><label className={labelCls}>Founder / Admin Name</label><input className={inputCls} {...F("founder_name")} /></div>
        <div><label className={labelCls}>Support Phone</label><input className={inputCls} {...F("support_phone")} /></div>
        <div className="col-span-2"><label className={labelCls}>Support Email</label><input className={inputCls} {...F("support_email")} /></div>
      </div>
      <div className="mt-6"><button className={btnPrimary} onClick={save}>Save Business Profile</button></div>
    </div>
  );
}

// ───────────────────────── 2. Products / Programs ─────────────────────────
function ProductsSection() {
  const [rows, setRows] = useState<Product[]>([]);
  const [editing, setEditing] = useState<Partial<Product> | null>(null);

  const load = async () => {
    const { data } = await supabase.from("program_products")
      .select("*").eq("is_deleted", false).order("created_at", { ascending: false });
    setRows((data as Product[]) || []);
  };
  useEffect(() => { load(); }, []);

  const blank = (): Partial<Product> => ({
    product_name: "", product_price_including_gst: 0, currency: "INR",
    gst_applicable: true, gst_rate: 18, default_token_amount: 0,
    revenue_recognition_rule: "realized_revenue_only", business_unit: "IPC", is_active: true,
  });

  const save = async () => {
    if (!editing) return;
    if (!editing.product_name?.trim()) { toast.error("Name required"); return; }
    const { data: { user } } = await supabase.auth.getUser();
    const payload: any = { ...editing };
    if (!editing.id) payload.created_by = user?.id ?? null;
    const oldRow = editing.id ? rows.find(r => r.id === editing.id) : null;
    const op = editing.id
      ? supabase.from("program_products").update(payload).eq("id", editing.id)
      : supabase.from("program_products").insert(payload);
    const { error } = await op;
    if (error) { toast.error(error.message); return; }
    toast.success("Saved");
    logActivity({
      module_key: MS, module_label: MSL,
      action_type: editing.id ? "product_updated" : "product_created",
      entity_type: "program_product", entity_id: editing.id ?? null, entity_label: editing.product_name,
      old_values: oldRow ?? null, new_values: payload,
      summary: editing.id ? `Product '${editing.product_name}' updated.` : `Product '${editing.product_name}' created.`,
    });
    setEditing(null); await load();
  };

  const deactivate = async (id: string) => {
    const target = rows.find(r => r.id === id);
    const { error } = await supabase.from("program_products").update({ is_deleted: true, is_active: false }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    logActivity({ module_key: MS, module_label: MSL, action_type: "product_deactivated", entity_type: "program_product", entity_id: id, entity_label: target?.product_name, summary: `Product '${target?.product_name ?? id}' deactivated.`, severity: "warning" });
    await load();
  };

  return (
    <div className={cardCls + " p-6"}>
      <div className="flex items-start justify-between">
        <div>
          <h2 className={h2Cls}>Products / Programs</h2>
          <p className={subCls}>Manage products. Used by Paid Pipeline, Payment Recovery, Finance, Reports.</p>
        </div>
        <button className={btnPrimary} onClick={() => setEditing(blank())}>+ Add Product</button>
      </div>

      <div className="mt-6 border border-line rounded-lg overflow-hidden">
        <div className="grid grid-cols-[2fr_120px_120px_140px_180px_100px] bg-off px-4 py-2.5 text-[10px] uppercase tracking-[0.1em] text-muted-foreground font-sans">
          <div>Name</div><div>Price</div><div>Token</div><div>GST</div><div>Revenue Rule</div><div className="text-right">Actions</div>
        </div>
        {rows.length === 0 && <div className="px-4 py-10 text-center font-sans text-[13px] text-muted-foreground">No products yet</div>}
        {rows.map((r) => (
          <div key={r.id} className="grid grid-cols-[2fr_120px_120px_140px_180px_100px] px-4 py-3 border-t border-line items-center hover:bg-off/50">
            <div className="font-serif text-[15px] text-black">{r.product_name} {!r.is_active && <span className="ml-2 text-[10px] text-muted-foreground">(inactive)</span>}</div>
            <div className="font-sans text-[13px]">{r.currency} {r.product_price_including_gst.toLocaleString()}</div>
            <div className="font-sans text-[13px]">{r.default_token_amount.toLocaleString()}</div>
            <div className="font-sans text-[12px] text-muted-foreground">{r.gst_applicable ? `${r.gst_rate}%` : "—"}</div>
            <div className="font-sans text-[11px] text-muted-foreground">{REVENUE_RULES.find(x => x.v === r.revenue_recognition_rule)?.l ?? r.revenue_recognition_rule}</div>
            <div className="flex gap-1.5 justify-end">
              <button className="w-7 h-7 rounded-md hover:bg-off text-muted-foreground hover:text-black" onClick={() => setEditing(r)}>✎</button>
              <button className="w-7 h-7 rounded-md hover:bg-[#FEF2F2] text-muted-foreground hover:text-[#DC2626]" onClick={() => deactivate(r.id)}>🗑</button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-lg p-6 w-[640px] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-serif text-[20px] mb-5">{editing.id ? "Edit" : "Add"} Product</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2"><label className={labelCls}>Name</label><input className={inputCls} value={editing.product_name ?? ""} onChange={(e) => setEditing({ ...editing, product_name: e.target.value })} /></div>
              <div><label className={labelCls}>Price (incl GST)</label><input type="number" className={inputCls} value={editing.product_price_including_gst ?? 0} onChange={(e) => setEditing({ ...editing, product_price_including_gst: Number(e.target.value) })} /></div>
              <div><label className={labelCls}>Currency</label><input className={inputCls} value={editing.currency ?? "INR"} onChange={(e) => setEditing({ ...editing, currency: e.target.value })} /></div>
              <div><label className={labelCls}>Default Token Amount</label><input type="number" className={inputCls} value={editing.default_token_amount ?? 0} onChange={(e) => setEditing({ ...editing, default_token_amount: Number(e.target.value) })} /></div>
              <div><label className={labelCls}>GST Rate (%)</label><input type="number" className={inputCls} value={editing.gst_rate ?? 18} onChange={(e) => setEditing({ ...editing, gst_rate: Number(e.target.value) })} /></div>
              <div><label className={labelCls}>GST Applicable</label>
                <select className={inputCls} value={String(editing.gst_applicable ?? true)} onChange={(e) => setEditing({ ...editing, gst_applicable: e.target.value === "true" })}>
                  <option value="true">Yes</option><option value="false">No</option>
                </select>
              </div>
              <div><label className={labelCls}>Business Unit</label><input className={inputCls} value={editing.business_unit ?? "IPC"} onChange={(e) => setEditing({ ...editing, business_unit: e.target.value })} /></div>
              <div className="col-span-2"><label className={labelCls}>Revenue Recognition Rule</label>
                <select className={inputCls} value={editing.revenue_recognition_rule ?? "realized_revenue_only"} onChange={(e) => setEditing({ ...editing, revenue_recognition_rule: e.target.value })}>
                  {REVENUE_RULES.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}
                </select>
              </div>
              <div className="col-span-2"><label className={labelCls}>Active</label>
                <select className={inputCls} value={String(editing.is_active ?? true)} onChange={(e) => setEditing({ ...editing, is_active: e.target.value === "true" })}>
                  <option value="true">Active</option><option value="false">Inactive</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button className={btnGhost} onClick={() => setEditing(null)}>Cancel</button>
              <button className={btnPrimary} onClick={save}>Save Product</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ───────────────────────── PP Settings grouped editor (reuses paid_pipeline_settings) ─────────────────────────
function PPSettingsGroup({ title, subtitle, groups }:
  { title: string; subtitle: string; groups: { type: string; label: string }[] }) {
  const [tab, setTab] = useState(groups[0].type);
  const [rows, setRows] = useState<PPSetting[]>([]);
  const [newVal, setNewVal] = useState("");
  const [editing, setEditing] = useState<PPSetting | null>(null);

  const load = async () => {
    const { data } = await supabase.from("paid_pipeline_settings")
      .select("*").eq("is_deleted", false).order("sort_order").order("label");
    setRows((data as PPSetting[]) || []);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => rows.filter(r => r.setting_type === tab), [rows, tab]);

  const add = async () => {
    const v = newVal.trim();
    if (!v) return;
    if (filtered.some(r => r.label.toLowerCase() === v.toLowerCase())) { toast.error("Already exists"); return; }
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("paid_pipeline_settings").insert({
      setting_type: tab, label: v, value: v, sort_order: filtered.length, created_by: user?.id ?? null,
    } as any);
    if (error) { toast.error(error.message); return; }
    logActivity({ module_key: MS, module_label: MSL, action_type: `${tab}_created`, entity_type: "paid_pipeline_setting", entity_label: v, new_values: { setting_type: tab, label: v }, summary: `${tab} option '${v}' created.` });
    setNewVal(""); await load();
  };

  const saveEdit = async () => {
    if (!editing) return;
    const oldRow = rows.find(r => r.id === editing.id);
    const { error } = await supabase.from("paid_pipeline_settings").update({
      label: editing.label, value: editing.value, sort_order: editing.sort_order, is_active: editing.is_active,
    }).eq("id", editing.id);
    if (error) { toast.error(error.message); return; }
    logActivity({ module_key: MS, module_label: MSL, action_type: `${editing.setting_type}_updated`, entity_type: "paid_pipeline_setting", entity_id: editing.id, entity_label: editing.label, old_values: oldRow ? { label: oldRow.label, sort_order: oldRow.sort_order, is_active: oldRow.is_active } : null, new_values: { label: editing.label, sort_order: editing.sort_order, is_active: editing.is_active }, summary: `${editing.setting_type} option '${editing.label}' updated.` });
    setEditing(null); await load();
  };

  const del = async (id: string) => {
    const target = rows.find(r => r.id === id);
    const { error } = await supabase.from("paid_pipeline_settings").update({ is_deleted: true, is_active: false }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    logActivity({ module_key: MS, module_label: MSL, action_type: `${target?.setting_type ?? "setting"}_deactivated`, entity_type: "paid_pipeline_setting", entity_id: id, entity_label: target?.label, summary: `${target?.setting_type ?? "Setting"} '${target?.label ?? id}' deactivated.`, severity: "warning" });
    await load();
  };
  const toggleActive = async (r: PPSetting) => {
    await supabase.from("paid_pipeline_settings").update({ is_active: !r.is_active }).eq("id", r.id);
    logActivity({ module_key: MS, module_label: MSL, action_type: `${r.setting_type}_updated`, entity_type: "paid_pipeline_setting", entity_id: r.id, entity_label: r.label, old_values: { is_active: r.is_active }, new_values: { is_active: !r.is_active }, summary: `${r.setting_type} '${r.label}' ${!r.is_active ? "activated" : "deactivated"}.` });
    await load();
  };

  return (
    <div className={cardCls + " p-6"}>
      <h2 className={h2Cls}>{title}</h2>
      <p className={subCls}>{subtitle}</p>

      <div className="flex flex-wrap gap-1 border-b border-line mt-5">
        {groups.map((g) => (
          <button key={g.type} onClick={() => setTab(g.type)}
            className={"relative px-4 py-2.5 font-sans text-[12.5px] " +
              (tab === g.type ? "text-black after:absolute after:left-3 after:right-3 after:bottom-[-1px] after:h-[2px] after:bg-gold" : "text-muted-foreground hover:text-black")}>
            {g.label}
            <span className="ml-1.5 inline-block px-1.5 py-0.5 rounded-full bg-gold-pale text-[9px] text-gold-deep">{rows.filter(r => r.setting_type === g.type).length}</span>
          </button>
        ))}
      </div>

      <div className="flex gap-2 mt-5 mb-3">
        <input className={inputCls + " flex-1"} placeholder={`Add new ${groups.find(g => g.type === tab)?.label.toLowerCase().replace(/s$/, "")}…`}
          value={newVal} onChange={(e) => setNewVal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className={btnPrimary} onClick={add}>Add</button>
      </div>

      <div className="border border-line rounded-lg overflow-hidden">
        <div className="grid grid-cols-[1fr_80px_100px_140px] bg-off px-4 py-2.5 text-[10px] uppercase tracking-[0.1em] text-muted-foreground font-sans">
          <div>Label</div><div>Sort</div><div>Active</div><div className="text-right">Actions</div>
        </div>
        {filtered.length === 0 && <div className="px-4 py-10 text-center font-sans text-[13px] text-muted-foreground">No entries</div>}
        {filtered.map((r) => (
          <div key={r.id} className="grid grid-cols-[1fr_80px_100px_140px] px-4 py-3 border-t border-line items-center hover:bg-off/50">
            {editing?.id === r.id ? (
              <>
                <input className={inputCls + " h-8"} value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value, value: e.target.value })} />
                <input type="number" className={inputCls + " h-8"} value={editing.sort_order} onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })} />
                <select className={inputCls + " h-8"} value={String(editing.is_active)} onChange={(e) => setEditing({ ...editing, is_active: e.target.value === "true" })}>
                  <option value="true">Active</option><option value="false">Inactive</option>
                </select>
                <div className="flex gap-1.5 justify-end">
                  <button className="h-8 px-2.5 bg-black text-white text-[12px] rounded-md" onClick={saveEdit}>Save</button>
                  <button className={btnGhost} onClick={() => setEditing(null)}>Cancel</button>
                </div>
              </>
            ) : (
              <>
                <div className="font-serif text-[15px] text-black">{r.label} {!r.is_active && <span className="ml-2 text-[10px] text-muted-foreground">(inactive)</span>}</div>
                <div className="font-sans text-[12px] text-muted-foreground">{r.sort_order}</div>
                <div><button onClick={() => toggleActive(r)} className={"text-[11px] px-2 py-0.5 rounded-full " + (r.is_active ? "bg-gold-pale text-gold-deep" : "bg-off text-muted-foreground")}>{r.is_active ? "Active" : "Inactive"}</button></div>
                <div className="flex gap-1.5 justify-end">
                  <button className="w-7 h-7 rounded-md hover:bg-off text-muted-foreground hover:text-black" onClick={() => setEditing(r)}>✎</button>
                  <button className="w-7 h-7 rounded-md hover:bg-[#FEF2F2] text-muted-foreground hover:text-[#DC2626]" onClick={() => del(r.id)}>🗑</button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────── Quick-Save grouped editor (reuses quick_save_entries) ─────────────────────────
function QSGroup({ title, subtitle, groups }:
  { title: string; subtitle: string; groups: { field: string; label: string }[] }) {
  const [tab, setTab] = useState(groups[0].field);
  const [rows, setRows] = useState<QSEntry[]>([]);
  const [newVal, setNewVal] = useState("");

  const load = async () => {
    const { data } = await supabase.from("quick_save_entries")
      .select("id, field_key, value, sort_order, is_active")
      .eq("is_active", true).order("sort_order").order("value");
    setRows((data as QSEntry[]) || []);
  };
  useEffect(() => { load(); }, []);

  const filtered = rows.filter(r => r.field_key === tab);

  const add = async () => {
    const v = newVal.trim();
    if (!v) return;
    if (filtered.some(r => r.value.toLowerCase() === v.toLowerCase())) { toast.error("Already exists"); return; }
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("quick_save_entries").insert({ field_key: tab, value: v, created_by: user?.id ?? null });
    if (error) { toast.error(error.message); return; }
    logActivity({ module_key: MS, module_label: MSL, action_type: "dropdown_option_created", entity_type: "quick_save_entry", entity_label: v, new_values: { field_key: tab, value: v }, summary: `Dropdown option '${v}' added to ${tab}.` });
    setNewVal(""); await load();
  };

  const del = async (id: string) => {
    const target = rows.find(r => r.id === id);
    await supabase.from("quick_save_entries").update({ is_active: false }).eq("id", id);
    logActivity({ module_key: MS, module_label: MSL, action_type: "dropdown_option_deactivated", entity_type: "quick_save_entry", entity_id: id, entity_label: target?.value, summary: `Dropdown option '${target?.value ?? id}' deactivated from ${target?.field_key ?? "field"}.`, severity: "warning" });
    await load();
  };

  return (
    <div className={cardCls + " p-6"}>
      <h2 className={h2Cls}>{title}</h2>
      <p className={subCls}>{subtitle}</p>

      <div className="flex flex-wrap gap-1 border-b border-line mt-5">
        {groups.map((g) => (
          <button key={g.field} onClick={() => setTab(g.field)}
            className={"relative px-4 py-2.5 font-sans text-[12.5px] " +
              (tab === g.field ? "text-black after:absolute after:left-3 after:right-3 after:bottom-[-1px] after:h-[2px] after:bg-gold" : "text-muted-foreground hover:text-black")}>
            {g.label}
            <span className="ml-1.5 inline-block px-1.5 py-0.5 rounded-full bg-gold-pale text-[9px] text-gold-deep">{rows.filter(r => r.field_key === g.field).length}</span>
          </button>
        ))}
      </div>

      <div className="flex gap-2 mt-5 mb-3">
        <input className={inputCls + " flex-1"} placeholder={`Add ${groups.find(g => g.field === tab)?.label.toLowerCase().replace(/s$/, "")}…`}
          value={newVal} onChange={(e) => setNewVal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className={btnPrimary} onClick={add}>Add</button>
      </div>

      <div className="border border-line rounded-lg overflow-hidden">
        {filtered.length === 0 && <div className="px-4 py-10 text-center font-sans text-[13px] text-muted-foreground">No entries</div>}
        {filtered.map((r) => (
          <div key={r.id} className="flex items-center px-4 py-3 border-b border-line last:border-b-0 hover:bg-off/50">
            <span className="font-serif text-[15px] text-black flex-1">{r.value}</span>
            <button className="w-7 h-7 rounded-md hover:bg-[#FEF2F2] text-muted-foreground hover:text-[#DC2626]" onClick={() => del(r.id)}>🗑</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────── CRM Pipelines (pipelines + stages) ─────────────────────────
function CrmPipelinesSection() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [activePipeline, setActivePipeline] = useState<string | null>(null);
  const [newStage, setNewStage] = useState("");

  const load = async () => {
    const { data: ps } = await supabase.from("pipelines").select("*").order("position");
    setPipelines((ps as Pipeline[]) || []);
    if (!activePipeline && ps?.[0]) setActivePipeline((ps[0] as any).id);
    const { data: ss } = await supabase.from("stages").select("*").order("position");
    setStages((ss as Stage[]) || []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const pStages = stages.filter(s => s.pipeline_id === activePipeline);

  const addStage = async () => {
    if (!activePipeline || !newStage.trim()) return;
    const name = newStage.trim();
    const { error } = await supabase.from("stages").insert({
      pipeline_id: activePipeline, name, position: pStages.length,
    } as any);
    if (error) { toast.error(error.message); return; }
    logActivity({ module_key: MS, module_label: MSL, action_type: "crm_stage_created", entity_type: "crm_stage", entity_label: name, new_values: { pipeline_id: activePipeline, name }, summary: `CRM stage '${name}' created.` });
    setNewStage(""); await load();
  };

  const delStage = async (id: string) => {
    const target = stages.find(s => s.id === id);
    await supabase.from("stages").delete().eq("id", id);
    logActivity({ module_key: MS, module_label: MSL, action_type: "crm_stage_deleted", entity_type: "crm_stage", entity_id: id, entity_label: target?.name, summary: `CRM stage '${target?.name ?? id}' deleted.`, severity: "warning" });
    await load();
  };

  return (
    <div className={cardCls + " p-6"}>
      <h2 className={h2Cls}>Calling CRM Settings</h2>
      <p className={subCls}>Manage CRM pipelines and stages. Changes appear in Calling CRM kanban and dropdowns.</p>

      <div className="mt-6 grid grid-cols-[260px_1fr] gap-5">
        <div className="border border-line rounded-lg p-2">
          <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground px-2 py-1.5">Pipelines</div>
          {pipelines.map((p) => (
            <button key={p.id} onClick={() => setActivePipeline(p.id)}
              className={"w-full text-left px-3 py-2 rounded-md font-sans text-[13px] " + (activePipeline === p.id ? "bg-black text-white" : "hover:bg-off")}>
              {p.name} <span className="text-[10px] opacity-60">({p.type})</span>
            </button>
          ))}
        </div>

        <div>
          <div className="flex gap-2 mb-3">
            <input className={inputCls + " flex-1"} placeholder="Add stage…" value={newStage}
              onChange={(e) => setNewStage(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addStage()} />
            <button className={btnPrimary} onClick={addStage}>Add Stage</button>
          </div>
          <div className="border border-line rounded-lg overflow-hidden">
            {pStages.length === 0 && <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">No stages</div>}
            {pStages.map((s) => (
              <div key={s.id} className="flex items-center px-4 py-3 border-b border-line last:border-b-0">
                <span className="text-[12px] text-muted-foreground w-8">#{s.position + 1}</span>
                <span className="font-serif text-[15px] flex-1">{s.name}</span>
                <button className="w-7 h-7 rounded-md hover:bg-[#FEF2F2] text-muted-foreground hover:text-[#DC2626]" onClick={() => delStage(s.id)}>🗑</button>
              </div>
            ))}
          </div>
          <p className="mt-3 font-sans text-[11px] text-muted-foreground">Tip: Also configure Lead Sources, Calling Outcomes, and Drop Reasons via the General Dropdowns tab.</p>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── Recovery Settings ─────────────────────────
function RecoverySettingsSection() {
  const [s, setS] = useState<any>({
    high_value_threshold: 50000,
    age_buckets: "0-1, 2-3, 4-7, 8-15, 16-30, 30+",
    red_flag_balance_days: 7,
    red_flag_finance_days: 3,
    red_flag_no_followup: true,
    red_flag_owner_missing: true,
    red_flag_hot_overdue: true,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => { (async () => {
    const { data } = await supabase.from("app_settings" as any)
      .select("setting_key, setting_value").eq("setting_group", "payment_recovery").eq("is_deleted", false);
    const next = { ...s };
    (data as any[] | null)?.forEach(r => { next[r.setting_key] = r.setting_value?.v ?? r.setting_value; });
    setS(next); setLoading(false);
  })(); /* eslint-disable-next-line */ }, []);

  const save = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    for (const [k, v] of Object.entries(s)) {
      const { data: existing } = await supabase.from("app_settings" as any)
        .select("id").eq("setting_group", "payment_recovery").eq("setting_key", k).eq("is_deleted", false).maybeSingle();
      if (existing) await supabase.from("app_settings" as any).update({ setting_value: { v } }).eq("id", (existing as any).id);
      else await supabase.from("app_settings" as any).insert({ setting_group: "payment_recovery", setting_key: k, setting_value: { v }, created_by: user?.id ?? null } as any);
    }
    toast.success("Recovery settings saved");
    logActivity({ module_key: MS, module_label: MSL, action_type: "recovery_threshold_updated", entity_type: "payment_recovery_settings", new_values: s, summary: "Payment recovery thresholds updated." });
  };

  if (loading) return <div className="font-sans text-[13px] text-muted-foreground">Loading…</div>;

  return (
    <div className={cardCls + " p-6"}>
      <h2 className={h2Cls}>Payment Recovery Settings</h2>
      <p className={subCls}>Thresholds and red flag rules used by the Payment Recovery dashboard.</p>
      <div className="grid grid-cols-2 gap-4 mt-5">
        <div><label className={labelCls}>High Value Pending Threshold</label><input type="number" className={inputCls} value={s.high_value_threshold} onChange={(e) => setS({ ...s, high_value_threshold: Number(e.target.value) })} /></div>
        <div><label className={labelCls}>Age Buckets (comma-separated)</label><input className={inputCls} value={s.age_buckets} onChange={(e) => setS({ ...s, age_buckets: e.target.value })} /></div>
        <div><label className={labelCls}>Balance Older Than (days)</label><input type="number" className={inputCls} value={s.red_flag_balance_days} onChange={(e) => setS({ ...s, red_flag_balance_days: Number(e.target.value) })} /></div>
        <div><label className={labelCls}>Finance Pending More Than (days)</label><input type="number" className={inputCls} value={s.red_flag_finance_days} onChange={(e) => setS({ ...s, red_flag_finance_days: Number(e.target.value) })} /></div>
      </div>
      <div className="mt-5 space-y-2.5">
        {[
          ["red_flag_no_followup", "Flag: Token paid but no follow-up"],
          ["red_flag_owner_missing", "Flag: Owner not assigned"],
          ["red_flag_hot_overdue", "Flag: Hot lead overdue"],
        ].map(([k, l]) => (
          <label key={k} className="flex items-center gap-2 font-sans text-[13px]">
            <input type="checkbox" checked={!!s[k]} onChange={(e) => setS({ ...s, [k]: e.target.checked })} />
            {l}
          </label>
        ))}
      </div>
      <div className="mt-6"><button className={btnPrimary} onClick={save}>Save Recovery Settings</button></div>
    </div>
  );
}

// ───────────────────────── Webinar Settings ─────────────────────────
function WebinarSettingsSection() {
  return (
    <QSGroup
      title="Webinar Settings"
      subtitle="Manage webinar types, platforms, operators, and default conversion settings."
      groups={[
        { field: "webinar_type", label: "Webinar Types" },
        { field: "webinar_platform", label: "Platforms" },
        { field: "webinar_operator", label: "Operators" },
        { field: "ad_spend_source", label: "Ad Spend Sources" },
        { field: "calculation_method", label: "Calculation Methods" },
        { field: "conversion_basis", label: "Conversion Basis" },
      ]}
    />
  );
}

// ───────────────────────── Eligibility Defaults (info + per-role defaults) ─────────────────────────
function EligibilitySection() {
  const [defaults, setDefaults] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  const ROLES = ["Admin", "Sales Executive", "Sales Manager", "Calling Executive", "Finance Executive", "Backend Operations", "Onboarding Executive"];
  const FLAGS = [
    { k: "can_receive_calling_crm_leads", l: "Calling CRM" },
    { k: "can_receive_paid_pipeline_leads", l: "Paid Pipeline" },
    { k: "can_receive_follow_up_tasks", l: "Follow-Up" },
    { k: "can_receive_payment_recovery_leads", l: "Payment Recovery" },
    { k: "include_in_round_robin", l: "Round Robin" },
  ];

  useEffect(() => { (async () => {
    const { data } = await supabase.from("app_settings" as any)
      .select("setting_key, setting_value").eq("setting_group", "eligibility_defaults").eq("is_deleted", false);
    const map: any = {};
    (data as any[] | null)?.forEach(r => { map[r.setting_key] = r.setting_value; });
    setDefaults(map); setLoading(false);
  })(); }, []);

  const toggle = async (role: string, flag: string, val: boolean) => {
    const key = role;
    const cur = defaults[key] || {};
    const next = { ...cur, [flag]: val };
    setDefaults({ ...defaults, [key]: next });
    const { data: { user } } = await supabase.auth.getUser();
    const { data: existing } = await supabase.from("app_settings" as any)
      .select("id").eq("setting_group", "eligibility_defaults").eq("setting_key", key).eq("is_deleted", false).maybeSingle();
    if (existing) await supabase.from("app_settings" as any).update({ setting_value: next }).eq("id", (existing as any).id);
    else await supabase.from("app_settings" as any).insert({ setting_group: "eligibility_defaults", setting_key: key, setting_value: next, created_by: user?.id ?? null } as any);
    logActivity({ module_key: MS, module_label: MSL, action_type: "eligibility_default_updated", entity_type: "eligibility_default", entity_label: role, old_values: { [flag]: cur[flag] ?? false }, new_values: { [flag]: val }, summary: `Eligibility default for ${role}: ${flag} ${val ? "enabled" : "disabled"}.` });
  };

  if (loading) return <div className="font-sans text-[13px] text-muted-foreground">Loading…</div>;

  return (
    <div className={cardCls + " p-6"}>
      <h2 className={h2Cls}>Assignment Eligibility Defaults</h2>
      <p className={subCls}>Module access controls what a user can open. Assignment eligibility controls whether a user can receive leads/tasks.</p>
      <div className="mt-3 p-3 rounded-md bg-gold-pale/30 border border-gold-pale font-sans text-[12px] text-black">
        These defaults are saved as guidance for admins creating new team members. They are <span className="font-medium">not auto-applied</span> to existing users — set per-user toggles in Team Directory → Manage Member.
      </div>

      <div className="mt-5 border border-line rounded-lg overflow-hidden">
        <div className="grid bg-off px-4 py-2.5 text-[10px] uppercase tracking-[0.1em] text-muted-foreground font-sans" style={{ gridTemplateColumns: `220px repeat(${FLAGS.length}, 1fr)` }}>
          <div>Role</div>
          {FLAGS.map(f => <div key={f.k} className="text-center">{f.l}</div>)}
        </div>
        {ROLES.map(role => (
          <div key={role} className="grid border-t border-line px-4 py-3 items-center" style={{ gridTemplateColumns: `220px repeat(${FLAGS.length}, 1fr)` }}>
            <div className="font-serif text-[14px]">{role}</div>
            {FLAGS.map(f => (
              <div key={f.k} className="text-center">
                <input type="checkbox" checked={!!defaults[role]?.[f.k]} onChange={(e) => toggle(role, f.k, e.target.checked)} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────── WhatsApp Templates ─────────────────────────
const WA_TEMPLATES = [
  { key: "token_received", label: "Token Received" },
  { key: "second_token_reminder", label: "Second Token Reminder" },
  { key: "balance_reminder", label: "Balance Payment Reminder" },
  { key: "finance_docs_reminder", label: "Finance Documents Reminder" },
  { key: "finance_approval_followup", label: "Finance Approval Follow-Up" },
  { key: "welcome_call", label: "Welcome Call Reminder" },
  { key: "onboarding_reminder", label: "Onboarding Reminder" },
  { key: "missed_followup", label: "Missed Follow-Up" },
  { key: "recovery_soft", label: "Payment Recovery Soft Reminder" },
];
const WA_VARS = ["{Name}","{Program}","{TokenAmount}","{BalanceAmount}","{PaidBatch}","{FollowUpDate}","{FollowUpTime}","{FinancePartner}","{PaymentLink}"];

function WhatsAppTemplatesSection() {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => { (async () => {
    const { data } = await supabase.from("app_settings" as any)
      .select("setting_key, setting_value").eq("setting_group", "whatsapp_template").eq("is_deleted", false);
    const m: Record<string, string> = {};
    (data as any[] | null)?.forEach(r => { m[r.setting_key] = r.setting_value?.v ?? ""; });
    setVals(m); setLoading(false);
  })(); }, []);

  const save = async (key: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    const v = vals[key] ?? "";
    const { data: existing } = await supabase.from("app_settings" as any)
      .select("id").eq("setting_group", "whatsapp_template").eq("setting_key", key).eq("is_deleted", false).maybeSingle();
    if (existing) await supabase.from("app_settings" as any).update({ setting_value: { v } }).eq("id", (existing as any).id);
    else await supabase.from("app_settings" as any).insert({ setting_group: "whatsapp_template", setting_key: key, setting_value: { v }, created_by: user?.id ?? null } as any);
    toast.success("Template saved");
    const label = WA_TEMPLATES.find(t => t.key === key)?.label ?? key;
    logActivity({ module_key: MS, module_label: MSL, action_type: "whatsapp_template_updated", entity_type: "whatsapp_template", entity_label: label, new_values: { template: v }, summary: `WhatsApp template '${label}' updated.` });
  };

  if (loading) return <div className="font-sans text-[13px] text-muted-foreground">Loading…</div>;

  return (
    <div className={cardCls + " p-6"}>
      <h2 className={h2Cls}>WhatsApp Template Defaults</h2>
      <p className={subCls}>Default WhatsApp messages used across Paid Pipeline, Follow-Up, Recovery, Finance, and CRM.</p>
      <div className="mt-3 font-sans text-[11px] text-muted-foreground">Variables: {WA_VARS.join("  ")}</div>

      <div className="mt-5 space-y-4">
        {WA_TEMPLATES.map(t => (
          <div key={t.key} className="border border-line rounded-md p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="font-serif text-[15px]">{t.label}</div>
              <button className="h-8 px-3 text-[12px] bg-black text-white rounded-md hover:opacity-90" onClick={() => save(t.key)}>Save</button>
            </div>
            <textarea className={inputCls + " h-[88px] py-2"} value={vals[t.key] ?? ""} onChange={(e) => setVals({ ...vals, [t.key]: e.target.value })} placeholder="Type your default template message…" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────── General Dropdowns ─────────────────────────
function GeneralDropdownsSection() {
  const [rows, setRows] = useState<QSEntry[]>([]);
  const [filter, setFilter] = useState("");
  const [newField, setNewField] = useState("");
  const [newVal, setNewVal] = useState("");

  const load = async () => {
    const { data } = await supabase.from("quick_save_entries")
      .select("id, field_key, value, sort_order, is_active")
      .eq("is_active", true).order("field_key").order("value");
    setRows((data as QSEntry[]) || []);
  };
  useEffect(() => { load(); }, []);

  const fields = Array.from(new Set(rows.map(r => r.field_key))).sort();
  const filtered = rows.filter(r => !filter || r.field_key === filter);

  const add = async () => {
    if (!newField.trim() || !newVal.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    const fk = newField.trim(), v = newVal.trim();
    const { error } = await supabase.from("quick_save_entries").insert({ field_key: fk, value: v, created_by: user?.id ?? null });
    if (error) { toast.error(error.message); return; }
    logActivity({ module_key: MS, module_label: MSL, action_type: "dropdown_option_created", entity_type: "quick_save_entry", entity_label: v, new_values: { field_key: fk, value: v }, summary: `Dropdown option '${v}' added to ${fk}.` });
    setNewVal(""); await load();
  };
  const del = async (id: string) => {
    const target = rows.find(r => r.id === id);
    await supabase.from("quick_save_entries").update({ is_active: false }).eq("id", id);
    logActivity({ module_key: MS, module_label: MSL, action_type: "dropdown_option_deactivated", entity_type: "quick_save_entry", entity_id: id, entity_label: target?.value, summary: `Dropdown option '${target?.value ?? id}' deactivated.`, severity: "warning" });
    await load();
  };

  return (
    <div className={cardCls + " p-6"}>
      <h2 className={h2Cls}>General Dropdown Options</h2>
      <p className={subCls}>All saved quick-save dropdown values across the app.</p>

      <div className="flex gap-2 mt-5 mb-3">
        <input className={inputCls + " w-[200px]"} placeholder="Field key (e.g. lead_source)" value={newField} onChange={(e) => setNewField(e.target.value)} />
        <input className={inputCls + " flex-1"} placeholder="Value" value={newVal} onChange={(e) => setNewVal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className={btnPrimary} onClick={add}>Add</button>
      </div>

      <select className={inputCls + " w-[260px] mb-3"} value={filter} onChange={(e) => setFilter(e.target.value)}>
        <option value="">All fields ({rows.length})</option>
        {fields.map(f => <option key={f} value={f}>{f} ({rows.filter(r => r.field_key === f).length})</option>)}
      </select>

      <div className="border border-line rounded-lg overflow-hidden">
        <div className="grid grid-cols-[200px_1fr_100px] bg-off px-4 py-2.5 text-[10px] uppercase tracking-[0.1em] text-muted-foreground font-sans">
          <div>Field Key</div><div>Value</div><div className="text-right">Actions</div>
        </div>
        {filtered.length === 0 && <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">No entries</div>}
        {filtered.map(r => (
          <div key={r.id} className="grid grid-cols-[200px_1fr_100px] px-4 py-2.5 border-t border-line items-center hover:bg-off/50">
            <div className="font-sans text-[12px] text-muted-foreground">{r.field_key}</div>
            <div className="font-serif text-[14px]">{r.value}</div>
            <div className="text-right">
              <button className="w-7 h-7 rounded-md hover:bg-[#FEF2F2] text-muted-foreground hover:text-[#DC2626]" onClick={() => del(r.id)}>🗑</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────── Tags Section ─────────────────────────
function TagsSection() {
  const [tags, setTags] = useState<any[]>([]);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [newName, setNewName] = useState("");
  const [newScope, setNewScope] = useState("all");
  const [filter, setFilter] = useState<"active" | "all">("active");

  const load = async () => {
    const { data } = await supabase.from("tags" as any)
      .select("id, name, color, module_scope, is_active, is_deleted")
      .eq("is_deleted", false)
      .order("name");
    const rows = ((data as any[]) || []).filter(r => filter === "all" || r.is_active);
    setTags(rows);
    // usage counts
    const counts: Record<string, number> = {};
    for (const t of rows) {
      const { count } = await supabase.from("lead_tag_assignments" as any)
        .select("id", { count: "exact", head: true }).eq("tag_id", t.id);
      counts[t.id] = count || 0;
    }
    setUsage(counts);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);

  const add = async () => {
    const v = newName.trim();
    if (!v) return;
    const { data: existing } = await supabase.from("tags" as any)
      .select("id").ilike("name", v).eq("module_scope", newScope).maybeSingle();
    if (existing) { toast.error("Tag already exists"); return; }
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("tags" as any).insert({
      name: v, module_scope: newScope, created_by: user?.id ?? null,
    } as any);
    if (error) { toast.error(error.message); return; }
    logActivity({ module_key: MS, module_label: MSL, action_type: "tag_created", entity_type: "tag", entity_label: v, new_values: { name: v, module_scope: newScope }, summary: `Tag '${v}' created.` });
    setNewName(""); await load();
  };

  const toggleActive = async (t: any) => {
    const next = !t.is_active;
    await supabase.from("tags" as any).update({ is_active: next } as any).eq("id", t.id);
    logActivity({ module_key: MS, module_label: MSL, action_type: next ? "tag_activated" : "tag_deactivated", entity_type: "tag", entity_id: t.id, entity_label: t.name, summary: `Tag '${t.name}' ${next ? "activated" : "deactivated"}.`, severity: next ? "info" : "warning" });
    await load();
  };

  const remove = async (t: any) => {
    const u = usage[t.id] || 0;
    if (u > 0) {
      if (!confirm(`Tag '${t.name}' is used by ${u} lead(s). Deactivate instead?`)) return;
      await toggleActive({ ...t, is_active: true });
      return;
    }
    if (!confirm(`Delete tag '${t.name}'?`)) return;
    await supabase.from("tags" as any).update({ is_deleted: true, is_active: false } as any).eq("id", t.id);
    logActivity({ module_key: MS, module_label: MSL, action_type: "tag_deleted", entity_type: "tag", entity_id: t.id, entity_label: t.name, summary: `Tag '${t.name}' deleted.`, severity: "warning" });
    await load();
  };

  return (
    <div className={cardCls + " p-6"}>
      <h2 className={h2Cls}>Tags</h2>
      <p className={subCls}>Manage lead tags used by Calling CRM and Paid Pipeline. Tags in use cannot be hard-deleted — deactivate them instead.</p>

      <div className="flex gap-2 mt-5 mb-3">
        <input className={inputCls + " flex-1"} placeholder="New tag name…" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <select className={inputCls + " w-[180px]"} value={newScope} onChange={(e) => setNewScope(e.target.value)}>
          <option value="all">All modules</option>
          <option value="crm">Calling CRM</option>
          <option value="paid">Paid Pipeline</option>
        </select>
        <button className={btnPrimary} onClick={add}>Add Tag</button>
      </div>

      <div className="flex gap-2 mb-3">
        <button className={"text-[12px] px-3 py-1.5 rounded-md " + (filter === "active" ? "bg-black text-white" : "border border-line")} onClick={() => setFilter("active")}>Active</button>
        <button className={"text-[12px] px-3 py-1.5 rounded-md " + (filter === "all" ? "bg-black text-white" : "border border-line")} onClick={() => setFilter("all")}>All</button>
      </div>

      <div className="border border-line rounded-lg overflow-hidden">
        <div className="grid grid-cols-[1fr_140px_100px_100px_120px] bg-off px-4 py-2.5 text-[10px] uppercase tracking-[0.1em] text-muted-foreground font-sans">
          <div>Name</div><div>Scope</div><div>Usage</div><div>Active</div><div className="text-right">Actions</div>
        </div>
        {tags.length === 0 && <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">No tags</div>}
        {tags.map((t) => (
          <div key={t.id} className="grid grid-cols-[1fr_140px_100px_100px_120px] px-4 py-3 border-t border-line items-center hover:bg-off/50">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.color || "#888" }} />
              <span className="font-serif text-[15px]">{t.name}</span>
              {!t.is_active && <span className="text-[10px] text-muted-foreground">(inactive)</span>}
            </div>
            <div className="font-sans text-[12px] text-muted-foreground">{t.module_scope}</div>
            <div className="font-sans text-[12px]">{usage[t.id] ?? "—"}</div>
            <div>
              <button onClick={() => toggleActive(t)} className={"text-[11px] px-2 py-0.5 rounded-full " + (t.is_active ? "bg-gold-pale text-gold-deep" : "bg-off text-muted-foreground")}>
                {t.is_active ? "Active" : "Inactive"}
              </button>
            </div>
            <div className="text-right">
              <button className="w-7 h-7 rounded-md hover:bg-[#FEF2F2] text-muted-foreground hover:text-[#DC2626]" onClick={() => remove(t)}>🗑</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────── Stage Sync Rules Section ─────────────────────────
type SyncRuleRow = {
  id: string;
  rule_name: string;
  trigger_module: string;
  trigger_field: string;
  trigger_value: string;
  suggested_module: string;
  suggested_field: string;
  suggested_value: string;
  notes: string | null;
  is_active: boolean;
  sort_order: number;
};

function StageSyncRulesSection() {
  const [rows, setRows] = useState<SyncRuleRow[]>([]);
  const [editing, setEditing] = useState<Partial<SyncRuleRow> | null>(null);

  const load = async () => {
    const { data } = await supabase.from("stage_sync_rules" as any)
      .select("*").order("sort_order").order("rule_name");
    setRows((data as any) || []);
  };
  useEffect(() => { load(); }, []);

  const blank = (): Partial<SyncRuleRow> => ({
    rule_name: "", trigger_module: "paid", trigger_field: "finance_status",
    trigger_value: "", suggested_module: "crm", suggested_field: "stage",
    suggested_value: "", is_active: true, sort_order: rows.length,
  });

  const save = async () => {
    if (!editing) return;
    if (!editing.rule_name?.trim()) { toast.error("Rule name required"); return; }
    if (!editing.trigger_value?.trim() || !editing.suggested_value?.trim()) { toast.error("Trigger and suggested values required"); return; }
    const { data: { user } } = await supabase.auth.getUser();
    const payload: any = { ...editing };
    if (!editing.id) payload.created_by = user?.id ?? null;
    const oldRow = editing.id ? rows.find(r => r.id === editing.id) : null;
    const op = editing.id
      ? supabase.from("stage_sync_rules" as any).update(payload).eq("id", editing.id)
      : supabase.from("stage_sync_rules" as any).insert(payload);
    const { error } = await op;
    if (error) { toast.error(error.message); return; }
    logActivity({
      module_key: MS, module_label: MSL,
      action_type: editing.id ? "master_setting_updated" : "master_setting_created",
      entity_type: "stage_sync_rule", entity_id: editing.id ?? null, entity_label: editing.rule_name,
      old_values: oldRow ?? null, new_values: payload,
      summary: editing.id ? `Stage sync rule '${editing.rule_name}' updated.` : `Stage sync rule '${editing.rule_name}' created.`,
    });
    setEditing(null); await load();
  };

  const toggleActive = async (r: SyncRuleRow) => {
    await supabase.from("stage_sync_rules" as any).update({ is_active: !r.is_active } as any).eq("id", r.id);
    logActivity({ module_key: MS, module_label: MSL, action_type: r.is_active ? "master_setting_deactivated" : "master_setting_updated", entity_type: "stage_sync_rule", entity_id: r.id, entity_label: r.rule_name, summary: `Stage sync rule '${r.rule_name}' ${r.is_active ? "deactivated" : "activated"}.`, severity: r.is_active ? "warning" : "info" });
    await load();
  };

  const remove = async (r: SyncRuleRow) => {
    if (!confirm(`Delete rule '${r.rule_name}'?`)) return;
    await supabase.from("stage_sync_rules" as any).delete().eq("id", r.id);
    logActivity({ module_key: MS, module_label: MSL, action_type: "master_setting_deactivated", entity_type: "stage_sync_rule", entity_id: r.id, entity_label: r.rule_name, summary: `Stage sync rule '${r.rule_name}' deleted.`, severity: "warning" });
    await load();
  };

  const MODULES = [{ v: "crm", l: "Calling CRM" }, { v: "paid", l: "Paid Pipeline" }];
  const CRM_FIELDS = [{ v: "stage", l: "Stage" }];
  const PAID_FIELDS = [
    { v: "pipeline_stage", l: "Pipeline Stage" },
    { v: "finance_status", l: "Finance Status" },
    { v: "payment_status", l: "Payment Status" },
    { v: "balance_category", l: "Balance Category" },
    { v: "lead_temperature", l: "Lead Temperature" },
  ];
  const fieldsFor = (m?: string) => (m === "paid" ? PAID_FIELDS : CRM_FIELDS);

  return (
    <div className={cardCls + " p-6"}>
      <div className="flex items-start justify-between">
        <div>
          <h2 className={h2Cls}>Stage Sync Rules</h2>
          <p className={subCls}>Configure suggestions that appear in CRM and Paid Pipeline drawers. Rules never auto-apply — users review and apply each suggestion manually.</p>
        </div>
        <button className={btnPrimary} onClick={() => setEditing(blank())}>+ Add Rule</button>
      </div>

      <div className="mt-3 p-3 rounded-md bg-gold-pale/30 border border-gold-pale font-sans text-[12px] text-black">
        Built-in suggestions for Payment Confirmed → Token Paid, balance = 0 → Final Sale, Finance Approved/Disbursed → CRM stage, Dropped After Token → Refund, and Urgent Follow-Up tag → schedule follow-up are always active and do not require a rule.
      </div>

      <div className="mt-5 border border-line rounded-lg overflow-hidden">
        <div className="grid grid-cols-[1.4fr_2fr_2fr_90px_100px] bg-off px-4 py-2.5 text-[10px] uppercase tracking-[0.1em] text-muted-foreground font-sans">
          <div>Rule</div><div>When</div><div>Suggest</div><div>Active</div><div className="text-right">Actions</div>
        </div>
        {rows.length === 0 && <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">No custom rules yet</div>}
        {rows.map(r => (
          <div key={r.id} className="grid grid-cols-[1.4fr_2fr_2fr_90px_100px] px-4 py-3 border-t border-line items-center hover:bg-off/50">
            <div className="font-serif text-[14px]">{r.rule_name}</div>
            <div className="font-sans text-[12px] text-muted-foreground">{r.trigger_module}.{r.trigger_field} = <span className="text-black">{r.trigger_value}</span></div>
            <div className="font-sans text-[12px] text-muted-foreground">{r.suggested_module}.{r.suggested_field} → <span className="text-black">{r.suggested_value}</span></div>
            <div><button onClick={() => toggleActive(r)} className={"text-[11px] px-2 py-0.5 rounded-full " + (r.is_active ? "bg-gold-pale text-gold-deep" : "bg-off text-muted-foreground")}>{r.is_active ? "Active" : "Inactive"}</button></div>
            <div className="flex gap-1.5 justify-end">
              <button className="w-7 h-7 rounded-md hover:bg-off text-muted-foreground hover:text-black" onClick={() => setEditing(r)}>✎</button>
              <button className="w-7 h-7 rounded-md hover:bg-[#FEF2F2] text-muted-foreground hover:text-[#DC2626]" onClick={() => remove(r)}>🗑</button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-lg p-6 w-[640px] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-serif text-[20px] mb-5">{editing.id ? "Edit" : "Add"} Stage Sync Rule</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className={labelCls}>Rule Name</label>
                <input className={inputCls} value={editing.rule_name ?? ""} onChange={(e) => setEditing({ ...editing, rule_name: e.target.value })} />
              </div>

              <div className="col-span-2 text-[11px] uppercase tracking-wider text-muted-foreground mt-2">Trigger</div>
              <div>
                <label className={labelCls}>Module</label>
                <select className={inputCls} value={editing.trigger_module ?? "paid"} onChange={(e) => setEditing({ ...editing, trigger_module: e.target.value, trigger_field: fieldsFor(e.target.value)[0].v })}>
                  {MODULES.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Field</label>
                <select className={inputCls} value={editing.trigger_field ?? ""} onChange={(e) => setEditing({ ...editing, trigger_field: e.target.value })}>
                  {fieldsFor(editing.trigger_module).map(f => <option key={f.v} value={f.v}>{f.l}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Trigger Value</label>
                <input className={inputCls} value={editing.trigger_value ?? ""} onChange={(e) => setEditing({ ...editing, trigger_value: e.target.value })} placeholder="e.g. Approved" />
              </div>

              <div className="col-span-2 text-[11px] uppercase tracking-wider text-muted-foreground mt-2">Suggestion</div>
              <div>
                <label className={labelCls}>Module</label>
                <select className={inputCls} value={editing.suggested_module ?? "crm"} onChange={(e) => setEditing({ ...editing, suggested_module: e.target.value, suggested_field: fieldsFor(e.target.value)[0].v })}>
                  {MODULES.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Field</label>
                <select className={inputCls} value={editing.suggested_field ?? ""} onChange={(e) => setEditing({ ...editing, suggested_field: e.target.value })}>
                  {fieldsFor(editing.suggested_module).map(f => <option key={f.v} value={f.v}>{f.l}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Suggested Value</label>
                <input className={inputCls} value={editing.suggested_value ?? ""} onChange={(e) => setEditing({ ...editing, suggested_value: e.target.value })} placeholder="e.g. Finance Approved" />
              </div>

              <div>
                <label className={labelCls}>Sort</label>
                <input type="number" className={inputCls} value={editing.sort_order ?? 0} onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })} />
              </div>
              <div>
                <label className={labelCls}>Active</label>
                <select className={inputCls} value={String(editing.is_active ?? true)} onChange={(e) => setEditing({ ...editing, is_active: e.target.value === "true" })}>
                  <option value="true">Active</option><option value="false">Inactive</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Notes (optional)</label>
                <textarea className={inputCls + " h-[64px] py-2"} value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button className={btnGhost} onClick={() => setEditing(null)}>Cancel</button>
              <button className={btnPrimary} onClick={save}>Save Rule</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
