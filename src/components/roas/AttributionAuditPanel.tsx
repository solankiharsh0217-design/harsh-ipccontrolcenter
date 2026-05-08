// Three collapsible audit/diagnostic sections rendered below the existing results.
// Default collapsed. Pure presentation — receives an AttributionResult.

import React, { useMemo, useState } from "react";
import type { AttributionResult, AuditRow, DuplicateConflict, MediaBuyerBreakdown } from "@/lib/roas/attributionEngine";

const inr = (n: number) => "₹" + (n || 0).toLocaleString("en-IN");

export default function AttributionAuditPanel({
  result,
  mediaBuyerOrder,
  columnMappingsUsed,
  consistency,
}: {
  result: AttributionResult;
  mediaBuyerOrder: Array<{ id: string; displayName: string; leads: number; source: string }>;
  columnMappingsUsed: Array<{ source: string; tabName: string; mapping: any }>;
  consistency?: { sameInputSameOutput: boolean | null; sameInputDifferentOutput: boolean };
}) {
  return (
    <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 12 }}>
      {consistency?.sameInputDifferentOutput && (
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#DC2626", padding: "10px 14px", borderRadius: 8, fontSize: 12, fontWeight: 500 }}>
          Attribution engine is unstable. Same input produced different output.
        </div>
      )}
      {consistency?.sameInputSameOutput && (
        <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#16A34A", padding: "8px 12px", borderRadius: 8, fontSize: 11.5 }}>
          Result confirmed identical to last calculation (same input → same output).
        </div>
      )}

      <DataUsedSection result={result} mediaBuyerOrder={mediaBuyerOrder} columnMappingsUsed={columnMappingsUsed} />
      <ConflictsSection conflicts={result.duplicateLeadConflicts} />
      <AuditSection audits={result.auditLog} mediaBuyers={result.mediaBuyerBreakdown} />
    </div>
  );
}

function Collapsible({ title, badge, children, defaultOpen = false }: { title: string; badge?: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ border: "1px solid #E8E5DE", borderRadius: 12, padding: 14, background: "#fff" }}>
      <button onClick={() => setOpen(!open)}
        style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, fontSize: 12.5, color: "#0a0a0a", fontWeight: 500, width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: "'Jost',sans-serif" }}>
        <span>
          <span style={{ marginRight: 8, color: "#888" }}>{open ? "▲" : "▼"}</span>
          {title}
          {badge != null && <span style={{ marginLeft: 10, fontSize: 10.5, color: "#888", background: "#F7F6F3", padding: "2px 8px", borderRadius: 12 }}>{badge}</span>}
        </span>
      </button>
      {open && <div style={{ marginTop: 12 }}>{children}</div>}
    </div>
  );
}

function DataUsedSection({
  result, mediaBuyerOrder, columnMappingsUsed,
}: {
  result: AttributionResult;
  mediaBuyerOrder: Array<{ id: string; displayName: string; leads: number; source: string }>;
  columnMappingsUsed: Array<{ source: string; tabName: string; mapping: any }>;
}) {
  return (
    <Collapsible title="Data Used For This Calculation">
      <div style={{ fontSize: 12, color: "#555", lineHeight: 1.7 }}>
        <Row k="Calculation ID" v={result.calculationId} mono />
        <Row k="Engine version" v={result.engineVersion} />
        <Row k="Input snapshot hash" v={result.inputSnapshotHash} mono />
        <Row k="Output hash" v={result.outputHash} mono />
        <Row k="Calculated at" v={new Date(result.calculatedAt).toLocaleString("en-IN")} />
        <Row k="Sales rows" v={String(result.summary.totalSales)} />
        <Row k="Total leads" v={String(result.summary.totalLeads)} />

        <div style={{ marginTop: 10, fontWeight: 500, color: "#0a0a0a" }}>Media buyer priority order</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginTop: 6 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#888", fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em" }}>
              <th style={cellStyle()}>#</th><th style={cellStyle()}>Media Buyer</th><th style={cellStyle()}>Leads</th><th style={cellStyle()}>Source</th>
            </tr>
          </thead>
          <tbody>
            {mediaBuyerOrder.map((m, i) => (
              <tr key={m.id} style={{ borderTop: "1px solid #F0EDE8" }}>
                <td style={cellStyle()}>{i + 1}</td>
                <td style={cellStyle()}>{m.displayName}</td>
                <td style={cellStyle()}>{m.leads}</td>
                <td style={cellStyle()}>{m.source}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 12, fontWeight: 500, color: "#0a0a0a" }}>Column mappings used</div>
        <ul style={{ margin: "6px 0 0 16px", padding: 0 }}>
          {columnMappingsUsed.map((c, i) => (
            <li key={i} style={{ marginBottom: 4 }}>
              <strong>{c.source}</strong> ({c.tabName}) — {summarizeMapping(c.mapping)}
            </li>
          ))}
        </ul>
      </div>
    </Collapsible>
  );
}

function ConflictsSection({ conflicts }: { conflicts: DuplicateConflict[] }) {
  return (
    <Collapsible title="Duplicate Lead Conflicts" badge={`${conflicts.length} found`}>
      {conflicts.length === 0 ? (
        <div style={{ fontSize: 12, color: "#888" }}>No duplicate leads detected across media buyer tabs.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {conflicts.slice(0, 100).map((c) => (
            <div key={c.conflictId} style={{ border: "1px solid #FDE68A", background: "#FFFBEB", borderRadius: 8, padding: 10, fontSize: 12 }}>
              <div style={{ fontWeight: 500, marginBottom: 4, color: "#7A5E10" }}>
                {c.conflictType.toUpperCase()} · {c.normalizedValue}
              </div>
              <div style={{ color: "#555" }}>Found in: {c.mediaBuyersFound.join(", ")}</div>
              <div style={{ color: "#555" }}>Winner if matched: <strong>{c.winnerIfMatched || "—"}</strong></div>
              <div style={{ color: "#888", fontSize: 11, marginTop: 4 }}>{c.tieBreakerReason}</div>
            </div>
          ))}
          {conflicts.length > 100 && <div style={{ fontSize: 11, color: "#888" }}>…and {conflicts.length - 100} more</div>}
        </div>
      )}
    </Collapsible>
  );
}

function AuditSection({ audits, mediaBuyers }: { audits: AuditRow[]; mediaBuyers: MediaBuyerBreakdown[] }) {
  const [search, setSearch] = useState("");
  const [buyerFilter, setBuyerFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");
  const [conflictsOnly, setConflictsOnly] = useState(false);
  const [unmatchedOnly, setUnmatchedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE = 25;

  const filtered = useMemo(() => audits.filter((a) => {
    const q = search.toLowerCase().trim();
    if (q && !(a.buyerName?.toLowerCase().includes(q) || a.buyerEmail?.toLowerCase().includes(q) || a.buyerPhone?.includes(q))) return false;
    if (buyerFilter !== "all" && a.attributedTo !== buyerFilter) return false;
    if (methodFilter !== "all" && a.matchMethod !== methodFilter) return false;
    if (conflictsOnly && a.competingMatches.length === 0) return false;
    if (unmatchedOnly && a.matchMethod !== "unmatched") return false;
    return true;
  }), [audits, search, buyerFilter, methodFilter, conflictsOnly, unmatchedOnly]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const display = filtered.slice((page - 1) * PAGE, page * PAGE);

  return (
    <Collapsible title="Attribution Audit" badge={`${audits.length} sales`}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <input className="fi" style={{ flex: "1 1 220px", maxWidth: 280 }}
          placeholder="Search name / email / phone…" value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <select className="fsel" value={buyerFilter} onChange={(e) => { setBuyerFilter(e.target.value); setPage(1); }} style={{ width: 160 }}>
          <option value="all">All buyers</option>
          {mediaBuyers.map((b) => <option key={b.mediaBuyerId} value={b.mediaBuyerName}>{b.mediaBuyerName}</option>)}
        </select>
        <select className="fsel" value={methodFilter} onChange={(e) => { setMethodFilter(e.target.value); setPage(1); }} style={{ width: 160 }}>
          <option value="all">All methods</option>
          <option value="email">Email</option>
          <option value="phone">Phone</option>
          <option value="name">Name</option>
          <option value="unmatched">Unmatched</option>
        </select>
        <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={conflictsOnly} onChange={(e) => { setConflictsOnly(e.target.checked); setPage(1); }} />
          Conflicts only
        </label>
        <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={unmatchedOnly} onChange={(e) => { setUnmatchedOnly(e.target.checked); setPage(1); }} />
          Unmatched only
        </label>
      </div>
      <div style={{ fontSize: 11, color: "#888", marginBottom: 6 }}>
        Showing {display.length} of {filtered.length}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#888", fontSize: 9.5, textTransform: "uppercase", letterSpacing: ".08em", background: "#F7F6F3" }}>
              <th style={cellStyle()}>Buyer</th>
              <th style={cellStyle()}>Email</th>
              <th style={cellStyle()}>Phone</th>
              <th style={cellStyle()}>Attributed</th>
              <th style={cellStyle()}>Method</th>
              <th style={cellStyle()}>Matched lead</th>
              <th style={cellStyle()}>Source</th>
              <th style={cellStyle()}>Row</th>
              <th style={cellStyle()}>Competing</th>
              <th style={cellStyle()}>Conf.</th>
              <th style={cellStyle()}>Reason</th>
            </tr>
          </thead>
          <tbody>
            {display.map((a) => (
              <tr key={a.saleId} style={{ borderTop: "1px solid #F0EDE8", background: a.needsReview ? "#FFFBEB" : "transparent" }}>
                <td style={cellStyle()}>{a.buyerName || "—"}</td>
                <td style={cellStyle()}>{a.buyerEmail || "—"}</td>
                <td style={cellStyle()}>{a.buyerPhone || "—"}</td>
                <td style={cellStyle()}>{a.attributedTo || <span style={{ color: "#CA8A04" }}>Unmatched</span>}</td>
                <td style={cellStyle()}>{a.matchMethod}</td>
                <td style={cellStyle()}>{a.matchedLeadName || "—"}<div style={{ fontSize: 10, color: "#888" }}>{a.matchedLeadEmail || a.matchedLeadPhone || ""}</div></td>
                <td style={cellStyle()}>{a.sourceMediaBuyer || "—"}</td>
                <td style={cellStyle()}>{a.sourceRowIndex ?? "—"}</td>
                <td style={cellStyle()}>{a.competingMatches.length}</td>
                <td style={cellStyle()}>{a.confidenceScore.toFixed(2)}</td>
                <td style={{ ...cellStyle(), maxWidth: 280, fontSize: 11, color: "#555" }}>{a.matchReason}</td>
              </tr>
            ))}
            {display.length === 0 && (
              <tr><td colSpan={11} style={{ textAlign: "center", padding: 16, color: "#888" }}>No rows match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 12 }}>
          <button className="btn btn-g btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
          <span style={{ fontSize: 12, color: "#888", alignSelf: "center" }}>Page {page} of {totalPages}</span>
          <button className="btn btn-g btn-sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next →</button>
        </div>
      )}
    </Collapsible>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "2px 0" }}>
      <div style={{ width: 180, color: "#888" }}>{k}</div>
      <div style={{ flex: 1, fontFamily: mono ? "ui-monospace,Menlo,monospace" : undefined, color: "#0a0a0a" }}>{v || "—"}</div>
    </div>
  );
}
function cellStyle(): React.CSSProperties {
  return { padding: "8px 10px", verticalAlign: "top" };
}
function summarizeMapping(m: any): string {
  if (!m) return "auto-detected";
  const parts: string[] = [];
  if (m.name) parts.push(`name=${m.name}`);
  if (m.email) parts.push(`email=${m.email}`);
  if (m.phone) parts.push(`phone=${m.phone}`);
  if (m.amount) parts.push(`amount=${m.amount}`);
  return parts.length ? parts.join(", ") : "auto-detected";
}
