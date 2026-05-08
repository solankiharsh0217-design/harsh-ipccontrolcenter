// Column mapping override drawer for ROAS Auto Wizard v6.
// Allows users to manually pick which detected header corresponds to
// name / email / phone / amount / payment date.
// This does not change the matching algorithm — only which columns feed it.

import React, { useEffect, useState } from "react";

export type ColumnMapping = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  amount?: string | null;
  paymentDate?: string | null;
  registrationDate?: string | null;
  webinarName?: string | null;
  source?: string | null;
};

export type ColumnMappingDrawerProps = {
  open: boolean;
  onClose: () => void;
  tabName: string;
  role: "sales" | "media_buyer" | "ignore";
  detectedHeaders: string[];
  detectedColumnMapping: ColumnMapping | null | undefined;
  currentOverride: ColumnMapping | null | undefined;
  onSave: (mapping: ColumnMapping) => void;
};

const SALES_FIELDS: Array<{ key: keyof ColumnMapping; label: string; required?: boolean }> = [
  { key: "name", label: "Name", required: true },
  { key: "email", label: "Email", required: true },
  { key: "phone", label: "Phone" },
  { key: "amount", label: "Amount / Revenue" },
  { key: "paymentDate", label: "Payment Date" },
];
const MB_FIELDS: Array<{ key: keyof ColumnMapping; label: string; required?: boolean }> = [
  { key: "name", label: "Name", required: true },
  { key: "email", label: "Email", required: true },
  { key: "phone", label: "Phone" },
  { key: "registrationDate", label: "Registration Date" },
  { key: "webinarName", label: "Webinar Name" },
  { key: "source", label: "Source" },
];

export default function ColumnMappingDrawer(p: ColumnMappingDrawerProps) {
  const [m, setM] = useState<ColumnMapping>({});

  useEffect(() => {
    if (!p.open) return;
    setM({ ...(p.detectedColumnMapping || {}), ...(p.currentOverride || {}) });
  }, [p.open, p.detectedColumnMapping, p.currentOverride]);

  if (!p.open) return null;
  const fields = p.role === "sales" ? SALES_FIELDS : MB_FIELDS;
  const opts = ["", ...p.detectedHeaders];

  const setField = (k: keyof ColumnMapping, v: string) =>
    setM((prev) => ({ ...prev, [k]: v || null }));

  const save = () => {
    p.onSave(m);
    p.onClose();
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(10,10,10,0.4)", zIndex: 80, display: "flex", justifyContent: "flex-end" }}
      onClick={p.onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 480, maxWidth: "100%", height: "100%", background: "#fff",
          padding: 24, overflowY: "auto", boxShadow: "-8px 0 24px rgba(0,0,0,0.06)",
          fontFamily: "'Jost',sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22 }}>
            Column Mapping
          </div>
          <button onClick={p.onClose} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 18, color: "#888" }}>✕</button>
        </div>
        <div style={{ fontSize: 12, color: "#888", marginBottom: 18 }}>
          Tab: <strong style={{ color: "#0a0a0a" }}>{p.tabName}</strong> · Role: {p.role.replace("_", " ")}
        </div>

        {p.detectedHeaders.length === 0 ? (
          <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", color: "#7A5E10", padding: 12, borderRadius: 8, fontSize: 12 }}>
            This tab has no detected headers. Add headers in your sheet first.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {fields.map((f) => (
              <div key={f.key as string}>
                <label className="fl">{f.label}{f.required ? " *" : ""}</label>
                <select
                  className="fsel"
                  value={(m[f.key] as string) || ""}
                  onChange={(e) => setField(f.key, e.target.value)}
                >
                  {opts.map((o) => (
                    <option key={o} value={o}>{o || "— Not mapped —"}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 22, display: "flex", justifyContent: "space-between", gap: 8 }}>
          <button className="btn btn-g" onClick={() => setM({ ...(p.detectedColumnMapping || {}) })}>
            Reset to auto-detected
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-g" onClick={p.onClose}>Cancel</button>
            <button className="btn btn-k" onClick={save}>Save mapping</button>
          </div>
        </div>
      </div>
    </div>
  );
}
