import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { PageHead } from "@/components/ui-bits";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  listRewardRules, createRewardRule, updateRewardRule, toggleRewardRuleActive,
  listRewardEarnings, generateRewards, approveReward, rejectReward, cancelReward, markRewardPaid,
  fetchRewardSummary, listMyRewardEarnings,
  type KpiRewardRule, type KpiRewardEarning, type RewardPeriod, type RewardStatus, type RewardSummary,
} from "@/lib/kpiRewards";
import { listActiveTeamMembers } from "@/lib/kpiReview";

function statusChip(s: string): string {
  switch (s) {
    case "approved": return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "paid": return "bg-sky-100 text-sky-800 border-sky-200";
    case "pending_approval": return "bg-amber-100 text-amber-800 border-amber-200";
    case "rejected": return "bg-rose-100 text-rose-800 border-rose-200";
    case "cancelled": return "bg-neutral-100 text-neutral-700 border-neutral-200";
    default: return "bg-muted text-foreground/70 border-border";
  }
}
function nameOf(p: { full_name: string | null; email: string | null } | null | undefined): string {
  if (!p) return "Unknown";
  return p.full_name || p.email || "Unknown";
}

export default function TeamPerformanceRewards() {
  const { user, isAdmin } = useAuth();
  const uid = user?.id ?? "";

  if (!isAdmin) return <MyRewardsView userId={uid} />;

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 md:px-6 space-y-6">
      <PageHead title="KPI Rewards" sub="Configure reward rules, generate earnings from approved KPIs, and track approval + payout status." />
      <SummaryCards />
      <Tabs defaultValue="earnings">
        <TabsList>
          <TabsTrigger value="earnings">Earnings</TabsTrigger>
          <TabsTrigger value="generate">Generate</TabsTrigger>
          <TabsTrigger value="rules">Reward Rules</TabsTrigger>
        </TabsList>
        <TabsContent value="earnings" className="mt-4"><EarningsTab actorId={uid} /></TabsContent>
        <TabsContent value="generate" className="mt-4"><GenerateTab actorId={uid} /></TabsContent>
        <TabsContent value="rules" className="mt-4"><RulesTab actorId={uid} /></TabsContent>
      </Tabs>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
function SummaryCards() {
  const [s, setS] = useState<RewardSummary | null>(null);
  useEffect(() => { fetchRewardSummary().then(setS).catch(() => {}); }, []);
  const cell = (label: string, value: React.ReactNode) => (
    <Card className="p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="text-2xl font-serif">{value ?? "—"}</div></Card>
  );
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {cell("Pending Approval", s?.pending_approval ?? "—")}
      {cell("Approved", s?.approved ?? "—")}
      {cell("Paid", s?.paid ?? "—")}
      {cell("Total Points", s?.total_points ?? "—")}
      {cell("Cash Liability", s ? `₹${s.total_cash_liability.toLocaleString()}` : "—")}
      {cell("This Month", s?.current_month_rewards ?? "—")}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
function RulesTab({ actorId }: { actorId: string }) {
  const [rules, setRules] = useState<KpiRewardRule[]>([]);
  const [team, setTeam] = useState<Array<{ id: string; full_name: string | null; email: string | null }>>([]);
  const [editing, setEditing] = useState<Partial<KpiRewardRule> | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { setRules(await listRewardRules()); } finally { setLoading(false); }
  };
  useEffect(() => { load(); listActiveTeamMembers().then(setTeam).catch(() => {}); }, []);

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">{rules.length} rule{rules.length === 1 ? "" : "s"}</div>
        <Button size="sm" onClick={() => setEditing({ period_type: "monthly", min_score: 90, reward_points: 0, cash_amount: 0, is_active: true })}>New rule</Button>
      </div>
      <Card>
        <CardContent className="overflow-x-auto pt-4">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="text-left py-2 pr-3">Name</th>
                <th className="text-left py-2 pr-3">Period</th>
                <th className="text-left py-2 pr-3">Min Score</th>
                <th className="text-left py-2 pr-3">Points</th>
                <th className="text-left py-2 pr-3">Cash</th>
                <th className="text-left py-2 pr-3">Badge</th>
                <th className="text-left py-2 pr-3">Applies to</th>
                <th className="text-left py-2 pr-3">Active</th>
                <th className="text-right py-2 pl-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={9} className="py-6 text-center text-muted-foreground">Loading…</td></tr>
                : rules.length === 0 ? <tr><td colSpan={9} className="py-6 text-center text-muted-foreground">No rules yet.</td></tr>
                : rules.map((r) => (
                  <tr key={r.id} className="border-b">
                    <td className="py-2 pr-3 font-medium">{r.name}</td>
                    <td className="py-2 pr-3 capitalize">{r.period_type}</td>
                    <td className="py-2 pr-3">{r.min_score}%</td>
                    <td className="py-2 pr-3">{r.reward_points}</td>
                    <td className="py-2 pr-3">{r.cash_amount ? `₹${r.cash_amount}` : "—"}</td>
                    <td className="py-2 pr-3 text-xs">{r.badge_name ?? "—"}</td>
                    <td className="py-2 pr-3 text-xs">
                      {r.applies_to_user_id ? nameOf(team.find((t) => t.id === r.applies_to_user_id) ?? null)
                        : r.applies_to_role ? `Role: ${r.applies_to_role}` : "Everyone"}
                    </td>
                    <td className="py-2 pr-3">
                      <Switch checked={r.is_active} onCheckedChange={async (v) => {
                        try { await toggleRewardRuleActive(r.id, v); load(); } catch (e: any) { toast.error(e?.message ?? "Failed"); }
                      }} />
                    </td>
                    <td className="py-2 pl-3 text-right"><Button size="sm" variant="ghost" onClick={() => setEditing(r)}>Edit</Button></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      {editing && <RuleEditor rule={editing} team={team} actorId={actorId} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function RuleEditor({ rule, team, actorId, onClose, onSaved }: {
  rule: Partial<KpiRewardRule>; team: Array<{ id: string; full_name: string | null; email: string | null }>;
  actorId: string; onClose: () => void; onSaved: () => void;
}) {
  const [f, setF] = useState<Partial<KpiRewardRule>>({ ...rule, applies_to_user_id: rule.applies_to_user_id ?? null, applies_to_role: rule.applies_to_role ?? null });
  const [busy, setBusy] = useState(false);
  const isEdit = !!rule.id;

  const save = async () => {
    if (!f.name?.trim()) { toast.error("Name is required"); return; }
    setBusy(true);
    try {
      const payload: any = {
        name: f.name.trim(),
        description: f.description?.trim() || null,
        period_type: f.period_type ?? "monthly",
        min_score: Number(f.min_score ?? 0),
        reward_points: Number(f.reward_points ?? 0),
        cash_amount: Number(f.cash_amount ?? 0),
        badge_name: f.badge_name?.trim() || null,
        recognition_label: f.recognition_label?.trim() || null,
        applies_to_user_id: f.applies_to_user_id || null,
        applies_to_role: f.applies_to_role?.trim() || null,
        is_active: f.is_active ?? true,
      };
      if (isEdit) await updateRewardRule(rule.id!, payload);
      else await createRewardRule(payload, actorId);
      toast.success(isEdit ? "Rule updated" : "Rule created");
      onSaved();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{isEdit ? "Edit reward rule" : "New reward rule"}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <div><Label>Name</Label><Input value={f.name ?? ""} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div><Label>Description</Label><Textarea rows={2} value={f.description ?? ""} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Period</Label>
              <Select value={f.period_type ?? "monthly"} onValueChange={(v) => setF({ ...f, period_type: v as RewardPeriod })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Min score (%)</Label><Input type="number" value={f.min_score ?? 90} onChange={(e) => setF({ ...f, min_score: Number(e.target.value) })} /></div>
            <div><Label>Reward points</Label><Input type="number" value={f.reward_points ?? 0} onChange={(e) => setF({ ...f, reward_points: Number(e.target.value) })} /></div>
            <div><Label>Cash amount</Label><Input type="number" value={f.cash_amount ?? 0} onChange={(e) => setF({ ...f, cash_amount: Number(e.target.value) })} /></div>
            <div><Label>Badge name</Label><Input value={f.badge_name ?? ""} onChange={(e) => setF({ ...f, badge_name: e.target.value })} /></div>
            <div><Label>Recognition label</Label><Input value={f.recognition_label ?? ""} onChange={(e) => setF({ ...f, recognition_label: e.target.value })} /></div>
            <div>
              <Label>Applies to role (optional)</Label>
              <Input placeholder="e.g. Sales Executive" value={f.applies_to_role ?? ""} onChange={(e) => setF({ ...f, applies_to_role: e.target.value })} />
            </div>
            <div>
              <Label>Applies to user (optional)</Label>
              <Select value={f.applies_to_user_id ?? "all"} onValueChange={(v) => setF({ ...f, applies_to_user_id: v === "all" ? null : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Everyone</SelectItem>
                  {team.map((t) => <SelectItem key={t.id} value={t.id}>{nameOf(t)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-2"><Switch checked={f.is_active ?? true} onCheckedChange={(v) => setF({ ...f, is_active: v })} /><Label>Active</Label></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────
function GenerateTab({ actorId }: { actorId: string }) {
  const [period, setPeriod] = useState<RewardPeriod>("monthly");
  const [refDate, setRefDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [userId, setUserId] = useState<string>("all");
  const [role, setRole] = useState<string>("");
  const [team, setTeam] = useState<Array<{ id: string; full_name: string | null; email: string | null }>>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => { listActiveTeamMembers().then(setTeam).catch(() => {}); }, []);

  const run = async () => {
    setBusy(true); setResult(null);
    try {
      const r = await generateRewards({
        period,
        refDate: new Date(refDate + "T12:00:00"),
        userId: userId === "all" ? null : userId,
        role: role.trim() || null,
        actorId,
      });
      setResult(r);
      toast.success(`Generated ${r.rewards_created} reward(s)`);
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Generate rewards</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-3 text-sm">
          <div>
            <Label className="text-xs">Period</Label>
            <Select value={period} onValueChange={(v) => setPeriod(v as RewardPeriod)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Reference date</Label><Input type="date" value={refDate} onChange={(e) => setRefDate(e.target.value)} /></div>
          <div>
            <Label className="text-xs">Member (optional)</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everyone</SelectItem>
                {team.map((t) => <SelectItem key={t.id} value={t.id}>{nameOf(t)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Role (optional)</Label><Input placeholder="Sales Executive" value={role} onChange={(e) => setRole(e.target.value)} /></div>
          <div className="flex items-end"><Button onClick={run} disabled={busy}>{busy ? "Running…" : "Generate rewards"}</Button></div>
        </CardContent>
      </Card>
      {result && (
        <Card>
          <CardContent className="pt-4 grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
            <div><div className="text-xs text-muted-foreground">Users checked</div><div className="text-lg font-medium">{result.users_checked}</div></div>
            <div><div className="text-xs text-muted-foreground">Rewards created</div><div className="text-lg font-medium text-emerald-700">{result.rewards_created}</div></div>
            <div><div className="text-xs text-muted-foreground">Duplicates skipped</div><div className="text-lg font-medium">{result.duplicates_skipped}</div></div>
            <div><div className="text-xs text-muted-foreground">Below threshold</div><div className="text-lg font-medium">{result.users_below_threshold}</div></div>
            <div><div className="text-xs text-muted-foreground">No KPI data</div><div className="text-lg font-medium">{result.users_no_data}</div></div>
            <div><div className="text-xs text-muted-foreground">Errors</div><div className="text-lg font-medium text-rose-700">{result.errors}</div></div>
          </CardContent>
        </Card>
      )}
      <p className="text-xs text-muted-foreground">
        Only users with at least one approved KPI in the period are eligible. Score uses the same weighted formula as the scorecard.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
function EarningsTab({ actorId }: { actorId: string }) {
  const [rows, setRows] = useState<KpiRewardEarning[]>([]);
  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState<Array<{ id: string; full_name: string | null; email: string | null }>>([]);
  const [rules, setRules] = useState<KpiRewardRule[]>([]);
  const [period, setPeriod] = useState<string>("all");
  const [userId, setUserId] = useState<string>("all");
  const [status, setStatus] = useState<string>("pending_approval");
  const [ruleId, setRuleId] = useState<string>("all");
  const [role, setRole] = useState<string>("");
  const [action, setAction] = useState<{ row: KpiRewardEarning; kind: "approve" | "reject" | "pay" | "cancel" } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await listRewardEarnings({
        period: period === "all" ? "all" : (period as RewardPeriod),
        userId: userId === "all" ? null : userId,
        status: status === "all" ? "all" : (status as RewardStatus),
        ruleId: ruleId === "all" ? null : ruleId,
        role: role.trim() || null,
      });
      setRows(r);
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    listActiveTeamMembers().then(setTeam);
    listRewardRules().then(setRules);
  }, []);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [period, userId, status, ruleId, role]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending_approval">Pending approval</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Period</Label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Member</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {team.map((t) => <SelectItem key={t.id} value={t.id}>{nameOf(t)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Rule</Label>
            <Select value={ruleId} onValueChange={setRuleId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {rules.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Role (client filter)</Label><Input value={role} onChange={(e) => setRole(e.target.value)} /></div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between">
          <CardTitle className="text-base">{rows.length} earning{rows.length === 1 ? "" : "s"}</CardTitle>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>{loading ? "…" : "Refresh"}</Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="text-left py-2 pr-3">Member</th>
                <th className="text-left py-2 pr-3">Role</th>
                <th className="text-left py-2 pr-3">Period</th>
                <th className="text-left py-2 pr-3">Score</th>
                <th className="text-left py-2 pr-3">Rule</th>
                <th className="text-left py-2 pr-3">Points</th>
                <th className="text-left py-2 pr-3">Cash</th>
                <th className="text-left py-2 pr-3">Badge</th>
                <th className="text-left py-2 pr-3">Status</th>
                <th className="text-left py-2 pr-3">Approved</th>
                <th className="text-left py-2 pr-3">Paid</th>
                <th className="text-right py-2 pl-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={12} className="py-6 text-center text-muted-foreground">Loading…</td></tr>
                : rows.length === 0 ? <tr><td colSpan={12} className="py-6 text-center text-muted-foreground">No earnings found.</td></tr>
                : rows.map((r) => (
                  <tr key={r.id} className="border-b">
                    <td className="py-2 pr-3">{nameOf(r.user_profile)}</td>
                    <td className="py-2 pr-3 text-xs">{r.user_profile?.role ?? "—"}</td>
                    <td className="py-2 pr-3 text-xs whitespace-nowrap">{r.period_start === r.period_end ? r.period_start : `${r.period_start}→${r.period_end}`} <Badge variant="outline" className="text-[10px] capitalize ml-1">{r.period_type}</Badge></td>
                    <td className="py-2 pr-3">{r.score}%</td>
                    <td className="py-2 pr-3 text-xs">{r.rule?.name ?? "—"}</td>
                    <td className="py-2 pr-3">{r.reward_points}</td>
                    <td className="py-2 pr-3">{r.cash_amount ? `₹${r.cash_amount}` : "—"}</td>
                    <td className="py-2 pr-3 text-xs">{r.badge_name ?? "—"}</td>
                    <td className="py-2 pr-3"><span className={`text-[10px] px-2 py-0.5 rounded border capitalize ${statusChip(r.status)}`}>{r.status.replace("_", " ")}</span></td>
                    <td className="py-2 pr-3 text-xs whitespace-nowrap">{r.approved_at ? format(new Date(r.approved_at), "d MMM HH:mm") : "—"}</td>
                    <td className="py-2 pr-3 text-xs whitespace-nowrap">{r.paid_at ? format(new Date(r.paid_at), "d MMM HH:mm") : "—"}</td>
                    <td className="py-2 pl-3 text-right whitespace-nowrap">
                      {r.status === "pending_approval" && (<>
                        <Button size="sm" variant="default" onClick={() => setAction({ row: r, kind: "approve" })}>Approve</Button>
                        <Button size="sm" variant="outline" className="ml-1" onClick={() => setAction({ row: r, kind: "reject" })}>Reject</Button>
                      </>)}
                      {r.status === "approved" && (<>
                        <Button size="sm" variant="default" onClick={() => setAction({ row: r, kind: "pay" })}>Mark paid</Button>
                        <Button size="sm" variant="outline" className="ml-1" onClick={() => setAction({ row: r, kind: "cancel" })}>Cancel</Button>
                      </>)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {action && (
        <ActionDialog row={action.row} kind={action.kind} actorId={actorId}
          onClose={() => setAction(null)} onDone={() => { setAction(null); load(); }} />
      )}
    </div>
  );
}

function ActionDialog({ row, kind, actorId, onClose, onDone }: {
  row: KpiRewardEarning; kind: "approve" | "reject" | "pay" | "cancel";
  actorId: string; onClose: () => void; onDone: () => void;
}) {
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const title = kind === "approve" ? "Approve reward" : kind === "reject" ? "Reject reward" : kind === "pay" ? "Mark reward paid" : "Cancel reward";
  const submit = async () => {
    setBusy(true);
    try {
      if (kind === "approve") await approveReward(row.id, actorId);
      else if (kind === "reject") {
        if (!notes.trim()) { toast.error("Reason required"); setBusy(false); return; }
        await rejectReward(row.id, notes, actorId);
      }
      else if (kind === "pay") await markRewardPaid(row.id, notes || null, actorId);
      else if (kind === "cancel") await cancelReward(row.id, actorId);
      toast.success("Done");
      onDone();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {nameOf(row.user_profile)} · {row.period_start === row.period_end ? row.period_start : `${row.period_start}→${row.period_end}`} · Score {row.score}%
            {row.reward_points ? ` · ${row.reward_points} pts` : ""}
            {row.cash_amount ? ` · ₹${row.cash_amount}` : ""}
          </DialogDescription>
        </DialogHeader>
        {(kind === "reject" || kind === "pay") && (
          <div>
            <Label className="text-xs">{kind === "reject" ? "Rejection reason (required)" : "Payout notes (optional)"}</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        )}
        {kind === "pay" && <p className="text-xs text-muted-foreground">This is internal tracking only. No bank transfer or salary update will be triggered.</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || (kind === "reject" && !notes.trim())}
            variant={kind === "reject" || kind === "cancel" ? "destructive" : "default"}>
            {busy ? "…" : (kind === "approve" ? "Approve" : kind === "reject" ? "Reject" : kind === "pay" ? "Mark paid" : "Confirm cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────
// Team member view (non-admin)
function MyRewardsView({ userId }: { userId: string }) {
  const [rows, setRows] = useState<KpiRewardEarning[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    listMyRewardEarnings(userId).then((r) => setRows(r)).finally(() => setLoading(false));
  }, [userId]);

  const totals = useMemo(() => {
    let points = 0, cash = 0;
    rows.forEach((r) => {
      if (r.status === "approved" || r.status === "paid") { points += Number(r.reward_points || 0); cash += Number(r.cash_amount || 0); }
    });
    return { points, cash };
  }, [rows]);

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 md:px-6 space-y-6">
      <PageHead title="My Rewards" sub="KPI rewards earned from your approved performance." />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3"><div className="text-xs text-muted-foreground">Total rewards</div><div className="text-2xl font-serif">{rows.length}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Points earned</div><div className="text-2xl font-serif">{totals.points}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Cash earned</div><div className="text-2xl font-serif">₹{totals.cash.toLocaleString()}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Pending approval</div><div className="text-2xl font-serif">{rows.filter((r) => r.status === "pending_approval").length}</div></Card>
      </div>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Earnings</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="text-left py-2 pr-3">Period</th>
                <th className="text-left py-2 pr-3">Score</th>
                <th className="text-left py-2 pr-3">Rule</th>
                <th className="text-left py-2 pr-3">Points</th>
                <th className="text-left py-2 pr-3">Cash</th>
                <th className="text-left py-2 pr-3">Badge</th>
                <th className="text-left py-2 pr-3">Status</th>
                <th className="text-left py-2 pr-3">Notes</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={8} className="py-6 text-center text-muted-foreground">Loading…</td></tr>
                : rows.length === 0 ? <tr><td colSpan={8} className="py-6 text-center text-muted-foreground">No rewards yet. Keep completing your KPIs!</td></tr>
                : rows.map((r) => (
                  <tr key={r.id} className="border-b">
                    <td className="py-2 pr-3 text-xs whitespace-nowrap">{r.period_start === r.period_end ? r.period_start : `${r.period_start}→${r.period_end}`} <Badge variant="outline" className="text-[10px] capitalize ml-1">{r.period_type}</Badge></td>
                    <td className="py-2 pr-3">{r.score}%</td>
                    <td className="py-2 pr-3 text-xs">{r.rule?.name ?? "—"}</td>
                    <td className="py-2 pr-3">{r.reward_points}</td>
                    <td className="py-2 pr-3">{r.cash_amount ? `₹${r.cash_amount}` : "—"}</td>
                    <td className="py-2 pr-3 text-xs">{r.badge_name ?? r.recognition_label ?? "—"}</td>
                    <td className="py-2 pr-3"><span className={`text-[10px] px-2 py-0.5 rounded border capitalize ${statusChip(r.status)}`}>{r.status.replace("_", " ")}</span></td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">{r.status === "rejected" ? r.rejection_reason : r.status === "paid" ? r.payout_notes : "—"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
