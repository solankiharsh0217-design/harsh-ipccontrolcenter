export interface Pipeline {
  id: string; name: string; type: "unpaid" | "paid" | "custom"; position: number;
}
export interface Stage {
  id: string; pipeline_id: string; name: string; color: string; position: number;
  is_protected: boolean; is_won: boolean; is_lost: boolean;
}
export type LeadGrade = "hot" | "warm" | "cold" | "non-attendee" | "super-hot" | "very-cold" | "true-absentee";
export interface Lead {
  id: string; full_name: string | null; email: string | null; phone: string | null;
  country: string | null; score: number; grade: LeadGrade;
  webinar_source: string | null; webinar_date: string | null; webinar_name: string | null;
  pipeline_id: string | null; stage_id: string | null; assigned_agent_id: string | null;
  deal_value: number; program_name: string; lead_type: "paid" | "unpaid";
  total_minutes: number; attendance_pct: number; sessions_count: number;
  first_join_time: string | null; is_super_hot: boolean; webinar_count: number;
  created_at: string; updated_at: string; sort_order?: number;
  paid_pipeline_lead_id?: string | null;
  code_of_conduct_status?: string | null;
  code_of_conduct_request_id?: string | null;
  code_of_conduct_sent_at?: string | null;
  code_of_conduct_signed_at?: string | null;
}
export interface ActivityLog {
  id: string; lead_id: string; agent_id: string | null; agent_name: string | null;
  channel: "call"|"whatsapp"|"email"|"sms"|"note"|"system"; note: string; logged_at: string;
}
export interface Reminder {
  id: string; lead_id: string; agent_id: string | null;
  reminder_date: string; reminder_time: string | null;
  channel: "call"|"whatsapp"|"email"|"sms"|"note"|"system";
  note: string | null; is_completed: boolean;
}

export const STAGE_COLORS: Record<string, string> = {
  purple: "#7C3AED", gray: "#888888", blue: "#2563EB", gold: "#C8A84B",
  amber: "#CA8A04", green: "#16A34A", red: "#DC2626", pink: "#BE185D",
};

export const STAGE_COLOR_OPTIONS: { key: string; hex: string }[] = [
  { key: "purple", hex: "#7C3AED" },
  { key: "blue",   hex: "#2563EB" },
  { key: "gold",   hex: "#C8A84B" },
  { key: "amber",  hex: "#CA8A04" },
  { key: "green",  hex: "#16A34A" },
  { key: "red",    hex: "#DC2626" },
  { key: "pink",   hex: "#BE185D" },
  { key: "gray",   hex: "#888888" },
];

export const DEFAULT_PIPELINE_TEMPLATES: Record<"unpaid"|"paid"|"custom", { name: string; color: string; is_won?: boolean; is_lost?: boolean; is_protected?: boolean }[]> = {
  unpaid: [
    { name: "New", color: "purple" },
    { name: "Attempted", color: "gray" },
    { name: "Connected", color: "blue" },
    { name: "Interested", color: "gold" },
    { name: "Follow-up Scheduled", color: "amber" },
    { name: "Proposal Sent", color: "amber" },
    { name: "Closed Won", color: "green", is_won: true, is_protected: true },
    { name: "Closed Lost", color: "red", is_lost: true, is_protected: true },
    { name: "Not Reachable", color: "gray" },
  ],
  paid: [
    { name: "Payment Confirmed", color: "green" },
    { name: "Welcome Call Done", color: "blue" },
    { name: "Onboarding Call Done", color: "blue" },
    { name: "Documents Requested", color: "amber" },
    { name: "Documents Received", color: "amber" },
    { name: "Bajaj Finance Submitted", color: "purple" },
    { name: "Finance Approved", color: "green" },
    { name: "Code of Conduct Signed", color: "gold" },
    { name: "Access Given", color: "green", is_protected: true },
    { name: "Active Member", color: "green", is_won: true, is_protected: true },
  ],
  custom: [
    { name: "New", color: "purple" },
    { name: "In Progress", color: "blue" },
    { name: "Closed Won", color: "green", is_won: true, is_protected: true },
    { name: "Closed Lost", color: "red", is_lost: true, is_protected: true },
  ],
};

export async function ensurePipelineExists(
  supabase: any,
  type: "unpaid" | "paid" | "custom",
  fallbackName?: string,
): Promise<{ pipelineId: string; firstStageId: string | null }> {
  const { data: existing } = await supabase.from("pipelines").select("id").eq("type", type).order("position").limit(1);
  let pipelineId: string | null = existing?.[0]?.id ?? null;

  if (!pipelineId) {
    const { data: countRows } = await supabase.from("pipelines").select("id");
    const pos = (countRows?.length ?? 0);
    const name = fallbackName || (type === "unpaid" ? "Sales Pipeline (Unpaid)" : type === "paid" ? "Paid — Onboarding" : "Custom Pipeline");
    const { data: ins, error } = await supabase.from("pipelines").insert({ name, type, position: pos }).select("id").maybeSingle();
    if (error || !ins) throw new Error(error?.message || "Could not create pipeline");
    pipelineId = ins.id;
    const tmpl = DEFAULT_PIPELINE_TEMPLATES[type];
    await supabase.from("stages").insert(tmpl.map((s, i) => ({
      pipeline_id: pipelineId, name: s.name, color: s.color, position: i,
      is_won: !!s.is_won, is_lost: !!s.is_lost, is_protected: !!s.is_protected,
    })));
  }

  const { data: st } = await supabase.from("stages").select("id, position").eq("pipeline_id", pipelineId).order("position").limit(1);
  return { pipelineId: pipelineId!, firstStageId: st?.[0]?.id ?? null };
}

export const GRADE_STYLES: Record<LeadGrade, { bg: string; fg: string; border: string; label: string }> = {
  "hot":          { bg: "#FEF2F2", fg: "#DC2626", border: "#FECACA", label: "Hot" },
  "warm":         { bg: "#FFFBEB", fg: "#CA8A04", border: "#FDE68A", label: "Warm" },
  "cold":         { bg: "#EFF6FF", fg: "#2563EB", border: "#BFDBFE", label: "Cold" },
  "non-attendee": { bg: "#F7F6F3", fg: "#888888", border: "#E8E5DE", label: "No Show" },
  "very-cold":    { bg: "#F7F6F3", fg: "#888888", border: "#E8E5DE", label: "Very Cold" },
  "super-hot":    { bg: "#FDF2F8", fg: "#BE185D", border: "#FBCFE8", label: "★ Super Hot" },
  "true-absentee":{ bg: "#FFF7ED", fg: "#C2410C", border: "#FED7AA", label: "True Absentee" },
};
