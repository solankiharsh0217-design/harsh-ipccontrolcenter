import Papa from "papaparse";

export interface RawAttendee {
  attended: string; name: string; firstName: string; lastName: string;
  email: string; phone: string; registration: string; joinTime: string;
  leaveTime: string; minutes: number; country: string;
}

export interface MergedLead {
  email: string; name: string; phone: string; country: string;
  totalMinutes: number; sessions: number; firstJoin: string | null;
  registration: string | null; attended: boolean;
  attendancePct: number; score: number;
  grade: "hot" | "warm" | "cold" | "non-attendee" | "very-cold";
}

export interface QualifierResult {
  webinarName: string; webinarId: string; webinarDate: string;
  durationMin: number; registrants: number; viewers: number;
  leads: MergedLead[];
  thresholds: { hot: number; warm: number; cold: number };
}

const num = (v: any) => { const n = Number(String(v ?? "").replace(/[^\d.]/g, "")); return isFinite(n) ? n : 0; };

export function parseZoomCsv(text: string): QualifierResult {
  const rows = Papa.parse<string[]>(text, { skipEmptyLines: false }).data as string[][];

  // Extract metadata from first sections
  let webinarName = ""; let webinarId = ""; let webinarDate = ""; let durationMin = 0;
  let registrants = 0; let viewers = 0;

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

  // Find Attendee Details section header
  const attendeeIdx = rows.findIndex((r) => (r?.[0] || "").toLowerCase().includes("attendee details"));
  let dataStart = attendeeIdx >= 0 ? attendeeIdx + 2 : 0;
  // skip header row
  if (attendeeIdx >= 0) {
    // attendeeIdx+1 is column headers
  } else {
    // try to find row whose first col is "Attended" header
    const headerRow = rows.findIndex((r) => (r?.[0] || "").toLowerCase() === "attended");
    if (headerRow >= 0) dataStart = headerRow + 1;
  }

  const attendees: RawAttendee[] = [];
  for (let i = dataStart; i < rows.length; i++) {
    const r = rows[i] || [];
    if (!r || r.length < 5) continue;
    if ((r[0] || "").toLowerCase().includes("panelist") || (r[0] || "").toLowerCase().includes("host")) break;
    const email = (r[4] || "").trim().toLowerCase();
    if (!email) continue;
    attendees.push({
      attended: r[0] || "", name: r[1] || "", firstName: r[2] || "", lastName: r[3] || "",
      email, phone: (r[5] || "").trim(), registration: r[6] || "",
      joinTime: r[8] || "", leaveTime: r[9] || "", minutes: num(r[10]), country: r[12] || "",
    });
  }

  // Merge by email
  const map = new Map<string, MergedLead>();
  for (const a of attendees) {
    const ex = map.get(a.email);
    const nameFromParts = [a.firstName, a.lastName].filter(Boolean).join(" ").trim();
    const name = a.name || nameFromParts || a.email;
    if (!ex) {
      map.set(a.email, {
        email: a.email, name, phone: a.phone, country: a.country,
        totalMinutes: a.minutes, sessions: a.minutes > 0 ? 1 : 0,
        firstJoin: a.joinTime || null, registration: a.registration || null,
        attended: a.attended.toLowerCase().startsWith("y") || a.minutes > 0,
        attendancePct: 0, score: 0, grade: "cold",
      });
    } else {
      ex.totalMinutes += a.minutes;
      if (a.minutes > 0) ex.sessions += 1;
      if (!ex.phone && a.phone) ex.phone = a.phone;
      if (!ex.country && a.country) ex.country = a.country;
      if (a.joinTime && (!ex.firstJoin || a.joinTime < ex.firstJoin)) ex.firstJoin = a.joinTime;
      if (a.attended.toLowerCase().startsWith("y") || a.minutes > 0) ex.attended = true;
    }
  }

  // Score + grade
  const leads = Array.from(map.values()).map((l) => {
    const pct = durationMin > 0 ? Math.min(100, (l.totalMinutes / durationMin) * 100) : 0;
    let score = 0;
    score += Math.min(50, (pct / 100) * 50);
    score += Math.min(20, l.sessions * 7);
    score += l.firstJoin ? 8 : 0;
    score += l.registration ? 8 : 0;
    score += (l.country || "").toLowerCase().includes("india") ? 10 : 5;
    score = Math.round(score);
    let grade: MergedLead["grade"];
    if (!l.attended || l.totalMinutes === 0) grade = "non-attendee";
    else if (pct >= 60) grade = "hot";
    else if (pct >= 30) grade = "warm";
    else if (pct >= 1) grade = "cold";
    else grade = "very-cold";
    return { ...l, attendancePct: Math.round(pct * 10) / 10, score, grade };
  });

  return {
    webinarName: webinarName || "Untitled Webinar",
    webinarId, webinarDate, durationMin, registrants, viewers,
    leads,
    thresholds: {
      hot: Math.round(durationMin * 0.6),
      warm: Math.round(durationMin * 0.3),
      cold: 1,
    },
  };
}

export function leadsToCsv(leads: MergedLead[]): string {
  const headers = ["Name","Email","Phone","Total Minutes","% of Session","Sessions","Grade","First Join","Country","Registered"];
  const rows = leads.map((l) => [l.name, l.email, l.phone, l.totalMinutes, l.attendancePct, l.sessions, l.grade, l.firstJoin || "", l.country, l.registration || ""]);
  return Papa.unparse([headers, ...rows]);
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
