import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import {
  getActiveRewardRule, getMonthlyApprovedCount, getRewardProgress,
  currentMonthStr, type RewardRule, type RewardProgress,
} from "@/lib/operationsConversions";

export default function RewardWidget({ buyerId, compact = false }: { buyerId: string; compact?: boolean }) {
  const [rule, setRule] = useState<RewardRule | null>(null);
  const [approved, setApproved] = useState(0);
  const [achievement, setAchievement] = useState<RewardProgress | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const month = currentMonthStr();
      const [r, n, a] = await Promise.all([
        getActiveRewardRule(),
        getMonthlyApprovedCount(buyerId, month),
        getRewardProgress(buyerId, month),
      ]);
      if (cancel) return;
      setRule(r); setApproved(n); setAchievement(a);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [buyerId]);

  if (loading) return <div className="text-[11px] text-muted-foreground">Loading reward…</div>;
  if (!rule) return null;

  const target = rule.target_count;
  const pct = Math.min(100, Math.round((approved / target) * 100));
  const achieved = approved >= target || achievement?.reward_status === "achieved" || achievement?.reward_status === "paid";
  const remaining = Math.max(0, target - approved);

  return (
    <div className={`border rounded-md ${achieved ? "border-[#86efac] bg-[#F0FDF4]" : "border-line bg-white"} p-2.5 ${compact ? "" : "p-3"}`}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5 text-[11px]">
          <Trophy className={`w-3.5 h-3.5 ${achieved ? "text-[#166534]" : "text-muted-foreground"}`} />
          <span className="font-medium">{rule.rule_name}</span>
        </div>
        <div className="text-[11px] tabular-nums">
          <span className={achieved ? "text-[#166534] font-semibold" : "text-foreground"}>{approved}</span>
          <span className="text-muted-foreground"> / {target}</span>
        </div>
      </div>
      <div className="h-1.5 rounded bg-off overflow-hidden">
        <div className={`h-full ${achieved ? "bg-[#16a34a]" : "bg-foreground"}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="text-[10px] text-muted-foreground mt-1.5">
        {achieved
          ? <span className="text-[#166534] font-medium">Reward achieved · {rule.currency} {Number(rule.reward_amount).toLocaleString()} unlocked</span>
          : <>Only {remaining} conversion{remaining === 1 ? "" : "s"} away from {rule.currency} {Number(rule.reward_amount).toLocaleString()}.</>
        }
      </div>
    </div>
  );
}
