import { useEffect, useMemo, useState } from "react";
import { Trophy, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LoadingState } from "@/components/ui-bits";
import {
  getActiveRewardRule, getMonthlyCountsByBuyer, listAllRewardProgressForMonth,
  currentMonthStr, type RewardRule, type RewardProgress,
} from "@/lib/operationsConversions";
import { toCsv, downloadCsv } from "@/lib/operationsExport";

interface Props {
  isAdmin: boolean;
  selfId?: string | null;
}

interface Row {
  id: string;
  name: string;
  approved: number;
  target: number;
  pct: number;
  reward: number;
  currency: string;
  achieved: boolean;
  paid: boolean;
  achievedAt: string | null;
}

export default function OpsRewardsTab({ isAdmin, selfId }: Props) {
  const [month, setMonth] = useState<string>(currentMonthStr());
  const [rule, setRule] = useState<RewardRule | null>(null);
  const [counts, setCounts] = useState<Map<string, { approved: number; pending: number; rejected: number; value: number }>>(new Map());
  const [progress, setProgress] = useState<RewardProgress[]>([]);
  const [profiles, setProfiles] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const [r, c, p] = await Promise.all([
        getActiveRewardRule(),
        getMonthlyCountsByBuyer(month),
        listAllRewardProgressForMonth(month),
      ]);
      if (cancel) return;
      setRule(r); setCounts(c); setProgress(p);
      // load profile names for any buyers we don't already have
      const ids = new Set<string>();
      for (const k of c.keys()) ids.add(k);
      for (const pr of p) ids.add(pr.media_buyer_id);
      if (ids.size > 0) {
        const { data } = await supabase.from("profiles").select("id, full_name").in("id", Array.from(ids));
        const m = new Map<string, string>();
        (data ?? []).forEach((x: any) => m.set(x.id, x.full_name ?? "—"));
        if (!cancel) setProfiles(m);
      }
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [month]);

  const rows: Row[] = useMemo(() => {
    const target = rule?.target_count ?? 10;
    const reward = Number(rule?.reward_amount ?? 0);
    const currency = rule?.currency ?? "INR";
    const progMap = new Map<string, RewardProgress>();
    progress.forEach((p) => progMap.set(p.media_buyer_id, p));
    const ids = new Set<string>();
    for (const k of counts.keys()) ids.add(k);
    for (const p of progress) ids.add(p.media_buyer_id);
    if (!isAdmin && selfId) {
      // restrict to self
      const onlySelf = new Set<string>();
      if (ids.has(selfId)) onlySelf.add(selfId); else onlySelf.add(selfId);
      ids.clear(); onlySelf.forEach((v) => ids.add(v));
    }
    const r: Row[] = [];
    for (const id of ids) {
      const approved = counts.get(id)?.approved ?? progMap.get(id)?.approved_conversion_count ?? 0;
      const pr = progMap.get(id);
      r.push({
        id,
        name: profiles.get(id) ?? "—",
        approved,
        target: pr?.target_count ?? target,
        pct: Math.min(100, Math.round((approved / (pr?.target_count ?? target)) * 100)),
        reward: Number(pr?.reward_amount ?? reward),
        currency,
        achieved: pr?.reward_status === "achieved" || pr?.reward_status === "paid" || approved >= (pr?.target_count ?? target),
        paid: pr?.reward_status === "paid",
        achievedAt: pr?.achieved_at ?? null,
      });
    }
    return r.sort((a, b) => Number(b.achieved) - Number(a.achieved) || b.approved - a.approved);
  }, [counts, progress, rule, profiles, isAdmin, selfId]);

  const achievedCount = rows.filter((r) => r.achieved).length;
  const pendingCount = rows.length - achievedCount;

  const exportCsv = () => {
    const data = rows.map((r) => ({
      media_buyer: r.name,
      month,
      approved: r.approved,
      target: r.target,
      progress_pct: r.pct,
      reward_amount: r.reward,
      currency: r.currency,
      status: r.paid ? "paid" : (r.achieved ? "achieved" : "in_progress"),
      achieved_at: r.achievedAt ?? "",
    }));
    downloadCsv(`rewards-${month}.csv`, toCsv(data));
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 bg-white border border-line rounded-lg p-3">
        <Trophy className="w-4 h-4 text-[#92400E]" />
        <div className="min-w-0">
          <div className="font-serif text-sm">{rule?.rule_name ?? "Reward rule"}</div>
          {rule ? (
            <div className="text-[11px] text-muted-foreground">
              Target: {rule.target_count} approved conversions · Reward: {rule.currency} {Number(rule.reward_amount).toLocaleString()} · Period: {rule.period}
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground">No active reward rule configured.</div>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="ipc-input !h-8 !text-xs" />
          {isAdmin && <button onClick={exportCsv} className="ipc-btn ipc-btn-ghost !h-8 !text-xs"><Download className="w-3 h-3" /> CSV</button>}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white border border-line rounded-lg px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Achieved</div>
          <div className="font-serif text-xl mt-0.5 text-[#166534]">{achievedCount}</div>
        </div>
        <div className="bg-white border border-line rounded-lg px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">In progress</div>
          <div className="font-serif text-xl mt-0.5">{pendingCount}</div>
        </div>
        <div className="bg-white border border-line rounded-lg px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total reward potential</div>
          <div className="font-serif text-xl mt-0.5">{rule?.currency ?? ""} {(rows.length * Number(rule?.reward_amount ?? 0)).toLocaleString()}</div>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="bg-white border border-line rounded-lg">
        <div className="px-3 py-2 border-b border-line font-serif text-sm">
          {isAdmin ? "Media buyer leaderboard" : "Your reward progress"}
        </div>
        {loading ? (
          <div className="p-4"><LoadingState /></div>
        ) : rows.length === 0 ? (
          <div className="p-4 text-xs text-muted-foreground text-center">No reward activity for this month.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground border-b border-line">
                  <th className="px-3 py-2 w-10">#</th>
                  <th className="px-3 py-2">Media buyer</th>
                  <th className="px-3 py-2">Progress</th>
                  <th className="px-2 py-2 text-right">Approved</th>
                  <th className="px-2 py-2 text-right">Target</th>
                  <th className="px-2 py-2 text-right">Reward</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Achieved at</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-2 truncate max-w-[200px]">{r.name}</td>
                    <td className="px-3 py-2 min-w-[160px]">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded bg-off overflow-hidden">
                          <div className={`h-full ${r.achieved ? "bg-[#16a34a]" : "bg-foreground"}`} style={{ width: `${r.pct}%` }} />
                        </div>
                        <span className="tabular-nums text-[11px]">{r.pct}%</span>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{r.approved}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{r.target}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{r.currency} {Number(r.reward).toLocaleString()}</td>
                    <td className="px-2 py-2">
                      {r.paid
                        ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#DBEAFE] text-[#1E40AF] uppercase tracking-wider">Paid</span>
                        : r.achieved
                          ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#DCFCE7] text-[#166534] uppercase tracking-wider">Achieved</span>
                          : <span className="text-[10px] text-muted-foreground">In progress</span>}
                    </td>
                    <td className="px-2 py-2 text-[10px] text-muted-foreground whitespace-nowrap">
                      {r.achievedAt ? new Date(r.achievedAt).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
