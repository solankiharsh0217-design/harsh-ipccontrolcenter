import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/context/AuthContext";
import { useMyScore } from "@/hooks/useMyScore";
import {
  fetchLedger,
  fetchPointRules,
  fetchAccountabilityBoard,
  monthRange,
  type LedgerRow,
} from "@/lib/accountabilityData";

function whenLabel(day: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (day === today) return "today";
  if (day === yest) return "yesterday";
  return new Date(day + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export default function ScoreHero() {
  const { user } = useAuth();
  const { data, loading } = useMyScore();
  const [activity, setActivity] = useState<(LedgerRow & { label?: string })[]>([]);
  const [rank, setRank] = useState<{ pos: number; of: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) return;
    (async () => {
      const { start, end } = monthRange();
      try {
        const [ledger, rules, board] = await Promise.all([
          fetchLedger(user.id, start, end),
          fetchPointRules(),
          fetchAccountabilityBoard(),
        ]);
        if (cancelled) return;
        const labels = new Map(rules.map((r) => [r.rule_key, r.label]));
        setActivity(ledger.slice(0, 8).map((l) => ({ ...l, label: labels.get(l.rule_key) ?? l.rule_key })));
        const ranked = board.filter((b) => b.result.rankable);
        const idx = ranked.findIndex((b) => b.user_id === user.id);
        setRank(idx >= 0 ? { pos: idx + 1, of: ranked.length } : null);
      } catch { /* non-fatal */ }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const score = data?.score ?? null;
  const empty = score == null;
  const progress = empty ? 0 : Math.min(100, (score / 1000) * 100);

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="font-sans text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
              Appraisal score this month · out of 1,000 points
            </div>
            <div className={`font-serif leading-none mt-1 ${empty ? "text-[44px] text-muted-foreground" : "text-[60px] md:text-[72px] text-gold"}`}>
              {loading ? "…" : empty ? "—" : score}
            </div>
            <div className="font-sans text-sm text-black mt-1">
              {empty ? "No score yet" : data?.band?.label ?? ""}
            </div>
          </div>
          {rank && (
            <Link to="/accountability-board" className="font-sans text-sm text-black underline underline-offset-4">
              You are {rank.pos} of {rank.of} this month
            </Link>
          )}
        </div>

        <div>
          <div className="h-1.5 rounded-full bg-off overflow-hidden">
            <div className="h-full bg-gold" style={{ width: `${progress}%` }} />
          </div>
          <div className="font-sans text-xs text-muted-foreground mt-1.5">
            {empty
              ? "Your score appears once a KPI has been scored."
              : data?.next
                ? `${data.next.gap} points to ${data.next.band.label}`
                : "Top band reached"}
          </div>
        </div>

        {!empty && (
          <div className="flex gap-6 font-sans text-xs text-muted-foreground">
            <span>Earned this month: <span className="text-black">{data?.earnedPoints ?? 0}</span></span>
            <span>Lost this month: <span className="text-black">{data?.lostPoints ?? 0}</span></span>
          </div>
        )}

        {activity.length > 0 && (
          <div className="border-t border-line pt-3">
            <div className="font-sans text-[10px] uppercase tracking-[0.15em] text-muted-foreground mb-2">
              Recent points
            </div>
            <ul className="space-y-1.5">
              {activity.map((a) => (
                <li key={a.id} className="font-sans text-[13px] flex gap-2">
                  <span className={`tabular-nums w-8 ${a.points < 0 ? "text-destructive" : "text-black"}`}>
                    {a.points > 0 ? `+${a.points}` : a.points}
                  </span>
                  <span className="text-black">{a.label}</span>
                  {a.reason && <span className="text-muted-foreground truncate">· {a.reason}</span>}
                  <span className="text-muted-foreground">· {whenLabel(a.occurred_on)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
