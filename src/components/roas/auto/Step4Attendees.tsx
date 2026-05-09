import React, { useState } from "react";
import {
  type AttendeeSlot, type AttendeeSlotSource,
  parseCsvFile, parseSheetUrl, newDaySlot, newPitchSlot,
} from "@/lib/roas/attendees";

type Props = {
  slots: AttendeeSlot[];
  setSlots: (s: AttendeeSlot[]) => void;
};

export default function Step4Attendees({ slots, setSlots }: Props) {
  const dayCount = slots.filter((s) => s.slotType === "day").length;

  function update(uid: string, patch: Partial<AttendeeSlot>) {
    setSlots(slots.map((s) => (s.uid === uid ? { ...s, ...patch } : s)));
  }
  function remove(uid: string) {
    setSlots(slots.filter((s) => s.uid !== uid));
  }
  function addDay() {
    setSlots([...slots, newDaySlot(dayCount)]);
  }
  function addPitch() {
    setSlots([...slots, newPitchSlot()]);
  }

  return (
    <>
      <div className="wiz-h">Attendees</div>
      <div className="wiz-sub">
        Upload the attendee list for every webinar day and the sales pitch. You can either upload a CSV file
        (e.g. Zoom export) or paste a Google Sheet tab URL. This data is saved with the report so you can
        retrieve or download it later.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 14 }}>
        {slots.map((slot) => (
          <SlotCard key={slot.uid} slot={slot} onChange={(p) => update(slot.uid, p)} onRemove={() => remove(slot.uid)} />
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button className="btn btn-g btn-sm" onClick={addDay}>+ Add another day</button>
        <button className="btn btn-g btn-sm" onClick={addPitch}>+ Add another sales pitch</button>
      </div>

      <div style={{ marginTop: 16, fontSize: 12, color: "#888" }}>
        All slots must have an attendee source attached before you can calculate ROAS.
      </div>
    </>
  );
}

function SlotCard({ slot, onChange, onRemove }: { slot: AttendeeSlot; onChange: (p: Partial<AttendeeSlot>) => void; onRemove: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sourceMode, setSourceMode] = useState<"csv_upload" | "google_sheet">(slot.source?.kind || "csv_upload");
  const [sheetUrl, setSheetUrl] = useState(slot.source?.kind === "google_sheet" ? slot.source.sheetUrl : "");

  async function handleFile(file: File) {
    setBusy(true); setErr(null);
    try {
      const parsed = await parseCsvFile(file);
      const src: AttendeeSlotSource = {
        kind: "csv_upload", file,
        fileName: file.name, fileSizeBytes: file.size, parsed,
      };
      onChange({ source: src });
    } catch (e: any) { setErr(e?.message || "Could not parse CSV"); }
    finally { setBusy(false); }
  }

  async function handleSheet() {
    if (!sheetUrl.trim()) return;
    setBusy(true); setErr(null);
    try {
      const parsed = await parseSheetUrl(sheetUrl.trim());
      const src: AttendeeSlotSource = {
        kind: "google_sheet",
        sheetUrl: sheetUrl.trim(),
        sheetId: parsed.sheetId,
        tabGid: parsed.tabGid,
        tabName: null,
        parsed: { headers: parsed.headers, rows: parsed.rows, rowCount: parsed.rowCount, columnMapping: parsed.columnMapping },
      };
      onChange({ source: src });
    } catch (e: any) { setErr(e?.message || "Could not fetch sheet"); }
    finally { setBusy(false); }
  }

  function clearSource() {
    onChange({ source: null });
    setErr(null);
  }

  const ready = !!slot.source;

  return (
    <div style={{ border: "1px solid #E8E5DE", borderRadius: 12, padding: 16, background: ready ? "#F9FCF5" : "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <input className="fi" style={{ width: 220, height: 36 }} value={slot.slotLabel}
              onChange={(e) => onChange({ slotLabel: e.target.value })} placeholder="Slot label" />
            <input type="date" className="fi" style={{ width: 170, height: 36 }} value={slot.slotDate || ""}
              onChange={(e) => onChange({ slotDate: e.target.value || null })} />
            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 12, background: slot.slotType === "sales_pitch" ? "#FBF6E9" : "#F0F4F8", color: slot.slotType === "sales_pitch" ? "#7A5E10" : "#2563EB", textTransform: "uppercase", letterSpacing: ".08em" }}>
              {slot.slotType === "sales_pitch" ? "Sales Pitch" : "Webinar Day"}
            </span>
          </div>
        </div>
        <button className="btn btn-g btn-sm" onClick={onRemove}>Remove</button>
      </div>

      {!ready && (
        <>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            <button type="button" className={`btn btn-sm ${sourceMode === "csv_upload" ? "btn-k" : "btn-g"}`} onClick={() => setSourceMode("csv_upload")}>CSV upload</button>
            <button type="button" className={`btn btn-sm ${sourceMode === "google_sheet" ? "btn-k" : "btn-g"}`} onClick={() => setSourceMode("google_sheet")}>Google Sheet</button>
          </div>

          {sourceMode === "csv_upload" && (
            <div style={{ border: "1px dashed #C8C4BB", borderRadius: 8, padding: 16, textAlign: "center" }}>
              <input id={`file_${slot.uid}`} type="file" accept=".csv,text/csv" style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }} />
              <label htmlFor={`file_${slot.uid}`} className="btn btn-k btn-sm" style={{ cursor: "pointer" }}>
                {busy ? "Parsing…" : "Choose CSV file"}
              </label>
              <div style={{ fontSize: 11, color: "#888", marginTop: 8 }}>Accepts any CSV (Zoom attendee export, Excel save-as, etc.)</div>
            </div>
          )}

          {sourceMode === "google_sheet" && (
            <div style={{ display: "flex", gap: 8 }}>
              <input className="fi" style={{ flex: 1, height: 40 }} placeholder="Paste tab URL with #gid=… or published CSV URL"
                value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)} />
              <button className="btn btn-k btn-sm" disabled={busy || !sheetUrl.trim()} onClick={handleSheet}>
                {busy ? "Fetching…" : "Fetch"}
              </button>
            </div>
          )}

          {err && <div style={{ color: "#DC2626", fontSize: 12, marginTop: 8 }}>{err}</div>}
        </>
      )}

      {ready && slot.source && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, background: "#fff", border: "1px solid #E2E0DA", borderRadius: 8, padding: 10 }}>
          <div style={{ fontSize: 12 }}>
            <div style={{ fontWeight: 500 }}>
              {slot.source.kind === "csv_upload" ? slot.source.fileName : "Google Sheet tab"}
            </div>
            <div style={{ color: "#888", marginTop: 2 }}>
              {slot.source.parsed.rowCount} rows · cols: {slot.source.parsed.headers.slice(0, 4).join(", ")}{slot.source.parsed.headers.length > 4 ? "…" : ""}
            </div>
            {slot.source.kind === "google_sheet" && (
              <div style={{ color: "#888", marginTop: 2, fontSize: 11, wordBreak: "break-all" }}>{slot.source.sheetUrl}</div>
            )}
          </div>
          <button className="btn btn-g btn-sm" onClick={clearSource}>Replace</button>
        </div>
      )}
    </div>
  );
}
