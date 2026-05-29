import Papa from "papaparse";
import { buildIdentity, normalizeEmail, normalizePhone, isValidEmail, type Identity } from "@/lib/identity";

export interface MergedLead {
  email: string; name: string; phone: string; country: string;
  totalMinutes: number; sessions: number; firstJoin: string | null;
  registration: string | null; attended: boolean;
  attendancePct: number; score: number;
  grade: "hot" | "warm" | "cold" | "non-attendee" | "true-absentee" | "very-cold";
  source: "Zoom Register" | "Registration Sheet" | "Zoom Attendee";
  identityKey: string;
  identityKind: Identity["kind"];
  weakIdentity: boolean;
  rawRows: number;          // how many raw rows merged into this lead
  rawMinutes: number;       // uncapped sum of session minutes
}

export interface DetectedColumns {
  name: { header: string | null; index: number };
  email: { header: string | null; index: number };
  phone: { header: string | null; index: number };
}

export interface DuplicateBreakdownRow {
  name: string;
  email: string;
  phone: string;
  rawRows: number;
  rawMinutes: number;
  cappedMinutes: number;
  grade: MergedLead["grade"];
  action: "merged" | "kept" | "weak-identity";
}

export interface DedupSummary {
  registration: { rawRows: number; unique: number; duplicates: number; missingEmail: number; missingPhone: number; weak: number };
  attendance: { rawRows: number; unique: number; duplicates: number; weak: number };
  topDuplicates: DuplicateBreakdownRow[];
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
  dedupSummary: DedupSummary;
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
  identity: Identity;
  totalMinutes: number; sessions: number; phone: string; country: string;
  firstJoin: string | null; registration: string | null; name: string; attended: boolean;
  rawRows: number;
}

interface AttendeeParse {
  meta: ZoomMeta;
  map: Map<string, ZoomAttendance>;
  detection: DetectedColumns;
  rawAttendeeRows: number;
  weakAttendeeIdentities: number;
}

function parseZoomAttendees(text: string): AttendeeParse {
  const rows = Papa.parse<string[]>(text, { skipEmptyLines: false }).data as string[][];
  const meta = extractZoomMeta(rows);
  const headerIdx = findHeaderRow(rows);
  const headers = headerIdx >= 0 ? rows[headerIdx] : [];
  const detection = detectColumns(headers);

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
  let rawAttendeeRows = 0;
  let weakAttendeeIdentities = 0;

  for (let i = (headerIdx >= 0 ? headerIdx + 1 : 0); i < rows.length; i++) {
    const r = rows[i] || [];
    if (!r || r.length < 2) continue;
    const first = (r[0] || "").toLowerCase();
    if (first.includes("panelist") || first.includes("host details") || first.includes("other attended")) break;

    const rawEmail = iEmail >= 0 ? r[iEmail] : "";
    const rawPhone = iPhone >= 0 ? r[iPhone] : "";
    const rawName = iName >= 0 ? r[iName] : "";
    const identity = buildIdentity({ email: rawEmail, phone: rawPhone, name: rawName });
    if (!identity.key) continue;

    rawAttendeeRows++;

    const minutes = iMinutes >= 0 ? num(r[iMinutes]) : 0;
    const attendedFlag = iAttended >= 0 ? (r[iAttended] || "").toLowerCase().startsWith("y") : minutes > 0;
    const name = rawName || identity.email || identity.phone || "Unknown";
    const country = (iCountry >= 0 ? r[iCountry] : "") || "";
    const join = (iJoin >= 0 ? r[iJoin] : "") || "";
    const reg = (iReg >= 0 ? r[iReg] : "") || "";

    const ex = map.get(identity.key);
    if (!ex) {
      if (identity.weak) weakAttendeeIdentities++;
      map.set(identity.key, {
        identity,
        totalMinutes: minutes,
        sessions: minutes > 0 ? 1 : 0,
        phone: identity.phone,
        country,
        firstJoin: join || null,
        registration: reg || null,
        name,
        attended: attendedFlag || minutes > 0,
        rawRows: 1,
      });
    } else {
      ex.totalMinutes += minutes;
      if (minutes > 0) ex.sessions += 1;
      if (!ex.phone && identity.phone) ex.phone = identity.phone;
      if (!ex.country && country) ex.country = country;
      if (join && (!ex.firstJoin || join < ex.firstJoin)) ex.firstJoin = join;
      if (attendedFlag || minutes > 0) ex.attended = true;
      ex.rawRows += 1;
    }
  }
  return { meta, map, detection, rawAttendeeRows, weakAttendeeIdentities };
}

function gradeFromAttendance(totalMinutesCapped: number, durationMin: number, attended: boolean): MergedLead["grade"] {
  if (!attended || totalMinutesCapped === 0) return "non-attendee";
  const pct = (totalMinutesCapped / Math.max(1, durationMin)) * 100;
  if (pct >= 60) return "hot";
  if (pct >= 30) return "warm";
  if (pct >= 1) return "cold";
  return "very-cold";
}

function scoreLead(l: { totalMinutes: number; sessions: number; firstJoin: string | null; registration: string | null; country: string }, durationMin: number): number {
  const pct = durationMin > 0 ? Math.min(100, (l.totalMinutes / durationMin) * 100) : 0;
  let s = 0;
  s += Math.min(50, (pct / 100) * 50);
  s += Math.min(20, l.sessions * 7);
  s += l.firstJoin ? 8 : 0;
  s += l.registration ? 8 : 0;
  s += (l.country || "").toLowerCase().includes("india") ? 10 : 5;
  return Math.round(s);
}

function buildLeadFromAttendance(a: ZoomAttendance, durationMin: number): MergedLead {
  // Cap total minutes by configured duration (Part 4).
  const capped = Math.min(a.totalMinutes, Math.max(1, durationMin));
  const grade = gradeFromAttendance(capped, durationMin, a.attended);
  const pct = durationMin > 0 ? Math.min(100, (capped / durationMin) * 100) : 0;
  return {
    email: a.identity.email,
    name: a.name,
    phone: a.identity.phone || a.phone,
    country: a.country,
    totalMinutes: capped,
    sessions: a.sessions,
    firstJoin: a.firstJoin,
    registration: a.registration,
    attended: a.attended,
    attendancePct: Math.round(pct * 10) / 10,
    score: scoreLead({ ...a, totalMinutes: capped }, durationMin),
    grade,
    source: a.attended ? "Zoom Attendee" : "Zoom Register",
    identityKey: a.identity.key,
    identityKind: a.identity.kind,
    weakIdentity: a.identity.weak,
    rawRows: a.rawRows,
    rawMinutes: a.totalMinutes,
  };
}

export function detectFileColumns(text: string): { detection: DetectedColumns; rowCount: number } {
  const rows = Papa.parse<string[]>(text, { skipEmptyLines: true }).data as string[][];
  const headerIdx = findHeaderRow(rows);
  const headers = headerIdx >= 0 ? rows[headerIdx] : (rows[0] || []);
  const detection = detectColumns(headers);
  const rowCount = Math.max(0, rows.length - (headerIdx >= 0 ? headerIdx + 1 : 1));
  return { detection, rowCount };
}

function buildTopDuplicates(leads: MergedLead[]): DuplicateBreakdownRow[] {
  return leads
    .filter((l) => l.rawRows > 1 || l.weakIdentity)
    .sort((a, b) => b.rawRows - a.rawRows)
    .slice(0, 50)
    .map((l) => ({
      name: l.name,
      email: l.email,
      phone: l.phone,
      rawRows: l.rawRows,
      rawMinutes: l.rawMinutes,
      cappedMinutes: l.totalMinutes,
      grade: l.grade,
      action: l.weakIdentity ? "weak-identity" : l.rawRows > 1 ? "merged" : "kept",
    }));
}

export function parseZoomCsv(text: string, zoomFileName?: string): QualifierResult {
  const { meta, map, detection, rawAttendeeRows, weakAttendeeIdentities } = parseZoomAttendees(text);
  const leads: MergedLead[] = Array.from(map.values()).map((a) => buildLeadFromAttendance(a, meta.durationMin));

  const dedupSummary: DedupSummary = {
    registration: { rawRows: 0, unique: 0, duplicates: 0, missingEmail: 0, missingPhone: 0, weak: 0 },
    attendance: {
      rawRows: rawAttendeeRows,
      unique: leads.length,
      duplicates: Math.max(0, rawAttendeeRows - leads.length),
      weak: weakAttendeeIdentities,
    },
    topDuplicates: buildTopDuplicates(leads),
  };

  return {
    mode: 1,
    webinarName: meta.webinarName || "Untitled Webinar",
    webinarId: meta.webinarId, webinarDate: meta.webinarDate,
    durationMin: meta.durationMin, registrants: meta.registrants, viewers: meta.viewers,
    leads,
    thresholds: { hot: Math.round(meta.durationMin * 0.6), warm: Math.round(meta.durationMin * 0.3), cold: 1 },
    zoomDetection: detection,
    zoomFileName,
    dedupSummary,
  };
}

export function parseRegistrationAndZoom(regText: string, zoomText: string, regFileName?: string, zoomFileName?: string): QualifierResult {
  const { meta, map: zoomMap, detection: zoomDetection, rawAttendeeRows, weakAttendeeIdentities } = parseZoomAttendees(zoomText);
  const regRows = Papa.parse<string[]>(regText, { skipEmptyLines: true }).data as string[][];
  const headerIdx = findHeaderRow(regRows);
  const regHeaders = headerIdx >= 0 ? regRows[headerIdx] : (regRows[0] || []);
  const regDetection = detectColumns(regHeaders);
  const dataStart = (headerIdx >= 0 ? headerIdx + 1 : 1);

  // Aggregate registration rows by identity (Part 3).
  interface RegRow {
    identity: Identity;
    name: string;
    phone: string;
    rawRows: number;
    bestScore: number;
  }
  const regByKey = new Map<string, RegRow>();
  let rawRegRows = 0;
  let regMissingEmail = 0;
  let regMissingPhone = 0;
  let regWeak = 0;

  for (let i = dataStart; i < regRows.length; i++) {
    const r = regRows[i] || [];
    const rawEmail = regDetection.email.index >= 0 ? r[regDetection.email.index] : "";
    const rawPhone = regDetection.phone.index >= 0 ? r[regDetection.phone.index] : "";
    const rawName = regDetection.name.index >= 0 ? r[regDetection.name.index] : "";

    // Skip completely empty rows
    if (!rawEmail && !rawPhone && !rawName) continue;

    const identity = buildIdentity({ email: rawEmail, phone: rawPhone, name: rawName });
    if (!identity.key) continue;

    rawRegRows++;
    if (!identity.email) regMissingEmail++;
    if (!identity.phone) regMissingPhone++;

    const name = rawName || identity.email || identity.phone || "Unknown";
    // best-row scoring: email+phone > email > phone, longer name wins ties
    const score =
      (identity.email && identity.phone ? 1000 : 0) +
      (identity.email && !identity.phone ? 600 : 0) +
      (!identity.email && identity.phone ? 400 : 0) +
      Math.min(50, (name?.length || 0));

    const ex = regByKey.get(identity.key);
    if (!ex) {
      if (identity.weak) regWeak++;
      regByKey.set(identity.key, {
        identity, name, phone: identity.phone || rawPhone, rawRows: 1, bestScore: score,
      });
    } else {
      ex.rawRows++;
      if (score > ex.bestScore) {
        ex.name = name;
        ex.phone = identity.phone || ex.phone;
        ex.bestScore = score;
      }
    }
  }

  const leads: MergedLead[] = [];
  const seenKeys = new Set<string>();

  // Pass 1: registered identities, joined with attendance if present
  for (const reg of regByKey.values()) {
    seenKeys.add(reg.identity.key);
    const att = zoomMap.get(reg.identity.key);
    if (att && att.attended && att.totalMinutes > 0) {
      const lead = buildLeadFromAttendance(att, meta.durationMin);
      // prefer registration name/phone when attendance lacks it
      lead.name = att.name || reg.name;
      lead.phone = att.identity.phone || reg.phone || lead.phone;
      lead.source = "Zoom Attendee";
      leads.push(lead);
    } else {
      leads.push({
        email: reg.identity.email,
        name: reg.name,
        phone: reg.phone,
        country: "",
        totalMinutes: 0, sessions: 0, firstJoin: null, registration: null,
        attended: false, attendancePct: 0, score: 0,
        grade: "true-absentee",
        source: "Registration Sheet",
        identityKey: reg.identity.key,
        identityKind: reg.identity.kind,
        weakIdentity: reg.identity.weak,
        rawRows: reg.rawRows,
        rawMinutes: 0,
      });
    }
  }

  // Pass 2: attendees not present in registration sheet (unmatched attendees)
  for (const att of zoomMap.values()) {
    if (seenKeys.has(att.identity.key)) continue;
    if (!att.attended) continue;
    seenKeys.add(att.identity.key);
    leads.push(buildLeadFromAttendance(att, meta.durationMin));
  }

  const dedupSummary: DedupSummary = {
    registration: {
      rawRows: rawRegRows,
      unique: regByKey.size,
      duplicates: Math.max(0, rawRegRows - regByKey.size),
      missingEmail: regMissingEmail,
      missingPhone: regMissingPhone,
      weak: regWeak,
    },
    attendance: {
      rawRows: rawAttendeeRows,
      unique: zoomMap.size,
      duplicates: Math.max(0, rawAttendeeRows - zoomMap.size),
      weak: weakAttendeeIdentities,
    },
    topDuplicates: buildTopDuplicates(leads),
  };

  return {
    mode: 2,
    webinarName: meta.webinarName || "Untitled Webinar",
    webinarId: meta.webinarId, webinarDate: meta.webinarDate,
    durationMin: meta.durationMin,
    registrants: meta.registrants || regByKey.size,
    viewers: meta.viewers,
    leads,
    thresholds: { hot: Math.round(meta.durationMin * 0.6), warm: Math.round(meta.durationMin * 0.3), cold: 1 },
    zoomDetection, regDetection, zoomFileName, regFileName,
    dedupSummary,
  };
}

export function leadsToCsv(leads: MergedLead[]): string {
  const headers = ["Name","Email","Phone","Total Minutes","% of Session","Sessions","Grade","Source","First Join","Country","Raw Rows Merged","Identity"];
  const rows = leads.map((l) => [l.name, l.email, l.phone, l.totalMinutes, l.attendancePct, l.sessions, l.grade, l.source, l.firstJoin || "", l.country, l.rawRows, l.identityKind + (l.weakIdentity ? "(weak)" : "")]);
  return Papa.unparse([headers, ...rows]);
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// Re-export for callers that want raw helpers
export { normalizeEmail, normalizePhone, isValidEmail };
