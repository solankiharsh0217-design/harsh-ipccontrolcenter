import { useState } from "react";
import { toast } from "sonner";
import type { EligibleAssignee } from "@/lib/eligibleAssignees";
import {
  type MBCase, type FinanceCheck,
  FINANCE_CHECK_LABEL, UNCLAIMED_SLA_HOURS,
  assignCase, claimCase, hoursWaiting, whatsappLink,
} from "@/lib/mediaBuyerOps";

const PLATFORM_LABEL = { meta: "Meta", google: "Google", both: "Meta + Google" } as const;

/**
 * The shared queue of "start my ads" requests nobody has taken yet.
 * The student booked a TidyCal call with one media buyer; that buyer clicks
 * "Booked with me" and the request becomes theirs.
 */
export default function RequestsQueue({ requests, loading, isAdmin, buyers, onOpen, onChanged }: {
  requests: MBCase[];
  loading: boolean;
  isAdmin: boolean;
  buyers: EligibleAssignee[];
  onOpen: (id: string) => void;
  onChanged: () => void;
}) {
  const [claiming, setClaiming] = useState<MBCase | null>(null);

  if (loading) {
    return <div className="border border-line rounded-xl bg-white p-8 font-sans text-[13px] text-muted-foreground mb-6">Loading requests…</div>;
  }
  if (requests.length === 0) {
    return (
      <div className="border border-line rounded-xl bg-white p-8 mb-6 text-center">
        <div className="font-serif text-lg text-black">No new requests</div>
        <div className="font-sans text-[12px] text-muted-foreground mt-1">When a student fills the ads form, they appear here until someone takes them.</div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2 mb-6">
        {requests.map((c) => (
          <RequestCard
            key={c.id}
            c={c}
            isAdmin={isAdmin}
            buyers={buyers}
            onOpen={() => onOpen(c.id)}
            onClaim={() => setClaiming(c)}
            onChanged={onChanged}
          />
        ))}
      </div>
      {claiming && (
        <ClaimDialog
          c={claiming}
          onClose={() => setClaiming(null)}
          onDone={() => { setClaiming(null); onChanged(); }}
        />
      )}
    </>
  );
}

function RequestCard({ c, isAdmin, buyers, onOpen, onClaim, onChanged }: {
  c: MBCase; isAdmin: boolean; buyers: EligibleAssignee[];
  onOpen: () => void; onClaim: () => void; onChanged: () => void;
}) {
  const [assignTo, setAssignTo] = useState("");
  const [busy, setBusy] = useState(false);
  const waited = hoursWaiting(c);
  const late = waited >= UNCLAIMED_SLA_HOURS;
  const wa = whatsappLink(c.student_phone);

  async function adminAssign() {
    if (!assignTo) return;
    setBusy(true);
    try { await assignCase(c.id, assignTo); toast.success("Assigned"); onChanged(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not assign"); }
    finally { setBusy(false); }
  }

  return (
    <div className={`border rounded-xl bg-white p-4 ${late ? "border-red-200" : "border-line"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-serif text-[17px] text-black">{c.student_name}</span>
            {c.brand_name && <span className="font-sans text-[12px] text-muted-foreground">· {c.brand_name}</span>}
          </div>
          <div className="font-sans text-[12px] text-muted-foreground mt-0.5">
            {c.student_phone ?? "—"} · {c.student_email ?? "—"}
          </div>
        </div>
        <div className={`font-sans text-[11px] whitespace-nowrap ${late ? "text-red-700" : "text-muted-foreground"}`}>
          {waited < 1 ? "Just now" : waited < 48 ? `${waited}h waiting` : `${Math.floor(waited / 24)}d waiting`}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 mt-3 font-sans text-[12px]">
        <Info label="Ads">{c.ad_platforms ? PLATFORM_LABEL[c.ad_platforms] : "—"}</Info>
        <Info label="Wants to start">{c.preferred_start_text ?? "—"}</Info>
        <Info label="Cities">{c.target_locations ?? "—"}</Info>
        <Info label="Payment">
          <FinanceBadge status={c.finance_check ?? "not_found"} />
          {c.bajaj_answer && <div className="text-[11px] text-muted-foreground mt-0.5">Said: “{c.bajaj_answer}”</div>}
        </Info>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-4">
        <button className="ipc-btn ipc-btn-black" onClick={onClaim}>Booked with me</button>
        {wa && <a href={wa} target="_blank" rel="noreferrer" className="ipc-btn">WhatsApp</a>}
        <button className="ipc-btn" onClick={onOpen}>Details</button>
        {isAdmin && (
          <div className="ml-auto flex items-center gap-2">
            <select className="ipc-input h-9" value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
              <option value="">Assign to…</option>
              {buyers.map((b) => <option key={b.id} value={b.id}>{b.full_name}</option>)}
            </select>
            <button className="ipc-btn" disabled={!assignTo || busy} onClick={adminAssign}>Assign</button>
          </div>
        )}
      </div>
    </div>
  );
}

function ClaimDialog({ c, onClose, onDone }: { c: MBCase; onClose: () => void; onDone: () => void }) {
  const [when, setWhen] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      // datetime-local has no zone; new Date() reads it as the browser's local time.
      await claimCase(c.id, when ? new Date(when).toISOString() : null);
      toast.success(`${c.student_name} is now yours`);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not take this request");
      // Someone else won the race — refresh so the card disappears.
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl border border-line w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-line">
          <div className="font-serif text-lg">Take {c.student_name}</div>
          <div className="font-sans text-[12px] text-muted-foreground mt-0.5">Only if they booked their TidyCal call with you.</div>
        </div>
        <div className="px-6 py-4 space-y-2">
          <label className="block font-sans text-[11px] uppercase tracking-wider text-muted-foreground">Call booked for</label>
          <input type="datetime-local" className="ipc-input w-full" value={when} onChange={(e) => setWhen(e.target.value)} />
          <div className="font-sans text-[11px] text-muted-foreground">
            Optional. If set, the call shows as overdue once this time passes. If left blank, the usual 2-day call deadline applies.
          </div>
        </div>
        <div className="px-6 py-4 border-t border-line flex justify-end gap-2">
          <button onClick={onClose} className="ipc-btn">Cancel</button>
          <button onClick={save} disabled={saving} className="ipc-btn ipc-btn-black">{saving ? "Taking…" : "Booked with me"}</button>
        </div>
      </div>
    </div>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-black break-words">{children}</div>
    </div>
  );
}

export function FinanceBadge({ status }: { status: FinanceCheck }) {
  const cls =
    status === "verified" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : status === "pending" ? "bg-amber-50 text-amber-700 border-amber-200"
    : status === "dropped" ? "bg-red-50 text-red-700 border-red-200"
    : "bg-off text-muted-foreground border-line";
  return <span className={`inline-block px-2 py-0.5 rounded border text-[11px] ${cls}`}>{FINANCE_CHECK_LABEL[status]}</span>;
}
