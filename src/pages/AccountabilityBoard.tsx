import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { fetchAccountabilityBoard, type BoardRow } from "@/lib/accountabilityData";
import type { NotRankableReason } from "@/lib/accountabilityScoring";

const REASON_TEXT: Record<NotRankableReason, string> = {
  not_linked: "No linked app account yet",
  insufficient_days: "Not enough days of data this month",
  no_data: "Nothing assigned or tracked this month",
};

function pct(n: number | null) {
  return n == null ? "—" : `${Math.round(n)}%`;
}

function Components({ row }: { row: BoardRow }) {
  const get = (k: string) => row.result.components.find((c) => c.key === k)?.pct ?? null;
  return (
    <>
      <td className="py-2.5 px-3 text-right font-sans text-[13px] tabular-nums">{pct(get("kpi"))}</td>
      <td className="py-2.5 px-3 text-right font-sans text-[13px] tabular-nums">{pct(get("tasks"))}</td>
      <td className="py-2.5 px-3 text-right font-sans text-[13px] tabular-nums">{pct(get("attendance"))}</td>
    </>
  );
}

export default function AccountabilityBoard() {
  const { user } = useAuth();
  const [rows, setRows] = useState<BoardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchAccountabilityBoard();
        if (!cancelled) setRows(data);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? "Could not load the board");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const ranked = rows.filter((r) => r.result.rankable);
  const unranked = rows.filter((r) => !r.result.rankable);
  const podium = ranked.slice(0, 3);
  const myIndex = ranked.findIndex((r) => r.user_id === user?.id);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading the board…
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 space-y-5 max-w-5xl">
      {err && <div className="text-sm text-destructive">{err}</div>}

      {podium.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {podium.map((r, i) => (
            <Card key={r.user_id} className={i === 0 ? "border-gold" : ""}>
              <CardContent className="p-4">
                <div className="font-sans text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                  {["First", "Second", "Third"][i]}
                </div>
                <div className="font-serif text-[22px] text-black leading-tight mt-1 truncate">{r.full_name}</div>
                <div className="font-serif text-[34px] text-gold leading-none mt-1">
                  {Math.round(r.result.score ?? 0)}
                </div>
                <div className="font-sans text-[11px] text-muted-foreground mt-1">Accountability score</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {myIndex >= 0 && (
        <Card className="border-gold bg-[color:var(--gold-pale,#FBF6E9)]">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="font-serif text-[40px] text-gold leading-none">{myIndex + 1}</div>
            <div>
              <div className="font-sans text-[13px] text-black">
                You are {myIndex + 1}
                {["th", "st", "nd", "rd"][((myIndex + 1) % 100 - 20) % 10] ?? "th"} of {ranked.length} this month
              </div>
              <div className="font-sans text-[11px] text-muted-foreground">
                Score {Math.round(ranked[myIndex].result.score ?? 0)} of 100
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-sans">Ranking this month</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="py-2 px-3 font-sans text-[10px] uppercase tracking-[0.12em] text-muted-foreground">#</th>
                  <th className="py-2 px-3 font-sans text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Person</th>
                  <th className="py-2 px-3 font-sans text-[10px] uppercase tracking-[0.12em] text-muted-foreground text-right">Score</th>
                  <th className="py-2 px-3 font-sans text-[10px] uppercase tracking-[0.12em] text-muted-foreground text-right">KPI %</th>
                  <th className="py-2 px-3 font-sans text-[10px] uppercase tracking-[0.12em] text-muted-foreground text-right">Tasks %</th>
                  <th className="py-2 px-3 font-sans text-[10px] uppercase tracking-[0.12em] text-muted-foreground text-right">Attendance %</th>
                </tr>
              </thead>
              <tbody>
                {ranked.length === 0 && (
                  <tr><td colSpan={6} className="py-8 text-center font-sans text-sm text-muted-foreground">Nobody has scoreable data yet this month.</td></tr>
                )}
                {ranked.map((r, i) => {
                  const mine = r.user_id === user?.id;
                  return (
                    <tr key={r.user_id} className={`border-b border-line last:border-0 ${mine ? "bg-off" : ""}`}>
                      <td className={`py-2.5 px-3 font-serif ${mine ? "text-[22px] text-gold" : "text-[15px] text-muted-foreground"}`}>{i + 1}</td>
                      <td className="py-2.5 px-3">
                        <div className="font-sans text-[13px] text-black truncate">{r.full_name}{mine ? " (you)" : ""}</div>
                        <div className="font-sans text-[11px] text-muted-foreground truncate">{r.role ?? ""}</div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-serif text-[19px] text-black tabular-nums">{Math.round(r.result.score ?? 0)}</td>
                      <Components row={r} />
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {unranked.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-sans">Not rankable this month</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul>
              {unranked.map((r) => (
                <li key={r.user_id} className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-line last:border-0">
                  <div className="min-w-0">
                    <div className="font-sans text-[13px] text-black truncate">{r.full_name}</div>
                    <div className="font-sans text-[11px] text-muted-foreground truncate">{r.role ?? ""}</div>
                  </div>
                  <div className="font-sans text-[11px] text-muted-foreground text-right">
                    {REASON_TEXT[r.result.reason ?? "no_data"]}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
