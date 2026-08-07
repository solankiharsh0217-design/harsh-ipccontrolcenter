import { useEffect, useMemo, useState } from "react";
import {
  getActiveRewardRule, getMonthlyCountsByBuyer, currentMonthStr,
  type RewardRule,
} from "@/lib/operationsConversions";
import { supabase } from "@/integrations/supabase/client";
import { LoadingState } from "@/components/ui-bits";

interface BuyerRow {
  id: string;
  name: string;
  assigned: number;
  active: number;
  pending: number;
  approved: number;
  rejected: number;
  pct: number;
  achieved: boolean;
}

export default function MediaBuyerPerformancePanel({ leads, month }: {
  leads: { id: string; assigned_media_buyer_id: string | null; assigned_media_buyer_name: string | null; service_status: string }[];
  month?: string;
}) {
  const m = month ?? currentMonthStr();
  const [rule, setRule] = useState<RewardRule | null>(null);
  const [counts, setCounts] = useState<Map<string, { approved: number; pending: number; rejected: number; value: number }>>(new Map());
  const [achieved, setAchieved] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const [r, c, a] = await Promise.all([
        getActiveRewardRule(),
        getMonthlyCountsByBuyer(m),
        (supabase as any).from("operations_reward_progress").select("media_buyer_id, reward_status").eq("month", m),
      ]);
      if (cancel) return;
      setRule(r); setCounts(c);
      const s = new Set<string>();
      for (const row of (a.data ?? []) as any[]) {
        if (row.reward_status === "achieved" || row.reward_status === "paid") s.add(row.media_buyer_id);
      }
      setAchieved(s);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [m]);

  const rows: BuyerRow[] = useMemo(() => {
    const target = rule?.target_count ?? 10;
    const map = new Map<string, BuyerRow>();
    for (const l of leads) {
      if (!l.assigned_media_buyer_id) continue;
      const id = l.assigned_media_buyer_id;
      const e = map.get(id) ?? {
        id, name: l.assigned_media_buyer_name ?? "—",
        assigned: 0, active: 0, pending: 0, approved: 0, rejected: 0, pct: 0, achieved: false,
      };
      e.assigned += 1;
      if (l.service_status === "active") e.active += 1;
      map.set(id, e);
    }
    for (const [id, c] of counts.entries()) {
      const e = map.get(id) ?? { id, name: "—", assigned: 0, active: 0, pending: 0, approved: 0, rejected: 0, pct: 0, achieved: false };
      e.pending = c.pending; e.approved = c.approved; e.rejected = c.rejected;
      map.set(id, e);
    }
    return Array.from(map.values()).map((r) => ({
      ...r,
      pct: Math.min(100, Math.round((r.approved / target) * 100)),
      achieved: achieved.has(r.id) || r.approved >= target,
    })).sort((a, b) => b.approved - a.approved);
  }, [leads, counts, rule, achieved]);

  return (
    <div className="bg-white border border-line rounded-lg">
      <div className="px-3 py-2 border-b border-line flex items-center justify-between">
        <div className="font-serif text-sm">Media buyer performance · {m}</div>
        {rule && <div className="text-[10px] text-muted-foreground">Target: {rule.target_count} · Reward: {rule.currency} {Number(rule.reward_amount).toLocaleString()}</div>}
      </div>
      {loading ? (
        <div className="p-4"><LoadingState /></div>
      ) : rows.length === 0 ? (
        <div className="p-4 text-xs text-muted-foreground text-center">No media buyers with assigned clients yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground border-b border-line">
                <th className="px-3 py-2">Media buyer</th>
                <th className="px-2 py-2 text-right">Assigned</th>
                <th className="px-2 py-2 text-right">Active</th>
                <th className="px-2 py-2 text-right">Pending</th>
                <th className="px-2 py-2 text-right">Approved</th>
                <th className="px-2 py-2 text-right">Rejected</th>
                <th className="px-3 py-2">Reward progress</th>
                <th className="px-2 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 truncate max-w-[180px]">{r.name}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{r.assigned}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{r.active}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{r.pending}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{r.approved}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{r.rejected}</td>
                  <td className="px-3 py-2 min-w-[160px]">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded bg-off overflow-hidden">
                        <div className={`h-full ${r.achieved ? "bg-[#16a34a]" : "bg-foreground"}`} style={{ width: `${r.pct}%` }} />
                      </div>
                      <span className="tabular-nums text-[11px]">{r.approved}/{rule?.target_count ?? 10}</span>
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    {r.achieved ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#DCFCE7] text-[#166534] uppercase tracking-wider">Achieved</span>
                      : <span className="text-[10px] text-muted-foreground">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
