import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { PageHead, SectionLabel, LoadingRow, EmptyRow } from "@/components/ui-bits";
import { getEligibleAssignees, type EligibleAssignee } from "@/lib/eligibleAssignees";
import type { MBCase } from "@/lib/mediaBuyerOps";
import { autoAssignRoundRobin, createCase, SERVICE_DURATION_PRESETS, CALL_SLA_DAYS } from "@/lib/mediaBuyerOps";
import CaseDrawer from "@/components/mbo/CaseDrawer";
import { toast } from "sonner";

type ViewMode = "admin" | "buyer";

const DAY_MS = 86400000;

export default function MediaBuyerOperations() {
  const { user, isAdmin, hasModule, profile } = useAuth();
  const allowed = isAdmin || hasModule("media_buyer_operations");
  const [params, setParams] = useSearchParams();
  const [cases, setCases] = useState<MBCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [previewBuyerId, setPreviewBuyerId] = useState<string>("");
  const [buyers, setBuyers] = useState<EligibleAssignee[]>([]);
  const [filterBuyer, setFilterBuyer] = useState("all");
  const [filterStage, setFilterStage] = useState("all");
  const [filterAds, setFilterAds] = useState("all");
  const [filterAccess, setFilterAccess] = useState("all");
  const [quick, setQuick] = useState<string>("all");
  const [search, setSearch] = useState("");

  const viewMode: ViewMode = isAdmin ? "admin" : "buyer";

  async function load() {
    setLoading(true);
    let q: any = (supabase as any).from("media_buyer_cases").select("*").eq("is_deleted", false).order("created_at", { ascending: false });
    if (viewMode === "buyer" && user?.id) q = q.eq("assigned_media_buyer_id", user.id);
    const { data, error } = await q;
    if (error) {
      console.error(error);
      toast.error("Could not load cases.");
    } else {
      setCases((data ?? []) as MBCase[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (allowed) {
      load();
      getEligibleAssignees("media_buyer_operations").then(setBuyers);
    }
  }, [allowed, viewMode, user?.id]);

  useEffect(() => {
    const c = params.get("case");
    if (c) setOpenId(c);
  }, [params]);

  // Admin preview filter (read-only — just filters)
  const effectiveCases = useMemo(() => {
    let list = cases;
    if (isAdmin && previewBuyerId) list = list.filter((c) => c.assigned_media_buyer_id === previewBuyerId);
    if (filterBuyer !== "all") list = list.filter((c) => c.assigned_media_buyer_id === filterBuyer);
    if (filterStage !== "all") list = list.filter((c) => c.case_stage === filterStage);
    if (filterAds !== "all") list = list.filter((c) => c.ads_status === filterAds);
    if (filterAccess !== "all") list = list.filter((c) => c.ad_access_status === filterAccess);
    const now = Date.now();
    if (quick === "call_pending") list = list.filter((c) => c.call_status === "not_called" && c.first_call_due_at);
    else if (quick === "call_overdue") list = list.filter((c) => c.call_status === "not_called" && c.first_call_due_at && new Date(c.first_call_due_at).getTime() < now);
    else if (quick === "not_picked") list = list.filter((c) => c.call_status === "not_picked");
    else if (quick === "access_pending") list = list.filter((c) => ["not_requested", "requested", "pending_from_student"].includes(c.ad_access_status));
    else if (quick === "setup_in_progress") list = list.filter((c) => c.ads_status === "setup_in_progress" || c.case_stage === "campaign_setup_in_progress");
    else if (quick === "ads_active") list = list.filter((c) => c.ads_status === "active");
    else if (quick === "paused") list = list.filter((c) => c.ads_status === "paused");
    else if (quick === "service_ending_soon") list = list.filter((c) => c.active_days_remaining != null && c.active_days_remaining <= 7);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter((c) => c.student_name.toLowerCase().includes(s) || (c.student_email ?? "").toLowerCase().includes(s) || (c.student_phone ?? "").toLowerCase().includes(s));
    }
    return list;
  }, [cases, isAdmin, previewBuyerId, filterBuyer, filterStage, filterAds, filterAccess, quick, search]);

  const stats = useMemo(() => {
    const now = Date.now();
    return {
      total: cases.filter((c) => c.is_active).length,
      assignedToday: cases.filter((c) => c.assigned_at && now - new Date(c.assigned_at).getTime() < DAY_MS).length,
      callPending: cases.filter((c) => c.call_status === "not_called" && c.first_call_due_at && new Date(c.first_call_due_at).getTime() >= now).length,
      callOverdue: cases.filter((c) => c.call_status === "not_called" && c.first_call_due_at && new Date(c.first_call_due_at).getTime() < now).length,
      accessPending: cases.filter((c) => ["not_requested", "requested", "pending_from_student"].includes(c.ad_access_status) && c.is_active).length,
      adsLaunched: cases.filter((c) => c.ads_launch_date).length,
      adsActive: cases.filter((c) => c.ads_status === "active").length,
      adsPaused: cases.filter((c) => c.ads_status === "paused").length,
    };
  }, [cases]);

  // Media buyer performance (admin only)
  const performance = useMemo(() => {
    if (!isAdmin) return [];
    const map = new Map<string, any>();
    buyers.forEach((b) => map.set(b.id, { id: b.id, name: b.full_name, assigned: 0, overdue: 0, accessPending: 0, launched: 0, active: 0, paused: 0 }));
    cases.forEach((c) => {
      if (!c.assigned_media_buyer_id) return;
      const row = map.get(c.assigned_media_buyer_id) ?? { id: c.assigned_media_buyer_id, name: c.assigned_media_buyer_name ?? "—", assigned: 0, overdue: 0, accessPending: 0, launched: 0, active: 0, paused: 0 };
      row.assigned += 1;
      if (c.call_status === "not_called" && c.first_call_due_at && new Date(c.first_call_due_at).getTime() < Date.now()) row.overdue += 1;
      if (["not_requested", "requested", "pending_from_student"].includes(c.ad_access_status)) row.accessPending += 1;
      if (c.ads_launch_date) row.launched += 1;
      if (c.ads_status === "active") row.active += 1;
      if (c.ads_status === "paused") row.paused += 1;
      map.set(c.assigned_media_buyer_id, row);
    });
    return Array.from(map.values()).sort((a, b) => b.assigned - a.assigned);
  }, [cases, buyers, isAdmin]);

  if (!allowed) {
    return (
      <div className="max-w-[1060px] py-12">
        <div className="border border-line rounded-xl bg-white p-8 font-sans text-[13px] text-muted-foreground">
          You do not have access to Media Buyer Operations.
        </div>
      </div>
    );
  }

  const handleClose = () => { setOpenId(null); if (params.get("case")) { params.delete("case"); setParams(params, { replace: true }); } load(); };

  return (
    <div className="max-w-[1280px]">
      <PageHead
        title={isAdmin ? "Media Buyer Operations Desk" : "My Media Buyer Desk"}
        sub={isAdmin ? "Assign students, track calls, ad access, ad launches, pause/resume, and monitor each media buyer." : "Your assigned students, calls due, ad access, and ad lifecycle."}
      />

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          ["Active Cases", stats.total],
          ["Assigned Today", stats.assignedToday],
          ["Call Pending", stats.callPending],
          ["Call Overdue", stats.callOverdue],
          ["Access Pending", stats.accessPending],
          ["Ads Launched", stats.adsLaunched],
          ["Ads Active", stats.adsActive],
          ["Ads Paused", stats.adsPaused],
        ].map(([label, val]) => (
          <div key={label as string} className="border border-line rounded-xl bg-white p-4">
            <div className="font-sans text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
            <div className="font-serif text-2xl text-black">{val as number}</div>
          </div>
        ))}
      </div>

      {/* Quick filters */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {[
          ["all", "All"],
          ["call_pending", "Call Pending"],
          ["call_overdue", "Call Overdue"],
          ["not_picked", "Not Picked"],
          ["access_pending", "Access Pending"],
          ["setup_in_progress", "Setup In Progress"],
          ["ads_active", "Ads Active"],
          ["paused", "Paused"],
          ["service_ending_soon", "Service Ending Soon"],
        ].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setQuick(k)}
            className={`px-3 py-1.5 rounded-md font-sans text-[12px] border transition-colors ${quick === k ? "bg-black text-white border-black" : "bg-white border-line hover:bg-off"}`}
          >
            {label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, phone"
            className="ipc-input h-9 w-64"
          />
          <button onClick={() => setShowNew(true)} className="ipc-btn ipc-btn-black">+ New case</button>
        </div>
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {isAdmin && (
          <select className="ipc-input h-9" value={filterBuyer} onChange={(e) => setFilterBuyer(e.target.value)}>
            <option value="all">All media buyers</option>
            {buyers.map((b) => <option key={b.id} value={b.id}>{b.full_name}</option>)}
          </select>
        )}
        <select className="ipc-input h-9" value={filterStage} onChange={(e) => setFilterStage(e.target.value)}>
          <option value="all">All stages</option>
          {["assigned","call_pending","called","not_picked","email_followup_sent","ad_access_requested","ad_access_received","campaign_setup_in_progress","ads_launched","ads_paused_by_student","ads_stopped_by_student","ads_resumed","service_completed","escalation","closed"].map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
        </select>
        <select className="ipc-input h-9" value={filterAds} onChange={(e) => setFilterAds(e.target.value)}>
          <option value="all">All ads statuses</option>
          {["not_started","access_pending","setup_in_progress","launched","active","paused","stopped","resumed","completed"].map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
        </select>
        <select className="ipc-input h-9" value={filterAccess} onChange={(e) => setFilterAccess(e.target.value)}>
          <option value="all">All access statuses</option>
          {["not_requested","requested","pending_from_student","received","partial_received","issue","revoked","not_required"].map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
        </select>
        {isAdmin && (
          <div className="ml-auto flex items-center gap-2 border border-line rounded-md px-2 py-1 bg-white">
            <span className="font-sans text-[11px] text-muted-foreground">Preview buyer dashboard:</span>
            <select className="bg-transparent text-[12px] font-sans outline-none" value={previewBuyerId} onChange={(e) => setPreviewBuyerId(e.target.value)}>
              <option value="">— Off —</option>
              {buyers.map((b) => <option key={b.id} value={b.id}>{b.full_name}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="border border-line rounded-xl bg-white overflow-hidden mb-6">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] font-sans">
            <thead className="bg-off border-b border-line text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                {["Student", "Assigned to", "Stage", "Call", "Access", "Ads", "Days used", "Remaining", "Actions"].map((h) => (
                  <th key={h} className="px-3 py-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <LoadingRow colSpan={9} />
              ) : effectiveCases.length === 0 ? (
                <EmptyRow colSpan={9} title="No cases match." />
              ) : effectiveCases.map((c) => {
                const overdue = c.call_status === "not_called" && c.first_call_due_at && new Date(c.first_call_due_at).getTime() < Date.now();
                return (
                  <tr key={c.id} className="border-b border-line last:border-b-0 hover:bg-off/50">
                    <td className="px-3 py-2">
                      <div className="font-serif text-[13px] text-black">{c.student_name}</div>
                      <div className="text-[11px] text-muted-foreground">{c.student_phone ?? "—"} · {c.student_email ?? "—"}</div>
                    </td>
                    <td className="px-3 py-2">{c.assigned_media_buyer_name ?? <span className="text-muted-foreground">Unassigned</span>}</td>
                    <td className="px-3 py-2"><Badge>{c.case_stage.replace(/_/g, " ")}</Badge></td>
                    <td className="px-3 py-2">
                      {overdue ? <Badge tone="red">Overdue</Badge> : <Badge tone="muted">{c.call_status.replace(/_/g, " ")}</Badge>}
                    </td>
                    <td className="px-3 py-2"><Badge tone="muted">{c.ad_access_status.replace(/_/g, " ")}</Badge></td>
                    <td className="px-3 py-2"><Badge tone={c.ads_status === "active" ? "green" : c.ads_status === "paused" ? "amber" : "muted"}>{c.ads_status.replace(/_/g, " ")}</Badge></td>
                    <td className="px-3 py-2">{c.active_days_used}</td>
                    <td className="px-3 py-2">{c.active_days_remaining ?? "—"}</td>
                    <td className="px-3 py-2">
                      <button onClick={() => setOpenId(c.id)} className="ipc-btn h-8 text-[11px]">Open</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Performance table for admin */}
      {isAdmin && (
        <>
          <SectionLabel>Media Buyer Performance</SectionLabel>
          <div className="border border-line rounded-xl bg-white overflow-hidden mb-12">
            <table className="w-full text-[12px] font-sans">
              <thead className="bg-off border-b border-line text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  {["Media buyer", "Assigned", "Overdue", "Access pending", "Launched", "Active", "Paused"].map((h) => (
                    <th key={h} className="px-3 py-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {performance.length === 0 ? (
                  <EmptyRow colSpan={7} title="No eligible media buyers yet. Enable assignment eligibility from Team Directory." />
                ) : performance.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-b-0 hover:bg-off/50 cursor-pointer" onClick={() => setPreviewBuyerId(r.id)}>
                    <td className="px-3 py-2 font-serif text-[13px] text-black">{r.name}</td>
                    <td className="px-3 py-2">{r.assigned}</td>
                    <td className="px-3 py-2">{r.overdue}</td>
                    <td className="px-3 py-2">{r.accessPending}</td>
                    <td className="px-3 py-2">{r.launched}</td>
                    <td className="px-3 py-2">{r.active}</td>
                    <td className="px-3 py-2">{r.paused}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {openId && <CaseDrawer caseId={openId} onClose={handleClose} canEdit={isAdmin || cases.find((c) => c.id === openId)?.assigned_media_buyer_id === user?.id} isAdmin={isAdmin} buyers={buyers} />}
      {showNew && <NewCaseModal onClose={() => { setShowNew(false); load(); }} buyers={buyers} isAdmin={isAdmin} currentUserId={user?.id ?? null} />}
    </div>
  );
}

function Badge({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "muted" | "green" | "amber" | "red" }) {
  const cls =
    tone === "green" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : tone === "amber" ? "bg-amber-50 text-amber-700 border-amber-200"
    : tone === "red" ? "bg-red-50 text-red-700 border-red-200"
    : tone === "muted" ? "bg-off text-muted-foreground border-line"
    : "bg-white text-black border-line";
  return <span className={`inline-block px-2 py-0.5 rounded border text-[11px] capitalize ${cls}`}>{children}</span>;
}

function NewCaseModal({ onClose, buyers, isAdmin, currentUserId }: { onClose: () => void; buyers: EligibleAssignee[]; isAdmin: boolean; currentUserId: string | null }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [program, setProgram] = useState("");
  const [priority, setPriority] = useState("normal");
  const [duration, setDuration] = useState<string>("90"); // 30/90/180/custom
  const [customDays, setCustomDays] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [assignMethod, setAssignMethod] = useState<"none" | "manual" | "round_robin">("none");
  const [buyerId, setBuyerId] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) { toast.error("Student name is required"); return; }
    setSaving(true);
    try {
      const dur =
        duration === "custom" ? { service_duration_days: Number(customDays) || null, service_duration_months: null, service_duration_type: "custom" }
        : { service_duration_days: Number(duration), service_duration_months: Number(duration) / 30, service_duration_type: "preset" };
      let assignedId: string | null = null;
      let method = "manual";
      if (assignMethod === "manual" && buyerId) assignedId = buyerId;
      const created = await createCase({
        student_name: name.trim(),
        student_email: email.trim(),
        student_phone: phone.trim(),
        program_name: program.trim() || undefined,
        priority,
        notes: notes.trim() || undefined,
        assigned_media_buyer_id: assignedId,
        assignment_method: method,
        ...dur,
      });
      if (assignMethod === "round_robin") {
        await autoAssignRoundRobin(created.id);
      }
      toast.success("Case created");
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to create case");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl border border-line w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-line flex items-center justify-between">
          <div className="font-serif text-lg">New Media Buyer Case</div>
          <button onClick={onClose} className="text-muted-foreground hover:text-black">✕</button>
        </div>
        <div className="px-6 py-4 space-y-3">
          <Field label="Student name *"><input className="ipc-input w-full" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone"><input className="ipc-input w-full" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
            <Field label="Email"><input className="ipc-input w-full" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          </div>
          <Field label="Program"><input className="ipc-input w-full" value={program} onChange={(e) => setProgram(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Service duration">
              <select className="ipc-input w-full" value={duration} onChange={(e) => setDuration(e.target.value)}>
                {SERVICE_DURATION_PRESETS.map((p) => <option key={p.days} value={String(p.days)}>{p.label}</option>)}
                <option value="custom">Custom</option>
              </select>
            </Field>
            <Field label="Priority">
              <select className="ipc-input w-full" value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
              </select>
            </Field>
          </div>
          {duration === "custom" && (
            <Field label="Custom days"><input type="number" className="ipc-input w-full" value={customDays} onChange={(e) => setCustomDays(e.target.value)} /></Field>
          )}
          {isAdmin && (
            <>
              <Field label="Assignment">
                <select className="ipc-input w-full" value={assignMethod} onChange={(e) => setAssignMethod(e.target.value as any)}>
                  <option value="none">Don't assign yet</option>
                  <option value="manual">Assign manually</option>
                  <option value="round_robin">Auto round robin</option>
                </select>
              </Field>
              {assignMethod === "manual" && (
                <Field label="Media buyer">
                  <select className="ipc-input w-full" value={buyerId} onChange={(e) => setBuyerId(e.target.value)}>
                    <option value="">Select…</option>
                    {buyers.map((b) => <option key={b.id} value={b.id}>{b.full_name}</option>)}
                  </select>
                  {buyers.length === 0 && <div className="text-[11px] text-muted-foreground mt-1">No eligible media buyers. Enable 'Can receive Media Buyer cases' in Team Directory.</div>}
                </Field>
              )}
            </>
          )}
          <Field label="Notes"><textarea className="ipc-input w-full min-h-[70px]" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          <div className="text-[11px] text-muted-foreground">First call SLA is {CALL_SLA_DAYS} days after assignment.</div>
        </div>
        <div className="px-6 py-4 border-t border-line flex justify-end gap-2">
          <button onClick={onClose} className="ipc-btn">Cancel</button>
          <button onClick={save} disabled={saving} className="ipc-btn ipc-btn-black">{saving ? "Saving…" : "Create case"}</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1 font-sans">{label}</div>
      {children}
    </div>
  );
}
