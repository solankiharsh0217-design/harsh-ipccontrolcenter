import Papa from "papaparse";

export interface MergedLead {
  email: string; name: string; phone: string; country: string;
  totalMinutes: number; sessions: number; firstJoin: string | null;
  registration: string | null; attended: boolean;
  attendancePct: number; score: number;
  grade: "hot" | "warm" | "cold" | "non-attendee" | "true-absentee" | "very-cold";
  source: "Zoom Register" | "Registration Sheet" | "Zoom Attendee";
}

export interface DetectedColumns {
  name: { header: string | null; index: number };
  email: { header: string | null; index: number };
  phone: { header: string | null; index: number };
}

export interface QualifierResult {
  mode: 1 | 2;
  webinarName: string; webinarId: string; webinarDate: string;
  durationMin: number; registrants: number; viewers: number;
  leads: MergedLead[];
  thresholds: { hot: number; warm: number; cold: number };
  zoomDetection: DetectedColumns;
  regDetection?: DetectedColumns;
  zoomFileName?: string;
  regFileName?: string;
}

const num = (v: any) => { const n = Number(String(v ?? "").replace(/[^\d.]/g, "")); return isFinite(n) ? n : 0; };

const NAME_KEYS = ["full name", "attendee", "participant", "first name", "fname", "name"];
const EMAIL_KEYS = ["email", "e-mail", "mail"];
const PHONE_KEYS = ["whatsapp", "mobile", "phone", "contact", "ph no", "number"];

function detectColumns(headers: string[]): DetectedColumns {
  const lower = headers.map((h) => (h || "").toLowerCase().trim());
  const find = (keys: string[]) => {
    for (const k of keys) {
      const i = lower.findIndex((h) => h.includes(k));
      if (i >= 0) return { header: headers[i], index: i };
    }
    return { header: null, index: -1 };
  };
  return { name: find(NAME_KEYS), email: find(EMAIL_KEYS), phone: find(PHONE_KEYS) };
}

function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 60); i++) {
    const r = (rows[i] || []).map((c) => (c || "").toLowerCase());
    if (r.some((c) => c.includes("email") || c.includes("e-mail")) &&
        r.some((c) => c.includes("name") || c.includes("attendee") || c.includes("participant"))) {
      return i;
    }
  }
  return -1;
}

interface ZoomMeta {
  webinarName: string; webinarId: string; webinarDate: string;
  durationMin: number; registrants: number; viewers: number;
}

function extractZoomMeta(rows: string[][]): ZoomMeta {
  let webinarName = "", webinarId = "", webinarDate = "", durationMin = 0, registrants = 0, viewers = 0;
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const r = rows[i] || [];
    const head = (r[0] || "").toLowerCase();
    if (head.includes("topic")) webinarName = r[1] || "";
    if (head.includes("webinar id")) webinarId = r[1] || "";
    if (head.includes("actual start time") || head.includes("start time")) webinarDate = r[1] || "";
    if (head.includes("actual duration") || head.includes("duration")) durationMin = num(r[1]);
    if (head.includes("# registered") || head.includes("registered")) registrants = num(r[1]);
    if (head.includes("# viewer") || head.includes("unique viewer")) viewers = num(r[1]);
  }
  if (!durationMin) durationMin = 60;
  return { webinarName, webinarId, webinarDate, durationMin, registrants, viewers };
}

interface ZoomAttendance {
  totalMinutes: number; sessions: number; phone: string; country: string;
  firstJoin: string | null; registration: string | null; name: string; attended: boolean;
}

function parseZoomAttendees(text: string): { meta: ZoomMeta; map: Map<string, ZoomAttendance>; detection: DetectedColumns; nonAttendeeEmails: Set<string> } {
  const rows = Papa.parse<string[]>(text, { skipEmptyLines: false }).data as string[][];
  const meta = extractZoomMeta(rows);
  const headerIdx = findHeaderRow(rows);
  const headers = headerIdx >= 0 ? rows[headerIdx] : [];
  const detection = detectColumns(headers);

  // Find indexes for time/sessions columns by header
  const lower = headers.map((h) => (h || "").toLowerCase());
  const idx = (...keys: string[]) => {
    for (const k of keys) {
      const i = lower.findIndex((h) => h.includes(k));
      if (i >= 0) return i;
    }
    return -1;
  };
  const iAttended = idx("attended");
  const iName = detection.name.index;
  const iEmail = detection.email.index;
  const iPhone = detection.phone.index;
  const iJoin = idx("join time");
  const iMinutes = idx("time in session", "minutes");
  const iCountry = idx("country");
  const iReg = idx("registration time", "registered");

  const map = new Map<string, ZoomAttendance>();
  const nonAttendeeEmails = new Set<string>();

  for (let i = (headerIdx >= 0 ? headerIdx + 1 : 0); i < rows.length; i++) {
    const r = rows[i] || [];
    if (!r || r.length < 2) continue;
    const first = (r[0] || "").toLowerCase();
    if (first.includes("panelist") || first.includes("host details") || first.includes("other attended")) break;
    const email = ((iEmail >= 0 ? r[iEmail] : "") || "").trim().toLowerCase();
    if (!email || !email.includes("@")) continue;
    const minutes = iMinutes >= 0 ? num(r[iMinutes]) : 0;
    const attendedFlag = iAttended >= 0 ? (r[iAttended] || "").toLowerCase().startsWith("y") : minutes > 0;
    const name = (iName >= 0 ? r[iName] : "") || email;
    const phone = (iPhone >= 0 ? r[iPhone] : "") || "";
    const country = (iCountry >= 0 ? r[iCountry] : "") || "";
    const join = (iJoin >= 0 ? r[iJoin] : "") || "";
    const reg = (iReg >= 0 ? r[iReg] : "") || "";

    if (!attendedFlag && minutes === 0) {
      nonAttendeeEmails.add(email);
      if (!map.has(email)) {
        map.set(email, { totalMinutes: 0, sessions: 0, phone, country, firstJoin: null, registration: reg || null, name, attended: false });
      }
      continue;
    }

    const ex = map.get(email);
    if (!ex) {
      map.set(email, {
        totalMinutes: minutes, sessions: minutes > 0 ? 1 : 0,
        phone, country, firstJoin: join || null, registration: reg || null, name, attended: true,
      });
    } else {
      ex.totalMinutes += minutes;
      if (minutes > 0) ex.sessions += 1;
      if (!ex.phone && phone) ex.phone = phone;
      if (!ex.country && country) ex.country = country;
      if (join && (!ex.firstJoin || join < ex.firstJoin)) ex.firstJoin = join;
      ex.attended = true;
    }
    nonAttendeeEmails.delete(email);
  }
  return { meta, map, detection, nonAttendeeEmails };
}

function gradeFromAttendance(totalMinutes: number, durationMin: number, attended: boolean): MergedLead["grade"] {
  if (!attended || totalMinutes === 0) return "non-attendee";
  const pct = (totalMinutes / Math.max(1, durationMin)) * 100;
  if (pct >= 60) return "hot";
  if (pct >= 30) return "warm";
  if (pct >= 1) return "cold";
  return "very-cold";
}

function scoreLead(l: { totalMinutes: number; sessions: number; firstJoin: string | null; registration: string | null; country: string; }, durationMin: number): number {
  const pct = durationMin > 0 ? Math.min(100, (l.totalMinutes / durationMin) * 100) : 0;
  let s = 0;
  s += Math.min(50, (pct / 100) * 50);
  s += Math.min(20, l.sessions * 7);
  s += l.firstJoin ? 8 : 0;
  s += l.registration ? 8 : 0;
  s += (l.country || "").toLowerCase().includes("india") ? 10 : 5;
  return Math.round(s);
}

export function detectFileColumns(text: string): { detection: DetectedColumns; rowCount: number } {
  const rows = Papa.parse<string[]>(text, { skipEmptyLines: true }).data as string[][];
  const headerIdx = findHeaderRow(rows);
  const headers = headerIdx >= 0 ? rows[headerIdx] : (rows[0] || []);
  const detection = detectColumns(headers);
  const rowCount = Math.max(0, rows.length - (headerIdx >= 0 ? headerIdx + 1 : 1));
  return { detection, rowCount };
}

export function parseZoomCsv(text: string, zoomFileName?: string): QualifierResult {
  const { meta, map, detection, nonAttendeeEmails } = parseZoomAttendees(text);
  const leads: MergedLead[] = Array.from(map.entries()).map(([email, a]) => {
    const grade = gradeFromAttendance(a.totalMinutes, meta.durationMin, a.attended);
    const pct = meta.durationMin > 0 ? Math.min(100, (a.totalMinutes / meta.durationMin) * 100) : 0;
    return {
      email, name: a.name, phone: a.phone, country: a.country,
      totalMinutes: a.totalMinutes, sessions: a.sessions, firstJoin: a.firstJoin,
      registration: a.registration, attended: a.attended,
      attendancePct: Math.round(pct * 10) / 10,
      score: scoreLead(a, meta.durationMin), grade,
      source: a.attended ? "Zoom Attendee" : "Zoom Register",
    };
  });
  // Ensure non-attendees from Zoom register are present
  for (const email of nonAttendeeEmails) {
    if (!leads.find((l) => l.email === email)) {
      const a = map.get(email);
      if (a) {
        leads.push({
          email, name: a.name, phone: a.phone, country: a.country,
          totalMinutes: 0, sessions: 0, firstJoin: null, registration: a.registration,
          attended: false, attendancePct: 0, score: 0, grade: "non-attendee",
          source: "Zoom Register",
        });
      }
    }
  }

  return {
    mode: 1,
    webinarName: meta.webinarName || "Untitled Webinar",
    webinarId: meta.webinarId, webinarDate: meta.webinarDate,
    durationMin: meta.durationMin, registrants: meta.registrants, viewers: meta.viewers,
    leads,
    thresholds: { hot: Math.round(meta.durationMin * 0.6), warm: Math.round(meta.durationMin * 0.3), cold: 1 },
    zoomDetection: detection,
    zoomFileName,
  };
}

export function parseRegistrationAndZoom(regText: string, zoomText: string, regFileName?: string, zoomFileName?: string): QualifierResult {
  const { meta, map: zoomMap, detection: zoomDetection } = parseZoomAttendees(zoomText);
  const regRows = Papa.parse<string[]>(regText, { skipEmptyLines: true }).data as string[][];
  const headerIdx = findHeaderRow(regRows);
  const regHeaders = headerIdx >= 0 ? regRows[headerIdx] : (regRows[0] || []);
  const regDetection = detectColumns(regHeaders);
  const dataStart = (headerIdx >= 0 ? headerIdx + 1 : 1);

  const seen = new Set<string>();
  const leads: MergedLead[] = [];

  for (let i = dataStart; i < regRows.length; i++) {
    const r = regRows[i] || [];
    const email = ((regDetection.email.index >= 0 ? r[regDetection.email.index] : "") || "").trim().toLowerCase();
    if (!email || !email.includes("@") || seen.has(email)) continue;
    seen.add(email);
    const name = (regDetection.name.index >= 0 ? r[regDetection.name.index] : "") || email;
    const phone = (regDetection.phone.index >= 0 ? r[regDetection.phone.index] : "") || "";
    const att = zoomMap.get(email);
    if (att && att.attended && att.totalMinutes > 0) {
      const grade = gradeFromAttendance(att.totalMinutes, meta.durationMin, true);
      const pct = (att.totalMinutes / Math.max(1, meta.durationMin)) * 100;
      leads.push({
        email, name: att.name || name, phone: att.phone || phone, country: att.country,
        totalMinutes: att.totalMinutes, sessions: att.sessions, firstJoin: att.firstJoin,
        registration: att.registration, attended: true,
        attendancePct: Math.round(pct * 10) / 10,
        score: scoreLead(att, meta.durationMin), grade,
        source: "Zoom Attendee",
      });
    } else {
      leads.push({
        email, name, phone, country: "",
        totalMinutes: 0, sessions: 0, firstJoin: null, registration: null,
        attended: false, attendancePct: 0, score: 0, grade: "true-absentee",
        source: "Registration Sheet",
      });
    }
  }

  // Add Zoom-only attendees not in registration sheet (rare but possible)
  for (const [email, att] of zoomMap.entries()) {
    if (seen.has(email)) continue;
    if (!att.attended) continue;
    seen.add(email);
    const grade = gradeFromAttendance(att.totalMinutes, meta.durationMin, true);
    const pct = (att.totalMinutes / Math.max(1, meta.durationMin)) * 100;
    leads.push({
      email, name: att.name, phone: att.phone, country: att.country,
      totalMinutes: att.totalMinutes, sessions: att.sessions, firstJoin: att.firstJoin,
      registration: att.registration, attended: true,
      attendancePct: Math.round(pct * 10) / 10,
      score: scoreLead(att, meta.durationMin), grade,
      source: "Zoom Attendee",
    });
  }

  return {
    mode: 2,
    webinarName: meta.webinarName || "Untitled Webinar",
    webinarId: meta.webinarId, webinarDate: meta.webinarDate,
    durationMin: meta.durationMin, registrants: meta.registrants || seen.size, viewers: meta.viewers,
    leads,
    thresholds: { hot: Math.round(meta.durationMin * 0.6), warm: Math.round(meta.durationMin * 0.3), cold: 1 },
    zoomDetection, regDetection, zoomFileName, regFileName,
  };
}

export function leadsToCsv(leads: MergedLead[]): string {
  const headers = ["Name","Email","Phone","Total Minutes","% of Session","Sessions","Grade","Source","First Join","Country"];
  const rows = leads.map((l) => [l.name, l.email, l.phone, l.totalMinutes, l.attendancePct, l.sessions, l.grade, l.source, l.firstJoin || "", l.country]);
  return Papa.unparse([headers, ...rows]);
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
