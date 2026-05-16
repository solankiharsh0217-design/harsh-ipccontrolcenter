import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { PageHead, SectionLabel } from "@/components/ui-bits";
import { inr, fmtDate, downloadCsv, DEFAULT_FINANCE_PARTNERS } from "@/lib/paidPipeline";
import { getEligibleAssignees, type EligibleAssignee } from "@/lib/eligibleAssignees";
import QuickFollowUpModal from "@/components/paid-pipeline/QuickFollowUpModal";
import QuickAddPaymentModal from "@/components/paid-pipeline/QuickAddPaymentModal";

type Lead = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  product_id: string | null;
  product_name_snapshot: string | null;
  paid_batch_id: string | null;
  paid_batch_name: string | null;
  onboarding_batch_name: string | null;
  source_webinar_batch_id: string | null;
  deal_value_including_gst: number;
  token_amount_collected: number;
  total_collected: number;
  balance_pending: number;
  revenue_to_be_realized: number | null;
  balance_category: string | null;
  lead_temperature: string | null;
  pipeline_stage: string | null;
  payment_status: string | null;
  assigned_sales_executive: string | null;
  next_follow_up_date: string | null;
  next_follow_up_time: string | null;
  follow_up_reason: string | null;
  follow_up_priority: string | null;
  finance_required: boolean;
  finance_partner: string | null;
  finance_status: string | null;
  finance_follow_up_date: string | null;
  is_final_sale: boolean;
  is_enrolled: boolean;
  is_dropped: boolean;
  is_refunded: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
};

type Payment = {
  id: string;
  paid_pipeline_lead_id: string;
  amount: number;
  payment_date: string;
  payment_category: string | null;
  payment_type: string | null;
  next_payment_expected_date: string | null;
};

const today = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a: string | null | undefined, b: string) => {
  if (!a) return null;
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
};
const ageBucket = (days: number | null) => {
  if (days === null) return "30+ Days";
  if (days <= 1) return "0–1 Days";
  if (days <= 3) return "2–3 Days";
  if (days <= 7) return "4–7 Days";
  if (days <= 15) return "8–15 Days";
  if (days <= 30) return "16–30 Days";
  return "30+ Days";
};
const BUCKETS = ["0–1 Days", "2–3 Days", "4–7 Days", "8–15 Days", "16–30 Days", "30+ Days"];

const WA_TEMPLATES: { name: string; body: string }[] = [
  { name: "Balance Payment Reminder", body: "Hi {Name}, gentle reminder for the balance of ₹{BalanceAmount} pending for your {Program} ({PaidBatch}). Can we close this today? — IPC" },
  { name: "Second Token Reminder", body: "Hi {Name}, awaiting the second token payment for {Program}. Shall I share the payment link?" },
  { name: "Down Payment Reminder", body: "Hi {Name}, please complete the down payment of ₹{BalanceAmount} for {Program} so we can confirm your seat in {PaidBatch}." },
  { name: "Finance Documents Reminder", body: "Hi {Name}, your {FinancePartner} application needs the pending documents. Please share at the earliest so we can move ahead." },
  { name: "Finance Approval Reminder", body: "Hi {Name}, following up on the {FinancePartner} approval for your {Program} enrollment. Any update from your side?" },
  { name: "Payment Link Sent Follow-Up", body: "Hi {Name}, just checking if you received the payment link for ₹{BalanceAmount}. Need any help to complete it?" },
  { name: "High Priority Recovery", body: "Hi {Name}, your {Program} seat in {PaidBatch} is on hold pending ₹{BalanceAmount}. Please confirm by {FollowUpDate}." },
  { name: "Soft Reminder", body: "Hi {Name}, hope you're doing well — just a soft reminder on your pending payment for {Program}. Let me know a good time to call." },
  { name: "Last Follow-Up Before Closure", body: "Hi {Name}, this is the final reminder for the ₹{BalanceAmount} pending. If we don't hear back by {FollowUpDate}, we'll have to release your slot." },
];

function fillTemplate(body: string, l: Lead) {
  return body
    .replaceAll("{Name}", l.name || "")
    .replaceAll("{Program}", l.product_name_snapshot || "your program")
    .replaceAll("{TokenAmount}", String(l.token_amount_collected || 0))
    .replaceAll("{BalanceAmount}", String(l.balance_pending || 0))
    .replaceAll("{PaidBatch}", l.paid_batch_name || "")
    .replaceAll("{FollowUpDate}", l.next_follow_up_date ? fmtDate(l.next_follow_up_date) : "")
    .replaceAll("{FollowUpTime}", l.next_follow_up_time || "")
    .replaceAll("{FinancePartner}", l.finance_partner || "the finance partner")
    .replaceAll("{PaymentLink}", "");
}

const Pill = ({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "red" | "amber" | "blue" | "green" | "violet" }) => {
  const tones: Record<string, string> = {
    neutral: "bg-slate-50 border-slate-200 text-slate-700",
    red: "bg-rose-50 border-rose-200 text-rose-700",
    amber: "bg-amber-50 border-amber-200 text-amber-800",
    blue: "bg-blue-50 border-blue-200 text-blue-800",
    green: "bg-emerald-50 border-emerald-200 text-emerald-800",
    violet: "bg-violet-50 border-violet-200 text-violet-800",
  };
  return <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] border ${tones[tone]}`}>{children}</span>;
};

export default function PaymentRecovery() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [assignees, setAssignees] = useState<EligibleAssignee[]>([]);

  // filters
  const [search, setSearch] = useState("");
  const [fProduct, setFProduct] = useState("");
  const [fPaidBatch, setFPaidBatch] = useState("");
  const [fOwner, setFOwner] = useState("");
  const [fPriority, setFPriority] = useState("");
  const [fStage, setFStage] = useState("");
  const [fBalCat, setFBalCat] = useState("");
  const [fFinPartner, setFFinPartner] = useState("");
  const [fFinStatus, setFFinStatus] = useState("");
  const [fBucket, setFBucket] = useState("");
  const [chip, setChip] = useState<string>("all");
  const [redFlagKey, setRedFlagKey] = useState<string>("");

  // selection / modals
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [followUpFor, setFollowUpFor] = useState<Lead | null>(null);
  const [paymentFor, setPaymentFor] = useState<Lead | null>(null);
  const [bulkFollowUp, setBulkFollowUp] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: leadRows }, { data: payRows }, eligible] = await Promise.all([
        supabase.from("paid_pipeline_leads").select("*").eq("is_deleted", false).limit(5000),
        supabase.from("paid_pipeline_payments").select("id, paid_pipeline_lead_id, amount, payment_date, payment_category, payment_type, next_payment_expected_date").eq("is_deleted", false).limit(20000),
        getEligibleAssignees(["payment_recovery", "paid_pipeline", "calling_crm"]),
      ]);
      setLeads((leadRows as any[]) || []);
      setPayments((payRows as any[]) || []);
      setAssignees(eligible);
    } catch (e: any) {
      toast.error(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  // index payments per lead
  const paysByLead = useMemo(() => {
    const m = new Map<string, Payment[]>();
    for (const p of payments) {
      const arr = m.get(p.paid_pipeline_lead_id) || [];
      arr.push(p);
      m.set(p.paid_pipeline_lead_id, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => (b.payment_date || "").localeCompare(a.payment_date || ""));
    return m;
  }, [payments]);

  // active pending base set (non-dropped, non-refunded, balance>0, stage not Closed Lost)
  const activeBase = useMemo(() => {
    return leads.filter((l) => {
      const stage = l.pipeline_stage || "";
      if (l.is_dropped || l.is_refunded) return false;
      if (stage === "Closed Lost") return false;
      return Number(l.balance_pending || 0) > 0;
    });
  }, [leads]);

  const enriched = useMemo(() => {
    const t = today();
    return activeBase.map((l) => {
      const ps = paysByLead.get(l.id) || [];
      const lastPay = ps[0]?.payment_date || null;
      const nextExpected = ps.find((p) => p.next_payment_expected_date)?.next_payment_expected_date || null;
      const baseDate = lastPay || l.created_at?.slice(0, 10) || null;
      const ageDays = baseDate ? daysBetween(baseDate, t) : null;
      const bucket = ageBucket(ageDays);
      const isOverdue = (l.next_follow_up_date && l.next_follow_up_date < t) || (nextExpected && nextExpected < t);
      const dueThisWeek = (() => {
        const cutoff = new Date(t); cutoff.setDate(cutoff.getDate() + 7);
        const c = cutoff.toISOString().slice(0, 10);
        return (l.next_follow_up_date && l.next_follow_up_date >= t && l.next_follow_up_date <= c) ||
               (nextExpected && nextExpected >= t && nextExpected <= c);
      })();
      const dueToday = l.next_follow_up_date === t || nextExpected === t;
      return { lead: l, lastPay, nextExpected, ageDays, bucket, isOverdue: !!isOverdue, dueThisWeek: !!dueThisWeek, dueToday: !!dueToday };
    });
  }, [activeBase, paysByLead]);

  const productOptions = useMemo(() => Array.from(new Set(leads.map(l => l.product_name_snapshot).filter(Boolean) as string[])).sort(), [leads]);
  const batchOptions = useMemo(() => Array.from(new Set(leads.map(l => l.paid_batch_name).filter(Boolean) as string[])).sort(), [leads]);
  const stageOptions = useMemo(() => Array.from(new Set(leads.map(l => l.pipeline_stage).filter(Boolean) as string[])).sort(), [leads]);
  const balCatOptions = useMemo(() => Array.from(new Set(leads.map(l => l.balance_category).filter(Boolean) as string[])).sort(), [leads]);
  const finPartnerOptions = useMemo(() => {
    const fromData = Array.from(new Set(leads.map(l => l.finance_partner).filter(Boolean) as string[]));
    return Array.from(new Set([...DEFAULT_FINANCE_PARTNERS, ...fromData])).sort();
  }, [leads]);
  const finStatusOptions = useMemo(() => Array.from(new Set(leads.map(l => l.finance_status).filter(Boolean) as string[])).sort(), [leads]);

  // Apply filters
  const filteredRows = useMemo(() => {
    const t = today();
    const q = search.trim().toLowerCase();
    return enriched.filter(({ lead: l, isOverdue, dueToday, ageDays, bucket, nextExpected }) => {
      if (q && !((l.name||"").toLowerCase().includes(q) || (l.email||"").toLowerCase().includes(q) || (l.phone||"").toLowerCase().includes(q))) return false;
      if (fProduct && l.product_name_snapshot !== fProduct) return false;
      if (fPaidBatch && l.paid_batch_name !== fPaidBatch) return false;
      if (fOwner && l.assigned_sales_executive !== fOwner) return false;
      if (fOwner === "__unassigned__" && l.assigned_sales_executive) return false;
      if (fPriority && (l.lead_temperature || l.follow_up_priority) !== fPriority) return false;
      if (fStage && l.pipeline_stage !== fStage) return false;
      if (fBalCat && l.balance_category !== fBalCat) return false;
      if (fFinPartner && l.finance_partner !== fFinPartner) return false;
      if (fFinStatus && l.finance_status !== fFinStatus) return false;
      if (fBucket && bucket !== fBucket) return false;

      // chips
      switch (chip) {
        case "due_today": if (!dueToday) return false; break;
        case "overdue": if (!isOverdue) return false; break;
        case "hot": if (!["Urgent","Hot"].includes(l.lead_temperature||"") && !["Urgent","Hot"].includes(l.follow_up_priority||"")) return false; break;
        case "token_bal": if (!(Number(l.token_amount_collected||0) > 0 && Number(l.balance_pending||0) > 0)) return false; break;
        case "finance_pending": if (!l.finance_required || ["Disbursed","Rejected","Dropped"].includes(l.finance_status||"")) return false; break;
        case "second_token": if ((l.balance_category||"") !== "Second Token Pending") return false; break;
        case "down_payment": if ((l.balance_category||"") !== "Down Payment Pending") return false; break;
        case "no_followup": if (l.next_follow_up_date) return false; break;
        case "high_value": if (Number(l.balance_pending||0) < 100000) return false; break;
        case "dropped_risk": if ((l.lead_temperature||"") !== "Dropped Risk" && (l.balance_category||"") !== "Dropped Risk") return false; break;
      }

      // red flag presets
      switch (redFlagKey) {
        case "rf_high_no_fu": if (!(Number(l.balance_pending||0) >= 100000 && !l.next_follow_up_date)) return false; break;
        case "rf_token_no_next": if (!(Number(l.token_amount_collected||0) > 0 && !nextExpected)) return false; break;
        case "rf_fin_approved_not_disbursed": if (l.finance_status !== "Approved") return false; break;
        case "rf_fin_rejected_no_alt": if (!(["Rejected","Failed - Trying Another Partner"].includes(l.finance_status||""))) return false; break;
        case "rf_hot_overdue": if (!(isOverdue && ["Urgent","Hot"].includes(l.lead_temperature||""))) return false; break;
        case "rf_old_7": if (!(ageDays !== null && ageDays > 7)) return false; break;
        case "rf_unassigned": if (l.assigned_sales_executive) return false; break;
        case "rf_dropped_risk_high": if (!((l.lead_temperature||"") === "Dropped Risk" && Number(l.balance_pending||0) >= 50000)) return false; break;
      }
      return true;
    });
  }, [enriched, search, fProduct, fPaidBatch, fOwner, fPriority, fStage, fBalCat, fFinPartner, fFinStatus, fBucket, chip, redFlagKey]);

  // Summary cards
  const cards = useMemo(() => {
    const sum = (rows: typeof enriched, fn: (l: Lead) => number) => rows.reduce((a, r) => a + fn(r.lead), 0);
    const activePending = sum(enriched, l => Number(l.balance_pending||0));
    const recoverableWeek = sum(enriched.filter(r => r.dueThisWeek), l => Number(l.balance_pending||0));
    const tokenBalRows = enriched.filter(r => Number(r.lead.token_amount_collected||0) > 0 && Number(r.lead.balance_pending||0) > 0);
    const tokenBal = sum(tokenBalRows, l => Number(l.balance_pending||0));
    const finRows = enriched.filter(r => r.lead.finance_required && !["Disbursed","Rejected","Dropped"].includes(r.lead.finance_status||""));
    const finPending = sum(finRows, l => Number(l.balance_pending||0));
    const hiPri = enriched.filter(r => ["Urgent","Hot"].includes(r.lead.lead_temperature||"") || ["Urgent","Hot"].includes(r.lead.follow_up_priority||""));
    const hiPriAmt = sum(hiPri, l => Number(l.balance_pending||0));
    const overdueRows = enriched.filter(r => r.isOverdue);
    const overdueAmt = sum(overdueRows, l => Number(l.balance_pending||0));
    const noFu = enriched.filter(r => !r.lead.next_follow_up_date);
    const noFuAmt = sum(noFu, l => Number(l.balance_pending||0));
    const droppedRisk = enriched.filter(r => (r.lead.lead_temperature||"") === "Dropped Risk" || (r.lead.balance_category||"") === "Dropped Risk");
    const droppedAmt = sum(droppedRisk, l => Number(l.balance_pending||0));
    return {
      activePending, recoverableWeek, tokenBal, tokenBalCount: tokenBalRows.length,
      finPending, finCount: finRows.length, hiPriAmt, hiPriCount: hiPri.length,
      overdueAmt, overdueCount: overdueRows.length, noFu: noFu.length, noFuAmt, droppedAmt, droppedCount: droppedRisk.length,
    };
  }, [enriched]);

  // Recovery aging buckets
  const aging = useMemo(() => {
    const total = enriched.reduce((a, r) => a + Number(r.lead.balance_pending||0), 0) || 1;
    return BUCKETS.map(b => {
      const rows = enriched.filter(r => r.bucket === b);
      const amt = rows.reduce((a, r) => a + Number(r.lead.balance_pending||0), 0);
      return { bucket: b, count: rows.length, amount: amt, pct: (amt / total) * 100 };
    });
  }, [enriched]);

  // Recovery by paid batch
  const byBatch = useMemo(() => {
    const m = new Map<string, { name: string; leads: number; deal: number; collected: number; pending: number; tokenPaid: number; finalSales: number; finPending: number; hotPending: number }>();
    for (const l of leads) {
      if (l.is_deleted) continue;
      const key = l.paid_batch_id || l.paid_batch_name || "__none__";
      const name = l.paid_batch_name || "Unassigned Batch";
      const row = m.get(key) || { name, leads: 0, deal: 0, collected: 0, pending: 0, tokenPaid: 0, finalSales: 0, finPending: 0, hotPending: 0 };
      row.leads += 1;
      row.deal += Number(l.deal_value_including_gst||0);
      row.collected += Number(l.total_collected||0);
      row.pending += Number(l.balance_pending||0);
      if (Number(l.token_amount_collected||0) > 0) row.tokenPaid += 1;
      if (l.is_final_sale) row.finalSales += 1;
      if (l.finance_required && !["Disbursed","Rejected","Dropped"].includes(l.finance_status||"")) row.finPending += Number(l.balance_pending||0);
      if (["Urgent","Hot"].includes(l.lead_temperature||"")) row.hotPending += Number(l.balance_pending||0);
      m.set(key, row);
    }
    return Array.from(m.values()).sort((a,b) => b.pending - a.pending);
  }, [leads]);

  // Recovery by owner
  const byOwner = useMemo(() => {
    const t = today();
    const cutoff = new Date(t); cutoff.setDate(cutoff.getDate() + 7);
    const c = cutoff.toISOString().slice(0, 10);
    const m = new Map<string, { ownerId: string | null; name: string; leads: number; pending: number; tokenCol: number; balanceCol: number; recovWeek: number; overdueFu: number; noFu: number; finalSales: number; deal: number }>();
    for (const l of leads) {
      if (l.is_deleted) continue;
      const owner = l.assigned_sales_executive;
      const key = owner || "__unassigned__";
      const name = owner ? (assignees.find(a => a.id === owner)?.full_name || "Unknown") : "Unassigned";
      const r = m.get(key) || { ownerId: owner, name, leads: 0, pending: 0, tokenCol: 0, balanceCol: 0, recovWeek: 0, overdueFu: 0, noFu: 0, finalSales: 0, deal: 0 };
      const bal = Number(l.balance_pending||0);
      const stage = l.pipeline_stage || "";
      const isActive = !l.is_dropped && !l.is_refunded && stage !== "Closed Lost" && bal > 0;
      if (isActive) {
        r.leads += 1;
        r.pending += bal;
        if (l.next_follow_up_date && l.next_follow_up_date < t) r.overdueFu += 1;
        if (l.next_follow_up_date && l.next_follow_up_date >= t && l.next_follow_up_date <= c) r.recovWeek += bal;
        if (!l.next_follow_up_date) r.noFu += 1;
      }
      r.tokenCol += Number(l.token_amount_collected||0);
      r.balanceCol += Math.max(0, Number(l.total_collected||0) - Number(l.token_amount_collected||0));
      r.deal += Number(l.deal_value_including_gst||0);
      if (l.is_final_sale) r.finalSales += 1;
      m.set(key, r);
    }
    return Array.from(m.values()).sort((a,b) => b.pending - a.pending);
  }, [leads, assignees]);

  // Finance/EMI
  const finance = useMemo(() => {
    const finLeads = leads.filter(l => l.finance_required && !l.is_deleted);
    const sumBal = (rows: Lead[]) => rows.reduce((a, l) => a + Number(l.balance_pending||0), 0);
    const counts: any = {
      pendingAmt: sumBal(finLeads.filter(l => !["Disbursed","Rejected","Dropped"].includes(l.finance_status||""))),
      docsPending: finLeads.filter(l => l.finance_status === "Documents Pending").length,
      submitted: finLeads.filter(l => l.finance_status === "Application Submitted").length,
      approvedNotDisb: finLeads.filter(l => l.finance_status === "Approved").length,
      rejected: finLeads.filter(l => ["Rejected","Failed - Trying Another Partner"].includes(l.finance_status||"")).length,
      tryingAlt: finLeads.filter(l => l.finance_status === "Failed - Trying Another Partner").length,
      disbursedRev: finLeads.filter(l => l.finance_status === "Disbursed").reduce((a, l) => a + Number(l.deal_value_including_gst||0), 0),
    };
    const byPart = new Map<string, { partner: string; cases: number; pendingAmt: number; docs: number; approved: number; rejected: number; disbursed: number; disbursedRev: number }>();
    for (const l of finLeads) {
      const partner = l.finance_partner || "Unspecified";
      const r = byPart.get(partner) || { partner, cases: 0, pendingAmt: 0, docs: 0, approved: 0, rejected: 0, disbursed: 0, disbursedRev: 0 };
      r.cases += 1;
      if (!["Disbursed","Rejected","Dropped"].includes(l.finance_status||"")) r.pendingAmt += Number(l.balance_pending||0);
      if (l.finance_status === "Documents Pending") r.docs += 1;
      if (l.finance_status === "Approved") r.approved += 1;
      if (["Rejected","Failed - Trying Another Partner"].includes(l.finance_status||"")) r.rejected += 1;
      if (l.finance_status === "Disbursed") { r.disbursed += 1; r.disbursedRev += Number(l.deal_value_including_gst||0); }
      byPart.set(partner, r);
    }
    const partners = Array.from(byPart.values()).map(p => ({ ...p, success: p.cases ? (p.disbursed / p.cases) * 100 : 0 })).sort((a,b)=>b.pendingAmt-a.pendingAmt);
    return { counts, partners };
  }, [leads]);

  // Top opportunities
  const topOpps = useMemo(() => {
    return [...enriched].sort((a,b) => Number(b.lead.balance_pending||0) - Number(a.lead.balance_pending||0)).slice(0, 10);
  }, [enriched]);

  // Red flags
  const redFlags = useMemo(() => {
    const t = today();
    return [
      { key: "rf_high_no_fu", title: "High value pending · no follow-up", rows: enriched.filter(r => Number(r.lead.balance_pending||0) >= 100000 && !r.lead.next_follow_up_date) },
      { key: "rf_token_no_next", title: "Token paid · no next payment date", rows: enriched.filter(r => Number(r.lead.token_amount_collected||0) > 0 && !r.nextExpected) },
      { key: "rf_fin_approved_not_disbursed", title: "Finance approved, not disbursed", rows: enriched.filter(r => r.lead.finance_status === "Approved") },
      { key: "rf_fin_rejected_no_alt", title: "Finance rejected / failed", rows: enriched.filter(r => ["Rejected","Failed - Trying Another Partner"].includes(r.lead.finance_status||"")) },
      { key: "rf_hot_overdue", title: "Hot lead overdue", rows: enriched.filter(r => r.isOverdue && ["Urgent","Hot"].includes(r.lead.lead_temperature||"")) },
      { key: "rf_old_7", title: "Pending balance older than 7 days", rows: enriched.filter(r => r.ageDays !== null && r.ageDays > 7) },
      { key: "rf_unassigned", title: "Owner not assigned", rows: enriched.filter(r => !r.lead.assigned_sales_executive) },
      { key: "rf_dropped_risk_high", title: "Dropped risk · high pending", rows: enriched.filter(r => (r.lead.lead_temperature||"") === "Dropped Risk" && Number(r.lead.balance_pending||0) >= 50000) },
    ].map(f => ({ ...f, count: f.rows.length, amount: f.rows.reduce((a, r) => a + Number(r.lead.balance_pending||0), 0) }));
  }, [enriched]);

  // Actions
  const copyWA = (l: Lead) => {
    const tpl = WA_TEMPLATES[0];
    const txt = fillTemplate(tpl.body, l);
    navigator.clipboard.writeText(txt).then(() => toast.success(`Copied: ${tpl.name}`)).catch(() => toast.error("Copy failed"));
  };

  const toggleSel = (id: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const selectAll = () => {
    setSelected(prev => prev.size === filteredRows.length ? new Set() : new Set(filteredRows.map(r => r.lead.id)));
  };

  const bulkAssignOwner = async () => {
    if (selected.size === 0) { toast.error("Please select at least one lead."); return; }
    const sel = window.prompt("Assign owner — enter owner full name (must have access):");
    if (!sel) return;
    const owner = assignees.find(a => a.full_name.toLowerCase() === sel.toLowerCase().trim());
    if (!owner) { toast.error("Owner not found in eligible list."); return; }
    const { error } = await supabase.from("paid_pipeline_leads").update({ assigned_sales_executive: owner.id } as any).in("id", Array.from(selected));
    if (error) toast.error(error.message); else { toast.success(`Assigned ${selected.size} leads to ${owner.full_name}`); setSelected(new Set()); load(); }
  };

  const bulkUpdate = async (field: string, label: string, options: string[]) => {
    if (selected.size === 0) { toast.error("Please select at least one lead."); return; }
    const val = window.prompt(`${label} — options: ${options.join(", ")}`);
    if (!val) return;
    const { error } = await supabase.from("paid_pipeline_leads").update({ [field]: val } as any).in("id", Array.from(selected));
    if (error) toast.error(error.message); else { toast.success(`Updated ${selected.size} leads`); setSelected(new Set()); load(); }
  };

  const bulkCopyWA = () => {
    if (selected.size === 0) { toast.error("Please select at least one lead."); return; }
    const rows = enriched.filter(r => selected.has(r.lead.id));
    const tpl = WA_TEMPLATES[0];
    const txt = rows.map(r => `• ${r.lead.name || ""} — ${fillTemplate(tpl.body, r.lead)}`).join("\n\n");
    navigator.clipboard.writeText(txt).then(() => toast.success("Copied WhatsApp messages")).catch(() => toast.error("Copy failed"));
  };

  const exportCsv = () => {
    const rows = (selected.size > 0 ? filteredRows.filter(r => selected.has(r.lead.id)) : filteredRows);
    const header = ["Name","Phone","Email","Product","Paid Batch","Deal Value","Token Collected","Total Collected","Balance Pending","Balance Category","Priority","Last Payment","Next Expected","Follow-Up Date","Owner","Finance Partner","Finance Status","Recovery Age"];
    const body = rows.map(({ lead: l, lastPay, nextExpected, ageDays, bucket }) => [
      l.name||"", l.phone||"", l.email||"", l.product_name_snapshot||"", l.paid_batch_name||"",
      l.deal_value_including_gst, l.token_amount_collected, l.total_collected, l.balance_pending,
      l.balance_category||"", l.lead_temperature||l.follow_up_priority||"",
      lastPay||"", nextExpected||"", l.next_follow_up_date||"",
      l.assigned_sales_executive ? (assignees.find(a => a.id === l.assigned_sales_executive)?.full_name || "Unknown") : "Unassigned",
      l.finance_partner||"", l.finance_status||"", `${ageDays ?? "—"} (${bucket})`
    ]);
    downloadCsv(`payment-recovery-${today()}.csv`, [header, ...body]);
  };

  const openInPaidPipeline = (id: string) => nav(`/paid-pipeline?lead=${id}`);

  if (loading) return <div className="p-10 text-sm text-muted-foreground">Loading…</div>;

  return (
    <>
      <PageHead title="Payment Recovery" sub="Track pending revenue, token-to-balance recovery, finance/EMI delays, and high-priority collection opportunities." />

      {/* Summary cards */}
      <SectionLabel>Recovery overview</SectionLabel>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { k: "all", label: "Active Pending Revenue", value: inr(cards.activePending), sub: `${enriched.length} leads` },
          { k: "due_today", label: "Recoverable This Week", value: inr(cards.recoverableWeek), sub: "Next 7 days" },
          { k: "token_bal", label: "Token Paid · Balance Pending", value: inr(cards.tokenBal), sub: `${cards.tokenBalCount} leads` },
          { k: "finance_pending", label: "Finance Pending Amount", value: inr(cards.finPending), sub: `${cards.finCount} cases` },
          { k: "hot", label: "High Priority Pending", value: inr(cards.hiPriAmt), sub: `${cards.hiPriCount} hot/urgent` },
          { k: "overdue", label: "Overdue Recovery", value: inr(cards.overdueAmt), sub: `${cards.overdueCount} overdue` },
          { k: "no_followup", label: "No Follow-Up Set", value: inr(cards.noFuAmt), sub: `${cards.noFu} leads` },
          { k: "dropped_risk", label: "Dropped Risk Amount", value: inr(cards.droppedAmt), sub: `${cards.droppedCount} leads` },
        ].map((c) => (
          <button key={c.label} onClick={() => { setChip(c.k); setRedFlagKey(""); }} className={`text-left bg-white border rounded-lg p-4 hover:border-black transition-colors ${chip === c.k ? "border-black" : "border-line"}`}>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{c.label}</div>
            <div className="font-serif text-[22px] mt-1">{c.value}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{c.sub}</div>
          </button>
        ))}
      </div>

      {/* Recovery aging */}
      <SectionLabel>Recovery aging</SectionLabel>
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
        {aging.map(a => (
          <button key={a.bucket} onClick={() => { setFBucket(fBucket === a.bucket ? "" : a.bucket); setChip("all"); setRedFlagKey(""); }} className={`text-left bg-white border rounded-lg p-3 hover:border-black ${fBucket === a.bucket ? "border-black" : "border-line"}`}>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{a.bucket}</div>
            <div className="font-serif text-[18px] mt-1">{inr(a.amount)}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{a.count} · {a.pct.toFixed(0)}%</div>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white border border-line rounded-lg p-4 mb-4">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
          <input className="qsi-input" placeholder="Search name/email/phone" value={search} onChange={e => setSearch(e.target.value)} />
          <select className="qsi-input" value={fProduct} onChange={e => setFProduct(e.target.value)}>
            <option value="">All Products</option>
            {productOptions.map(p => <option key={p}>{p}</option>)}
          </select>
          <select className="qsi-input" value={fPaidBatch} onChange={e => setFPaidBatch(e.target.value)}>
            <option value="">All Paid Batches</option>
            {batchOptions.map(b => <option key={b}>{b}</option>)}
          </select>
          <select className="qsi-input" value={fOwner} onChange={e => setFOwner(e.target.value)}>
            <option value="">All Owners</option>
            <option value="__unassigned__">Unassigned</option>
            {assignees.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
          </select>
          <select className="qsi-input" value={fPriority} onChange={e => setFPriority(e.target.value)}>
            <option value="">All Priorities</option>
            {["Urgent","Hot","Warm","Cold","Normal","Dropped Risk"].map(p => <option key={p}>{p}</option>)}
          </select>
          <select className="qsi-input" value={fStage} onChange={e => setFStage(e.target.value)}>
            <option value="">All Stages</option>
            {stageOptions.map(s => <option key={s}>{s}</option>)}
          </select>
          <select className="qsi-input" value={fBalCat} onChange={e => setFBalCat(e.target.value)}>
            <option value="">All Balance Categories</option>
            {balCatOptions.map(b => <option key={b}>{b}</option>)}
          </select>
          <select className="qsi-input" value={fFinPartner} onChange={e => setFFinPartner(e.target.value)}>
            <option value="">All Finance Partners</option>
            {finPartnerOptions.map(p => <option key={p}>{p}</option>)}
          </select>
          <select className="qsi-input" value={fFinStatus} onChange={e => setFFinStatus(e.target.value)}>
            <option value="">All Finance Statuses</option>
            {finStatusOptions.map(s => <option key={s}>{s}</option>)}
          </select>
          <select className="qsi-input" value={fBucket} onChange={e => setFBucket(e.target.value)}>
            <option value="">All Aging Buckets</option>
            {BUCKETS.map(b => <option key={b}>{b}</option>)}
          </select>
          <button className="ipc-btn ipc-btn-ghost" onClick={() => { setSearch(""); setFProduct(""); setFPaidBatch(""); setFOwner(""); setFPriority(""); setFStage(""); setFBalCat(""); setFFinPartner(""); setFFinStatus(""); setFBucket(""); setChip("all"); setRedFlagKey(""); }}>Reset</button>
        </div>

        {/* Chips */}
        <div className="flex flex-wrap gap-2 mt-3">
          {[
            ["all","All Pending"],["due_today","Due Today"],["overdue","Overdue"],["hot","Hot / Urgent"],
            ["token_bal","Token Paid, Balance Pending"],["finance_pending","Finance Pending"],
            ["second_token","Second Token Pending"],["down_payment","Down Payment Pending"],
            ["no_followup","No Follow-Up Set"],["high_value","High Value Pending (≥1L)"],["dropped_risk","Dropped Risk"],
          ].map(([k, label]) => (
            <button key={k} onClick={() => { setChip(k); setRedFlagKey(""); }} className={`px-2.5 py-1 rounded-full text-[11px] border ${chip === k ? "bg-black text-white border-black" : "bg-white border-line text-muted-foreground hover:border-black"}`}>{label}</button>
          ))}
        </div>
      </div>

      {/* Bulk bar */}
      <div className="flex flex-wrap items-center gap-2 mb-3 text-[12px]">
        <div className="text-muted-foreground">{selected.size > 0 ? `${selected.size} selected · ` : ""}{filteredRows.length} rows</div>
        <div className="flex-1" />
        <button className="ipc-btn ipc-btn-ghost" onClick={() => setBulkFollowUp(true)}>Set Follow-Up</button>
        <button className="ipc-btn ipc-btn-ghost" onClick={bulkAssignOwner}>Assign Owner</button>
        <button className="ipc-btn ipc-btn-ghost" onClick={() => bulkUpdate("lead_temperature","Priority",["Urgent","Hot","Warm","Cold","Dropped Risk"])}>Update Priority</button>
        <button className="ipc-btn ipc-btn-ghost" onClick={() => bulkUpdate("balance_category","Balance Category",balCatOptions.length ? balCatOptions : ["Balance Payment Pending"])}>Update Balance Cat.</button>
        <button className="ipc-btn ipc-btn-ghost" onClick={() => bulkUpdate("finance_status","Finance Status",["Documents Pending","Application Submitted","Approved","Rejected","Disbursed","Failed - Trying Another Partner"])}>Update Finance</button>
        <button className="ipc-btn ipc-btn-ghost" onClick={bulkCopyWA}>Copy WhatsApp</button>
        <button className="ipc-btn ipc-btn-ghost" onClick={exportCsv}>Export CSV</button>
      </div>

      {/* Main table */}
      <div className="bg-white border border-line rounded-lg overflow-x-auto mb-8">
        <table className="w-full text-[12px]">
          <thead className="bg-off border-b border-line">
            <tr>
              <th className="p-2 text-left"><input type="checkbox" checked={selected.size > 0 && selected.size === filteredRows.length} onChange={selectAll} /></th>
              <th className="p-2 text-left">Lead</th>
              <th className="p-2 text-left">Phone</th>
              <th className="p-2 text-left">Product · Paid Batch</th>
              <th className="p-2 text-right">Deal</th>
              <th className="p-2 text-right">Token</th>
              <th className="p-2 text-right">Collected</th>
              <th className="p-2 text-right">Pending</th>
              <th className="p-2 text-left">Bal. Category</th>
              <th className="p-2 text-left">Priority</th>
              <th className="p-2 text-left">Last Pay</th>
              <th className="p-2 text-left">Next Exp.</th>
              <th className="p-2 text-left">Follow-Up</th>
              <th className="p-2 text-left">Owner</th>
              <th className="p-2 text-left">Finance</th>
              <th className="p-2 text-left">Age</th>
              <th className="p-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 && (
              <tr><td colSpan={17} className="p-6 text-center text-muted-foreground">No leads match the current filters.</td></tr>
            )}
            {filteredRows.map(({ lead: l, lastPay, nextExpected, ageDays, bucket, isOverdue }) => {
              const ownerName = l.assigned_sales_executive ? (assignees.find(a => a.id === l.assigned_sales_executive)?.full_name || "Unknown") : "Unassigned";
              const pri = l.lead_temperature || l.follow_up_priority || "";
              const isHot = ["Urgent","Hot"].includes(pri);
              const hi = Number(l.balance_pending||0) >= 100000;
              return (
                <tr key={l.id} className="border-b border-line hover:bg-off/50">
                  <td className="p-2"><input type="checkbox" checked={selected.has(l.id)} onChange={() => toggleSel(l.id)} /></td>
                  <td className="p-2">
                    <div className="font-medium">{l.name || "—"}</div>
                    <div className="text-[10px] text-muted-foreground">{l.email || ""}</div>
                  </td>
                  <td className="p-2">{l.phone || "—"}</td>
                  <td className="p-2">
                    <div>{l.product_name_snapshot || "—"}</div>
                    <div className="text-[10px] text-muted-foreground">{l.paid_batch_name || ""}</div>
                  </td>
                  <td className="p-2 text-right">{inr(Number(l.deal_value_including_gst||0))}</td>
                  <td className="p-2 text-right">{inr(Number(l.token_amount_collected||0))}</td>
                  <td className="p-2 text-right">{inr(Number(l.total_collected||0))}</td>
                  <td className="p-2 text-right font-medium">{inr(Number(l.balance_pending||0))} {hi && <Pill tone="amber">HIGH</Pill>}</td>
                  <td className="p-2">{l.balance_category || "—"}</td>
                  <td className="p-2">{pri ? <Pill tone={isHot ? "red" : "neutral"}>{pri}</Pill> : "—"}</td>
                  <td className="p-2">{fmtDate(lastPay)}</td>
                  <td className="p-2">{fmtDate(nextExpected)}</td>
                  <td className="p-2">
                    {l.next_follow_up_date ? (
                      <div className={isOverdue ? "text-rose-700 font-medium" : ""}>{fmtDate(l.next_follow_up_date)} {l.next_follow_up_time || ""}</div>
                    ) : <Pill tone="amber">No FU</Pill>}
                  </td>
                  <td className="p-2">{ownerName}</td>
                  <td className="p-2">
                    {l.finance_required ? (
                      <div>
                        <div>{l.finance_partner || "—"}</div>
                        <div className="text-[10px] text-muted-foreground">{l.finance_status || ""}</div>
                      </div>
                    ) : "—"}
                  </td>
                  <td className="p-2">{ageDays === null ? "—" : `${ageDays}d`}<div className="text-[10px] text-muted-foreground">{bucket}</div></td>
                  <td className="p-2 whitespace-nowrap">
                    <button className="text-blue-700 hover:underline mr-2" onClick={() => openInPaidPipeline(l.id)}>Open</button>
                    <button className="text-emerald-700 hover:underline mr-2" onClick={() => setPaymentFor(l)}>Pay</button>
                    <button className="text-violet-700 hover:underline mr-2" onClick={() => setFollowUpFor(l)}>FU</button>
                    <button className="text-amber-700 hover:underline" onClick={() => copyWA(l)}>WA</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Recovery by Paid Batch */}
      <SectionLabel>Recovery by paid batch</SectionLabel>
      <div className="bg-white border border-line rounded-lg overflow-x-auto mb-6">
        <table className="w-full text-[12px]">
          <thead className="bg-off border-b border-line">
            <tr>
              <th className="p-2 text-left">Paid Batch</th>
              <th className="p-2 text-right">Leads</th>
              <th className="p-2 text-right">Deal</th>
              <th className="p-2 text-right">Collected</th>
              <th className="p-2 text-right">Pending</th>
              <th className="p-2 text-right">Token Paid</th>
              <th className="p-2 text-right">Final Sales</th>
              <th className="p-2 text-right">Finance Pending</th>
              <th className="p-2 text-right">Hot Pending</th>
              <th className="p-2 text-right">Recovery %</th>
            </tr>
          </thead>
          <tbody>
            {byBatch.length === 0 && <tr><td colSpan={10} className="p-4 text-center text-muted-foreground">No data</td></tr>}
            {byBatch.map(b => (
              <tr key={b.name} className="border-b border-line hover:bg-off/50 cursor-pointer" onClick={() => { setFPaidBatch(b.name === "Unassigned Batch" ? "" : b.name); }}>
                <td className="p-2 font-medium">{b.name}</td>
                <td className="p-2 text-right">{b.leads}</td>
                <td className="p-2 text-right">{inr(b.deal)}</td>
                <td className="p-2 text-right">{inr(b.collected)}</td>
                <td className="p-2 text-right">{inr(b.pending)}</td>
                <td className="p-2 text-right">{b.tokenPaid}</td>
                <td className="p-2 text-right">{b.finalSales}</td>
                <td className="p-2 text-right">{inr(b.finPending)}</td>
                <td className="p-2 text-right">{inr(b.hotPending)}</td>
                <td className="p-2 text-right">{b.deal > 0 ? ((b.collected / b.deal) * 100).toFixed(1) : "0"}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Recovery by Owner */}
      <SectionLabel>Recovery by owner</SectionLabel>
      <div className="bg-white border border-line rounded-lg overflow-x-auto mb-6">
        <table className="w-full text-[12px]">
          <thead className="bg-off border-b border-line">
            <tr>
              <th className="p-2 text-left">Owner</th>
              <th className="p-2 text-right">Pending Leads</th>
              <th className="p-2 text-right">Pending Amt</th>
              <th className="p-2 text-right">Token Collected</th>
              <th className="p-2 text-right">Balance Collected</th>
              <th className="p-2 text-right">Recoverable Week</th>
              <th className="p-2 text-right">Overdue FU</th>
              <th className="p-2 text-right">No FU</th>
              <th className="p-2 text-right">Final Sales</th>
              <th className="p-2 text-right">Recovery %</th>
            </tr>
          </thead>
          <tbody>
            {byOwner.length === 0 && <tr><td colSpan={10} className="p-4 text-center text-muted-foreground">No data</td></tr>}
            {byOwner.map(o => (
              <tr key={o.name} className="border-b border-line hover:bg-off/50 cursor-pointer" onClick={() => setFOwner(o.ownerId || "__unassigned__")}>
                <td className="p-2 font-medium">{o.name}</td>
                <td className="p-2 text-right">{o.leads}</td>
                <td className="p-2 text-right">{inr(o.pending)}</td>
                <td className="p-2 text-right">{inr(o.tokenCol)}</td>
                <td className="p-2 text-right">{inr(o.balanceCol)}</td>
                <td className="p-2 text-right">{inr(o.recovWeek)}</td>
                <td className="p-2 text-right">{o.overdueFu}</td>
                <td className="p-2 text-right">{o.noFu}</td>
                <td className="p-2 text-right">{o.finalSales}</td>
                <td className="p-2 text-right">{o.deal > 0 ? (((o.tokenCol + o.balanceCol) / o.deal) * 100).toFixed(1) : "0"}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Finance / EMI */}
      <SectionLabel>Finance / EMI recovery</SectionLabel>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-4">
        {[
          { l: "Finance Pending", v: inr(finance.counts.pendingAmt) },
          { l: "Documents Pending", v: finance.counts.docsPending },
          { l: "Applications Submitted", v: finance.counts.submitted },
          { l: "Approved, Not Disbursed", v: finance.counts.approvedNotDisb },
          { l: "Rejected / Failed", v: finance.counts.rejected },
          { l: "Trying Another Partner", v: finance.counts.tryingAlt },
          { l: "Disbursed Revenue", v: inr(finance.counts.disbursedRev) },
        ].map(c => (
          <div key={c.l} className="bg-white border border-line rounded-lg p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{c.l}</div>
            <div className="font-serif text-[18px] mt-1">{c.v}</div>
          </div>
        ))}
      </div>
      <div className="bg-white border border-line rounded-lg overflow-x-auto mb-6">
        <table className="w-full text-[12px]">
          <thead className="bg-off border-b border-line">
            <tr>
              <th className="p-2 text-left">Finance Partner</th>
              <th className="p-2 text-right">Cases</th>
              <th className="p-2 text-right">Pending Amt</th>
              <th className="p-2 text-right">Docs</th>
              <th className="p-2 text-right">Approved</th>
              <th className="p-2 text-right">Rejected</th>
              <th className="p-2 text-right">Disbursed</th>
              <th className="p-2 text-right">Disbursed Rev</th>
              <th className="p-2 text-right">Success %</th>
            </tr>
          </thead>
          <tbody>
            {finance.partners.length === 0 && <tr><td colSpan={9} className="p-4 text-center text-muted-foreground">No finance cases</td></tr>}
            {finance.partners.map(p => (
              <tr key={p.partner} className="border-b border-line hover:bg-off/50 cursor-pointer" onClick={() => setFFinPartner(p.partner)}>
                <td className="p-2 font-medium">{p.partner}</td>
                <td className="p-2 text-right">{p.cases}</td>
                <td className="p-2 text-right">{inr(p.pendingAmt)}</td>
                <td className="p-2 text-right">{p.docs}</td>
                <td className="p-2 text-right">{p.approved}</td>
                <td className="p-2 text-right">{p.rejected}</td>
                <td className="p-2 text-right">{p.disbursed}</td>
                <td className="p-2 text-right">{inr(p.disbursedRev)}</td>
                <td className="p-2 text-right">{p.success.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Top opportunities */}
      <SectionLabel>Top recovery opportunities</SectionLabel>
      <div className="bg-white border border-line rounded-lg overflow-x-auto mb-6">
        <table className="w-full text-[12px]">
          <thead className="bg-off border-b border-line">
            <tr>
              <th className="p-2 text-left">Lead</th>
              <th className="p-2 text-left">Product</th>
              <th className="p-2 text-left">Paid Batch</th>
              <th className="p-2 text-right">Balance Pending</th>
              <th className="p-2 text-left">Priority</th>
              <th className="p-2 text-left">Follow-Up</th>
              <th className="p-2 text-left">Owner</th>
              <th className="p-2 text-left">Reason</th>
              <th className="p-2 text-left">Action</th>
            </tr>
          </thead>
          <tbody>
            {topOpps.length === 0 && <tr><td colSpan={9} className="p-4 text-center text-muted-foreground">No opportunities</td></tr>}
            {topOpps.map(({ lead: l }) => {
              const ownerName = l.assigned_sales_executive ? (assignees.find(a => a.id === l.assigned_sales_executive)?.full_name || "Unknown") : "Unassigned";
              return (
                <tr key={l.id} className="border-b border-line hover:bg-off/50">
                  <td className="p-2 font-medium">{l.name || "—"}</td>
                  <td className="p-2">{l.product_name_snapshot || "—"}</td>
                  <td className="p-2">{l.paid_batch_name || "—"}</td>
                  <td className="p-2 text-right font-medium">{inr(Number(l.balance_pending||0))}</td>
                  <td className="p-2">{l.lead_temperature || l.follow_up_priority || "—"}</td>
                  <td className="p-2">{fmtDate(l.next_follow_up_date)}</td>
                  <td className="p-2">{ownerName}</td>
                  <td className="p-2">{l.balance_category || l.follow_up_reason || "—"}</td>
                  <td className="p-2 whitespace-nowrap">
                    <button className="text-blue-700 hover:underline mr-2" onClick={() => openInPaidPipeline(l.id)}>Open</button>
                    <button className="text-violet-700 hover:underline" onClick={() => setFollowUpFor(l)}>Create FU</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Red flags */}
      <SectionLabel>Red flags</SectionLabel>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-10">
        {redFlags.map(f => (
          <div key={f.key} className={`bg-white border rounded-lg p-3 ${f.count > 0 ? "border-rose-200" : "border-line"}`}>
            <div className="text-[11px] font-medium">{f.title}</div>
            <div className="font-serif text-[20px] mt-1">{f.count}</div>
            <div className="text-[11px] text-muted-foreground">{inr(f.amount)} pending</div>
            <button className="mt-2 text-[11px] text-blue-700 hover:underline disabled:text-muted-foreground" disabled={f.count === 0} onClick={() => { setRedFlagKey(f.key); setChip("all"); setFBucket(""); window.scrollTo({ top: 0, behavior: "smooth" }); }}>View Leads →</button>
          </div>
        ))}
      </div>

      {/* Modals */}
      {followUpFor && (
        <QuickFollowUpModal
          leadId={followUpFor.id}
          leadName={followUpFor.name || undefined}
          defaults={{ reason: followUpFor.balance_category || "Balance Payment Reminder", priority: followUpFor.lead_temperature || "Hot" }}
          onClose={() => setFollowUpFor(null)}
          onSaved={() => { setFollowUpFor(null); load(); }}
        />
      )}
      {paymentFor && (
        <QuickAddPaymentModal
          leadId={paymentFor.id}
          leadName={paymentFor.name || undefined}
          onClose={() => setPaymentFor(null)}
          onSaved={() => { setPaymentFor(null); load(); }}
        />
      )}
      {bulkFollowUp && (
        <BulkFollowUpModal
          selectedIds={Array.from(selected)}
          assignees={assignees}
          onClose={() => setBulkFollowUp(false)}
          onSaved={() => { setBulkFollowUp(false); setSelected(new Set()); load(); }}
        />
      )}
    </>
  );
}

function BulkFollowUpModal({ selectedIds, assignees, onClose, onSaved }: { selectedIds: string[]; assignees: EligibleAssignee[]; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const [date, setDate] = useState(today());
  const [time, setTime] = useState("11:00");
  const [reason, setReason] = useState("Balance Payment Reminder");
  const [priority, setPriority] = useState("Hot");
  const [assignedOwner, setAssignedOwner] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  if (selectedIds.length === 0) {
    toast.error("Please select at least one lead.");
    onClose();
    return null;
  }

  const save = async () => {
    setBusy(true);
    try {
      const rows = selectedIds.map(id => ({
        paid_pipeline_lead_id: id, follow_up_date: date, follow_up_time: time,
        follow_up_reason: reason || null, priority, status: "Pending",
        assigned_to: assignedOwner || null, notes: notes || null, created_by: user?.id,
      }));
      const { error } = await supabase.from("paid_pipeline_followups").insert(rows as any);
      if (error) throw error;
      await supabase.from("paid_pipeline_leads").update({
        next_follow_up_date: date, next_follow_up_time: time,
        follow_up_reason: reason || null, follow_up_priority: priority, follow_up_status: "Pending",
        ...(assignedOwner && assignees.find(a => a.full_name === assignedOwner) ? { assigned_sales_executive: assignees.find(a => a.full_name === assignedOwner)!.id } : {}),
      } as any).in("id", selectedIds);
      toast.success(`Created ${selectedIds.length} follow-ups`);
      onSaved();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl border border-line w-full max-w-[560px]" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-line">
          <div className="font-serif text-[20px]">Set follow-up for {selectedIds.length} leads</div>
        </div>
        <div className="p-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="qsi-label">Date</label><input type="date" className="qsi-input" value={date} onChange={e=>setDate(e.target.value)} /></div>
            <div><label className="qsi-label">Time</label><input type="time" className="qsi-input" value={time} onChange={e=>setTime(e.target.value)} /></div>
            <div><label className="qsi-label">Reason</label><input className="qsi-input" value={reason} onChange={e=>setReason(e.target.value)} /></div>
            <div><label className="qsi-label">Priority</label>
              <select className="qsi-input" value={priority} onChange={e=>setPriority(e.target.value)}>
                {["Urgent","Hot","Warm","Cold","Normal"].map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="qsi-label">Assign Owner (optional, eligible only)</label>
              <select className="qsi-input" value={assignedOwner} onChange={e=>setAssignedOwner(e.target.value)}>
                <option value="">— leave unchanged —</option>
                {assignees.map(a => <option key={a.id}>{a.full_name}</option>)}
              </select>
            </div>
          </div>
          <div><label className="qsi-label">Notes</label><textarea className="qsi-input !h-auto py-2" rows={3} value={notes} onChange={e=>setNotes(e.target.value)} /></div>
        </div>
        <div className="px-6 py-3 border-t border-line flex justify-end gap-2">
          <button onClick={onClose} className="ipc-btn ipc-btn-ghost">Cancel</button>
          <button onClick={save} disabled={busy} className="ipc-btn ipc-btn-black">{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}
