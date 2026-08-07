import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Trophy, CheckCircle2, XCircle, Clock, ExternalLink, IndianRupee, Users, Timer, Wallet, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { LoadingState, EmptyState } from "@/components/ui-bits";
import {
  listSubmissions, approveSubmission, rejectSubmission, updateRewardAmount,
  listPayoutsForMonth, upsertPayout, setPayoutStatus,
  currentMonthStr, monthBounds, RESULT_TYPES,
  type ResultSubmission, type RewardPayout, type PayoutStatus,
} from "@/lib/operationsRewards";

type Tab = "pending" | "approved" | "rejected" | "monthly";

export default function OperationsRewards() {
  const { profile, user } = useAuth();
  const isAdmin = (profile?.role ?? "").toLowerCase() === "admin";
  const selfId = user?.id ?? null;

  const [tab, setTab] = useState<Tab>(isAdmin ? "pending" : "approved");
  const [month, setMonth] = useState(currentMonthStr());
  const [memberFilter, setMemberFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [rows, setRows] = useState<ResultSubmission[]>([]);
  const [monthRows, setMonthRows] = useState<ResultSubmission[]>([]);
  const [payouts, setPayouts] = useState<RewardPayout[]>([]);
  const [profiles, setProfiles] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [editingRewardId, setEditingRewardId] = useState<string | null>(null);
  const [rewardDraft, setRewardDraft] = useState<string>("");

  const load = async () => {
    setLoading(true);
    try {
      const commonOpts = {
        status: tab === "monthly" ? "all" as const : tab,
        resultType: typeFilter as any,
        memberId: isAdmin ? memberFilter : (selfId ?? "all"),
      };
      const [list, monthList, monthPayouts] = await Promise.all([
        listSubmissions({ ...commonOpts, month: tab === "monthly" ? month : null }),
        listSubmissions({ status: "approved", month }),
        isAdmin ? listPayoutsForMonth(month) : Promise.resolve([]),
      ]);
      setRows(list);
      setMonthRows(monthList);
      setPayouts(monthPayouts);
      // profiles for member filter
      const ids = new Set<string>();
      list.forEach(r => ids.add(r.submitted_by));
      monthList.forEach(r => ids.add(r.submitted_by));
      monthPayouts.forEach(p => ids.add(p.team_member_id));
      if (ids.size) {
        const { data } = await supabase.from("profiles").select("id, full_name").in("id", Array.from(ids));
        const m = new Map<string, string>();
        (data ?? []).forEach((x: any) => m.set(x.id, x.full_name ?? "—"));
        setProfiles(m);
      }
    } catch (e: any) {
      toast.error(e?.message || "Failed to load");
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tab, month, memberFilter, typeFilter]);

  const summary = useMemo(() => {
    const pendingCount = rows.filter(r => r.status === "pending").length;
    const approvedThisMonth = monthRows.length;
    const totalReward = monthRows.reduce((s, r) => s + Number(r.reward_amount ?? 0), 0);
    const paidTotal = payouts.filter(p => p.payout_status === "paid").reduce((s, p) => s + Number(p.reward_amount ?? 0), 0);
    const eligible = new Set(monthRows.map(r => r.submitted_by)).size;
    return { pendingCount, approvedThisMonth, totalReward, paidTotal, eligible };
  }, [rows, monthRows, payouts]);

  const memberBreakdown = useMemo(() => {
    const map = new Map<string, { count: number; amount: number }>();
    monthRows.forEach(r => {
      const prev = map.get(r.submitted_by) ?? { count: 0, amount: 0 };
      map.set(r.submitted_by, { count: prev.count + 1, amount: prev.amount + Number(r.reward_amount ?? 0) });
    });
    const payoutMap = new Map(payouts.map(p => [p.team_member_id, p]));
    return Array.from(map.entries()).map(([memberId, agg]) => ({
      memberId,
      name: profiles.get(memberId) ?? "—",
      count: agg.count,
      amount: agg.amount,
      payout: payoutMap.get(memberId) ?? null,
    })).sort((a, b) => b.amount - a.amount);
  }, [monthRows, payouts, profiles]);

  const doApprove = async (r: ResultSubmission) => {
    try { await approveSubmission(r.id, r.result_type); toast.success("Approved"); await load(); }
    catch (e: any) { toast.error(e?.message || "Failed"); }
  };
  const doReject = async () => {
    if (!rejectingId) return;
    try { await rejectSubmission(rejectingId, rejectReason); toast.success("Rejected"); setRejectingId(null); setRejectReason(""); await load(); }
    catch (e: any) { toast.error(e?.message || "Failed"); }
  };
  const saveReward = async (id: string) => {
    const n = Number(rewardDraft);
    if (isNaN(n) || n < 0) { toast.error("Invalid amount"); return; }
    try { await updateRewardAmount(id, n); toast.success("Reward updated"); setEditingRewardId(null); await load(); }
    catch (e: any) { toast.error(e?.message || "Failed"); }
  };
  const markPaid = async (memberId: string, count: number, amount: number, existing: RewardPayout | null) => {
    const { start, end } = monthBounds(month);
    try {
      if (existing) {
        await setPayoutStatus(existing.id, "paid");
      } else {
        const p = await upsertPayout({
          team_member_id: memberId, period_start: start, period_end: end,
          approved_count: count, reward_amount: amount, payout_status: "pending",
        });
        await setPayoutStatus(p.id, "paid");
      }
      toast.success("Marked paid"); await load();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
  };
  const changePayoutStatus = async (memberId: string, count: number, amount: number, existing: RewardPayout | null, status: PayoutStatus) => {
    const { start, end } = monthBounds(month);
    try {
      if (existing) {
        await setPayoutStatus(existing.id, status);
      } else {
        const p = await upsertPayout({
          team_member_id: memberId, period_start: start, period_end: end,
          approved_count: count, reward_amount: amount, payout_status: status,
        });
        if (status === "paid") await setPayoutStatus(p.id, "paid");
      }
      toast.success("Updated"); await load();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
  };

  const badge = (s: string) => {
    if (s === "approved") return <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#DCFCE7] text-[#166534] uppercase tracking-wider inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Approved</span>;
    if (s === "rejected") return <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#FEE2E2] text-[#991B1B] uppercase tracking-wider inline-flex items-center gap-1"><XCircle className="w-3 h-3" />Rejected</span>;
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-off text-muted-foreground uppercase tracking-wider inline-flex items-center gap-1"><Clock className="w-3 h-3" />Pending</span>;
  };
  const payoutBadge = (s: PayoutStatus) => {
    const map: Record<PayoutStatus, string> = {
      pending: "bg-off text-muted-foreground",
      approved: "bg-[#FEF3C7] text-[#92400E]",
      paid: "bg-[#DBEAFE] text-[#1E40AF]",
      cancelled: "bg-[#FEE2E2] text-[#991B1B]",
    };
    return <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider ${map[s]}`}>{s}</span>;
  };

  return (
    <div className="p-6 space-y-5 max-w-[1400px] mx-auto">
      <div>
        <h1 className="font-serif text-[28px] text-black flex items-center gap-2"><Trophy className="w-6 h-6 text-[#92400E]" /> Operations Rewards</h1>
        <p className="text-[12.5px] text-muted-foreground mt-1">
          {isAdmin ? "Approve team results and track monthly reward payouts." : "Track your submitted results and reward status."}
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <Card icon={<Clock className="w-4 h-4" />} label="Pending" value={summary.pendingCount} />
        <Card icon={<CheckCircle2 className="w-4 h-4" />} label="Approved this month" value={summary.approvedThisMonth} />
        <Card icon={<IndianRupee className="w-4 h-4" />} label="Reward pending" value={`₹${(summary.totalReward - summary.paidTotal).toLocaleString()}`} />
        <Card icon={<Wallet className="w-4 h-4" />} label="Paid" value={`₹${summary.paidTotal.toLocaleString()}`} />
        <Card icon={<Users className="w-4 h-4" />} label="Members eligible" value={summary.eligible} />
      </div>

      {/* Filters */}
      <div className="bg-white border border-line rounded-lg p-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex bg-off rounded-md p-0.5">
          {(["pending", "approved", "rejected", "monthly"] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 h-8 text-[11px] rounded ${tab === t ? "bg-white shadow-sm" : "text-muted-foreground"}`}>
              {t === "monthly" ? "Monthly summary" : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="ipc-input !h-8 !text-xs" />
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="ipc-input !h-8 !text-xs">
            <option value="all">All types</option>
            {RESULT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          {isAdmin && (
            <select value={memberFilter} onChange={(e) => setMemberFilter(e.target.value)} className="ipc-input !h-8 !text-xs">
              <option value="all">All members</option>
              {Array.from(profiles.entries()).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Tab content */}
      {tab === "monthly" ? (
        <div className="bg-white border border-line rounded-lg">
          <div className="px-3 py-2 border-b border-line font-serif text-sm">Monthly reward summary — {month}</div>
          {memberBreakdown.length === 0 ? (
            <EmptyState title="No approved results for this month yet." center />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground border-b border-line">
                    <th className="px-3 py-2">Team member</th>
                    <th className="px-3 py-2 text-right">Approved</th>
                    <th className="px-3 py-2 text-right">Reward</th>
                    <th className="px-3 py-2">Payout status</th>
                    <th className="px-3 py-2">Paid at</th>
                    {isAdmin && <th className="px-3 py-2 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {memberBreakdown.map(row => (
                    <tr key={row.memberId} className="border-b border-line last:border-0">
                      <td className="px-3 py-2 truncate max-w-[220px]">{row.name}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.count}</td>
                      <td className="px-3 py-2 text-right tabular-nums">₹{row.amount.toLocaleString()}</td>
                      <td className="px-3 py-2">{payoutBadge((row.payout?.payout_status ?? "pending") as PayoutStatus)}</td>
                      <td className="px-3 py-2 text-[10px] text-muted-foreground whitespace-nowrap">
                        {row.payout?.paid_at ? new Date(row.payout.paid_at).toLocaleDateString() : "—"}
                      </td>
                      {isAdmin && (
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5 justify-end">
                            <select
                              value={(row.payout?.payout_status ?? "pending")}
                              onChange={(e) => changePayoutStatus(row.memberId, row.count, row.amount, row.payout, e.target.value as PayoutStatus)}
                              className="ipc-input !h-7 !text-[11px]"
                            >
                              <option value="pending">Pending</option>
                              <option value="approved">Approved</option>
                              <option value="paid">Paid</option>
                              <option value="cancelled">Cancelled</option>
                            </select>
                            {row.payout?.payout_status !== "paid" && (
                              <button onClick={() => markPaid(row.memberId, row.count, row.amount, row.payout)}
                                className="h-7 px-2 text-[11px] bg-black text-white rounded inline-flex items-center gap-1"><Check className="w-3 h-3" /> Mark paid</button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white border border-line rounded-lg">
          <div className="px-3 py-2 border-b border-line font-serif text-sm">
            {tab === "pending" ? "Pending submissions" : tab === "approved" ? "Approved submissions" : "Rejected submissions"}
          </div>
          {loading ? (
            <div className="p-6"><LoadingState /></div>
          ) : rows.length === 0 ? (
            <EmptyState title={`No ${tab} submissions.`} center />
          ) : (
            <div className="divide-y divide-line">
              {rows.map(r => (
                <div key={r.id} className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-serif text-[14px] text-black">{r.title}</span>
                        {badge(r.status)}
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-off uppercase tracking-wider">
                          {RESULT_TYPES.find(t => t.value === r.result_type)?.label ?? r.result_type}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        by {r.submitted_by_name ?? "—"}
                        {r.member_name && ` · for ${r.member_name}`}
                        {r.result_date && ` · ${r.result_date}`}
                        {" · submitted "}{new Date(r.created_at).toLocaleDateString()}
                      </div>
                      {r.description && <div className="mt-1 text-[12px] whitespace-pre-wrap">{r.description}</div>}
                      {r.proof_url && (
                        <a href={r.proof_url} target="_blank" rel="noreferrer" className="mt-1 text-[11px] text-[#1E40AF] inline-flex items-center gap-1">
                          <ExternalLink className="w-3 h-3" /> Proof
                        </a>
                      )}
                      {r.status === "rejected" && r.rejection_reason && (
                        <div className="mt-1 text-[11px] text-[#991B1B]"><strong>Reason:</strong> {r.rejection_reason}</div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      {r.status === "approved" && (
                        <div className="text-right">
                          {editingRewardId === r.id && isAdmin ? (
                            <div className="flex items-center gap-1">
                              <input type="number" className="ipc-input !h-7 !text-xs w-24" value={rewardDraft} onChange={(e) => setRewardDraft(e.target.value)} />
                              <button onClick={() => saveReward(r.id)} className="h-7 px-2 text-[11px] bg-black text-white rounded">Save</button>
                            </div>
                          ) : (
                            <>
                              <div className="text-[14px] font-medium tabular-nums">₹{Number(r.reward_amount ?? 0).toLocaleString()}</div>
                              {isAdmin && (
                                <button onClick={() => { setEditingRewardId(r.id); setRewardDraft(String(r.reward_amount ?? 0)); }} className="text-[10px] text-muted-foreground underline">Edit</button>
                              )}
                            </>
                          )}
                        </div>
                      )}
                      {isAdmin && r.status === "pending" && (
                        <div className="flex gap-1.5">
                          <button onClick={() => doApprove(r)} className="h-7 px-2.5 text-[11px] bg-[#166534] text-white rounded inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Approve</button>
                          <button onClick={() => { setRejectingId(r.id); setRejectReason(""); }} className="h-7 px-2.5 text-[11px] border border-line text-[#991B1B] rounded inline-flex items-center gap-1"><XCircle className="w-3 h-3" /> Reject</button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {rejectingId && (
        <div className="fixed inset-0 z-[1400] bg-black/50 flex items-center justify-center p-4" onClick={() => setRejectingId(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl border border-line shadow-2xl w-full max-w-md p-5">
            <div className="font-serif text-lg mb-2">Reject submission</div>
            <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Reason *</label>
            <textarea rows={3} className="ipc-input !text-xs" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Explain why…" />
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setRejectingId(null)} className="h-9 px-3 text-[12px] text-muted-foreground">Cancel</button>
              <button onClick={doReject} className="h-9 px-4 bg-[#991B1B] text-white text-[12px] rounded-md">Reject</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="bg-white border border-line rounded-lg px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">{icon} {label}</div>
      <div className="font-serif text-xl mt-0.5">{value}</div>
    </div>
  );
}
