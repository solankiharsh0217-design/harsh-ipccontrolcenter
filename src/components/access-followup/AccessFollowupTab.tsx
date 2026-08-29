import { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState, EmptyRow } from "@/components/ui-bits";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Clock, Minus } from "lucide-react";
import { AccessVerification } from "@/lib/accessVerification";
import AccessVerificationModal from "./AccessVerificationModal";
import DailyQueueView from "./DailyQueueView";
import AccessRowActions from "./AccessRowActions";
import MultiSelectFilter from "@/components/crm/MultiSelectFilter";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/context/AuthContext";
import {
  AccessRow, Segment, matchesSegment, sortByUrgency, useAccessFollowupRows,
  PaidLeadInput, CrmLeadInput,
} from "@/lib/accessFollowupRows";
import { rel, formatDateShort } from "@/lib/format";
import {
  accessFollowupReturnPath,
  persistAccessFollowupState,
  readAccessFollowupState,
} from "@/lib/accessFollowupReturn";

type Row = AccessRow;

interface Props {
  paidLeads: PaidLeadInput[];
  crmLeads: CrmLeadInput[];
  owners: Array<{ id: string; full_name: string | null }>;
}

const GREEN = "text-[#16A34A]";
const AMBER = "text-[#CA8A04]";

function Done({ label, title }: { label?: string | null; title?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${GREEN}`} title={title}>
      <Check className="w-3.5 h-3.5 flex-shrink-0" />
      {label ? <span className="text-[11.5px]">{label}</span> : null}
    </span>
  );
}
function Pending({ label }: { label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${AMBER}`}>
      <Clock className="w-3.5 h-3.5 flex-shrink-0" />
      <span className="text-[11.5px]">{label}</span>
    </span>
  );
}
function Dash() {
  return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
}

function SentCell({ r }: { r: Row }) {
  if (!r.cocSent) return <Dash />;
  return <Done label={r.cocSentAt ? formatDateShort(r.cocSentAt) : "Sent"} title={r.cocSentAt ? rel(r.cocSentAt) : undefined} />;
}
function SignedCell({ r }: { r: Row }) {
  if (r.cocSigned) return <Done label={r.cocSignedAt ? formatDateShort(r.cocSignedAt) : "Signed"} title={r.cocSignedAt ? rel(r.cocSignedAt) : undefined} />;
  if (r.cocSent) return <Pending label="Awaiting" />;
  return <Dash />;
}
function GroupCell({ r }: { r: Row }) {
  if (r.groupJoined) return <Done label={r.groupJoinedAt ? formatDateShort(r.groupJoinedAt) : "Joined"} title={r.groupJoinedAt ? rel(r.groupJoinedAt) : undefined} />;
  if (r.cocSigned) return <Pending label="Pending" />;
  return <Dash />;
}

export default function AccessFollowupTab({ paidLeads, crmLeads, owners }: Props) {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const isMobile = useIsMobile();

  const { allRows } = useAccessFollowupRows(paidLeads, crmLeads, owners);

  // Eligibility: the initial Code of Conduct email must have been sent at least
  // once (resolved from the linked CoC request first, then pipeline/CRM status).
  const rows: Row[] = useMemo(() => allRows.filter((r) => r.cocSent), [allRows]);
  const awaitingInitialSendCount = allRows.length - rows.length;

  const restored = useRef(readAccessFollowupState());
  const initial = restored.current;

  const [segment, setSegment] = useState<Segment>((initial?.quick as Segment) || "all");
  const [search, setSearch] = useState(initial?.search || "");
  const [ownerFilter, setOwnerFilter] = useState<string[]>(initial?.ownerFilter || []);
  const [batchFilter, setBatchFilter] = useState<string[]>(initial?.batchFilter || []);
  const [selected, setSelected] = useState<Row | null>(null);
  const [view, setView] = useState<"members" | "daily">(initial?.view || "members");

  const didRestoreScroll = useRef(false);
  useEffect(() => {
    if (didRestoreScroll.current) return;
    if (!initial || typeof initial.scrollY !== "number") return;
    const y = initial.scrollY;
    const t = window.setTimeout(() => { window.scrollTo({ top: y, behavior: "auto" }); didRestoreScroll.current = true; }, 60);
    return () => window.clearTimeout(t);
  }, [initial]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") {
        qc.invalidateQueries({ queryKey: ["access-verifications"] });
        qc.invalidateQueries({ queryKey: ["access-coc-requests"] });
        qc.invalidateQueries({ queryKey: ["fsd-paid-leads"] });
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [qc]);

  const captureState = () => {
    persistAccessFollowupState({
      view, quick: segment, search, ownerFilter, batchFilter,
      scrollY: typeof window !== "undefined" ? window.scrollY : 0,
      updatedAt: Date.now(),
    });
  };

  const returnTo = accessFollowupReturnPath();

  const scopedRows = useMemo(() => {
    return rows.filter((r) => {
      if (ownerFilter.length && !ownerFilter.includes(r.ownerKey)) return false;
      if (batchFilter.length && !batchFilter.includes(r.batchKey)) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const hay = `${r.name} ${r.email ?? ""} ${r.phone ?? ""} ${r.batchLabel}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, ownerFilter, batchFilter, search]);

  const filtered = useMemo(
    () => scopedRows.filter((r) => matchesSegment(r, segment)).slice().sort(sortByUrgency),
    [scopedRows, segment],
  );

  const counts = useMemo(() => ({
    all: scopedRows.length,
    coc_sent: scopedRows.filter((r) => matchesSegment(r, "coc_sent")).length,
    awaiting_signature: scopedRows.filter((r) => matchesSegment(r, "awaiting_signature")).length,
    signed_group_pending: scopedRows.filter((r) => matchesSegment(r, "signed_group_pending")).length,
    fully_complete: scopedRows.filter((r) => matchesSegment(r, "fully_complete")).length,
  }), [scopedRows]);

  const ownerOptions = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.ownerKey, (map.get(r.ownerKey) || 0) + 1);
    return Array.from(map.entries()).map(([value, count]) => ({
      value,
      label: value === "__unassigned__" ? "Unassigned" : value,
      count,
    })).sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);

  const batchOptions = useMemo(() => {
    const map = new Map<string, { label: string; count: number }>();
    for (const r of rows) {
      const existing = map.get(r.batchKey);
      if (existing) existing.count++;
      else map.set(r.batchKey, { label: r.batchLabel, count: 1 });
    }
    return Array.from(map.entries()).map(([value, v]) => ({ value, label: v.label, count: v.count }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);

  const cards: Array<{ key: Segment; label: string; value: number }> = [
    { key: "coc_sent", label: "CoC Sent", value: counts.coc_sent },
    { key: "awaiting_signature", label: "Awaiting Signature", value: counts.awaiting_signature },
    { key: "signed_group_pending", label: "Signed · Group Pending", value: counts.signed_group_pending },
    { key: "fully_complete", label: "Fully Complete", value: counts.fully_complete },
  ];

  const reset = () => {
    setSegment("all");
    setSearch("");
    setOwnerFilter([]);
    setBatchFilter([]);
  };

  return (
    <div className="space-y-5">
      {/* View switch */}
      <div className="flex items-center gap-2">
        <div className="inline-flex rounded-md border border-line bg-white p-0.5">
          <button
            onClick={() => setView("members")}
            className={`font-sans text-xs px-3 py-1.5 rounded ${view === "members" ? "bg-foreground text-background" : "hover:bg-off"}`}
          >
            All Members
          </button>
          <button
            onClick={() => setView("daily")}
            className={`font-sans text-xs px-3 py-1.5 rounded ${view === "daily" ? "bg-foreground text-background" : "hover:bg-off"}`}
          >
            Daily Queue
          </button>
        </div>
        <div className="font-sans text-xs text-muted-foreground">
          {view === "daily"
            ? "Focused calling list for today, sorted by urgency"
            : "Send → Sign → Group joined, at a glance"}
        </div>
      </div>

      {/* Shared filters row */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name / email / phone / batch"
          className="font-sans text-sm border border-line rounded-lg px-3 py-2 bg-white w-full md:w-64"
        />
        <MultiSelectFilter
          label="Owner"
          options={ownerOptions}
          selectedValues={ownerFilter}
          onChange={setOwnerFilter}
          placeholder="All owners"
        />
        <MultiSelectFilter
          label="Webinar / Batch"
          options={batchOptions}
          selectedValues={batchFilter}
          onChange={setBatchFilter}
          placeholder="All batches"
          panelWidth={340}
        />
        {(segment !== "all" || search || ownerFilter.length || batchFilter.length) ? (
          <button onClick={reset} className="font-sans text-xs px-2.5 py-1.5 rounded-lg border border-line hover:bg-off">Reset</button>
        ) : null}
        <div className="font-sans text-xs text-muted-foreground ml-auto">
          {view === "members"
            ? <>Showing <span className="font-medium text-foreground">{filtered.length}</span> of {scopedRows.length} members</>
            : <>{scopedRows.length} member{scopedRows.length === 1 ? "" : "s"} in scope</>}
        </div>
      </div>

      {isAdmin && awaitingInitialSendCount > 0 && (
        <div className="rounded-xl border border-line bg-off px-3 py-2 font-sans text-[11.5px] text-muted-foreground flex items-center justify-between gap-2">
          <div>
            <span className="font-medium text-foreground">Awaiting initial CoC send:</span>{" "}
            {awaitingInitialSendCount} member{awaitingInitialSendCount === 1 ? "" : "s"} not shown here.
          </div>
          <a href="/finance-success-dashboard?tab=incomplete" className="underline hover:no-underline whitespace-nowrap">Open Incomplete Members</a>
        </div>
      )}

      {view === "daily" ? (
        <DailyQueueView
          rows={scopedRows as any}
          owners={owners}
          isAdmin={isAdmin}
          onOpenMember={(r) => setSelected(r as Row)}
          returnTo={returnTo}
          onBeforeCrmNav={captureState}
        />
      ) : (
        <>
          {/* Funnel cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {cards.map((c) => {
              const active = segment === c.key;
              return (
                <button
                  key={c.key}
                  onClick={() => setSegment(active ? "all" : c.key)}
                  className={`text-left rounded-xl px-4 py-3.5 border transition ${active ? "border-gold bg-gold-pale" : "border-line bg-white hover:border-gold/60"}`}
                >
                  <div className="font-sans text-[10px] uppercase tracking-wide text-muted-foreground">{c.label}</div>
                  <div className="font-serif text-2xl leading-tight mt-1">{c.value}</div>
                </button>
              );
            })}
          </div>

          {isMobile ? (
            <MobileCards rows={filtered} onSelect={setSelected} returnTo={returnTo} onBeforeCrmNav={captureState} />
          ) : (
            <DesktopTable rows={filtered} onSelect={setSelected} returnTo={returnTo} onBeforeCrmNav={captureState} />
          )}
        </>
      )}

      {selected && (
        <AccessVerificationModal
          memberLabel={selected.name}
          crmLeadId={selected.crmLeadId}
          paidPipelineLeadId={selected.paidLeadId}
          existing={selected.verification as AccessVerification | null}
          onClose={() => setSelected(null)}
          onSaved={() => {
            setSelected(null);
            qc.invalidateQueries({ queryKey: ["access-verifications"] });
          }}
        />
      )}
    </div>
  );
}

function DesktopTable({ rows, onSelect, returnTo, onBeforeCrmNav }: { rows: Row[]; onSelect: (r: Row) => void; returnTo?: string; onBeforeCrmNav?: () => void }) {
  return (
    <div className="border border-line rounded-xl overflow-hidden bg-white">
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0">
          <thead className="bg-off font-sans text-[10px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2.5 min-w-[230px]">Member</th>
              <th className="text-left px-4 py-2.5">CoC Sent</th>
              <th className="text-left px-4 py-2.5">Signed</th>
              <th className="text-left px-4 py-2.5">Group Joined</th>
              <th className="text-left px-4 py-2.5">Owner</th>
              <th className="text-left px-4 py-2.5">Batch</th>
              <th className="text-right px-4 py-2.5 min-w-[260px] sticky right-0 bg-off z-10">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={7} title="No members match these filters." />
            ) : rows.map((r) => (
              <tr key={r.paidLeadId} className="hover:bg-off/60 align-middle">
                <td className="px-4 py-3 border-t border-line align-middle">
                  <div className="font-serif text-[15px] leading-tight truncate max-w-[230px]">{r.name}</div>
                  <div className="font-sans text-[10.5px] text-muted-foreground truncate max-w-[230px] leading-tight">
                    {r.phone ? <a href={`tel:${r.phone}`} className="hover:underline">{r.phone}</a> : "No phone"}
                  </div>
                  <div className="font-sans text-[10.5px] text-muted-foreground truncate max-w-[230px] leading-tight">{r.email || "—"}</div>
                </td>
                <td className="px-4 py-3 border-t border-line align-middle whitespace-nowrap font-sans"><SentCell r={r} /></td>
                <td className="px-4 py-3 border-t border-line align-middle whitespace-nowrap font-sans"><SignedCell r={r} /></td>
                <td className="px-4 py-3 border-t border-line align-middle whitespace-nowrap font-sans"><GroupCell r={r} /></td>
                <td className="px-4 py-3 border-t border-line align-middle font-sans text-xs whitespace-nowrap" title={r.ownerName || ""}>
                  <div className="truncate max-w-[130px]">{r.ownerName || "—"}</div>
                </td>
                <td className="px-4 py-3 border-t border-line align-middle font-sans text-xs" title={r.batch || ""}>
                  <div className="truncate max-w-[180px] leading-tight">{r.batch || "—"}</div>
                  {r.webinarDate && <div className="text-[10.5px] text-muted-foreground leading-tight">{r.webinarDate}</div>}
                </td>
                <td className="px-4 py-3 border-t border-line text-right align-middle sticky right-0 bg-white z-[1]" style={{ minWidth: 260 }}>
                  <AccessRowActions
                    phone={r.phone}
                    crmLeadId={r.crmLeadId}
                    cocStatus={r.cocStatus}
                    onUpdate={() => onSelect(r)}
                    returnTo={returnTo}
                    onBeforeCrmNav={onBeforeCrmNav}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MobileCards({ rows, onSelect, returnTo, onBeforeCrmNav }: { rows: Row[]; onSelect: (r: Row) => void; returnTo?: string; onBeforeCrmNav?: () => void }) {
  if (rows.length === 0) {
    return <EmptyState title="No members match these filters." bordered />;
  }
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.paidLeadId} className="border border-line rounded-xl bg-white p-4 space-y-3">
          <div className="min-w-0">
            <div className="font-serif text-[15px] truncate">{r.name}</div>
            <div className="font-sans text-[10.5px] text-muted-foreground truncate">
              {r.phone ? <a href={`tel:${r.phone}`} className="hover:underline">{r.phone}</a> : "No phone"} · {r.email || "—"}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 font-sans">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Sent</div>
              <SentCell r={r} />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Signed</div>
              <SignedCell r={r} />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Group</div>
              <GroupCell r={r} />
            </div>
          </div>
          <div className="font-sans text-[10.5px] text-muted-foreground">
            {r.ownerName || "Unassigned"} · {r.batchLabel}
          </div>
          <AccessRowActions
            phone={r.phone}
            crmLeadId={r.crmLeadId}
            cocStatus={r.cocStatus}
            onUpdate={() => onSelect(r)}
            fullWidthPrimary
            returnTo={returnTo}
            onBeforeCrmNav={onBeforeCrmNav}
          />
        </div>
      ))}
    </div>
  );
}
