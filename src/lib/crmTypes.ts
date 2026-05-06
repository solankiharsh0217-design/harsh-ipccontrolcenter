export interface Pipeline {
  id: string; name: string; type: "unpaid" | "paid" | "custom"; position: number;
}
export interface Stage {
  id: string; pipeline_id: string; name: string; color: string; position: number;
  is_protected: boolean; is_won: boolean; is_lost: boolean;
}
export type LeadGrade = "hot" | "warm" | "cold" | "non-attendee" | "super-hot" | "very-cold";
export interface Lead {
  id: string; full_name: string | null; email: string | null; phone: string | null;
  country: string | null; score: number; grade: LeadGrade;
  webinar_source: string | null; webinar_date: string | null; webinar_name: string | null;
  pipeline_id: string | null; stage_id: string | null; assigned_agent_id: string | null;
  deal_value: number; program_name: string; lead_type: "paid" | "unpaid";
  total_minutes: number; attendance_pct: number; sessions_count: number;
  first_join_time: string | null; is_super_hot: boolean; webinar_count: number;
  created_at: string; updated_at: string;
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

export const GRADE_STYLES: Record<LeadGrade, { bg: string; fg: string; border: string; label: string }> = {
  "hot":          { bg: "#FEF2F2", fg: "#DC2626", border: "#FECACA", label: "Hot" },
  "warm":         { bg: "#FFFBEB", fg: "#CA8A04", border: "#FDE68A", label: "Warm" },
  "cold":         { bg: "#EFF6FF", fg: "#2563EB", border: "#BFDBFE", label: "Cold" },
  "non-attendee": { bg: "#F7F6F3", fg: "#888888", border: "#E8E5DE", label: "No Show" },
  "very-cold":    { bg: "#F7F6F3", fg: "#888888", border: "#E8E5DE", label: "Very Cold" },
  "super-hot":    { bg: "#FDF2F8", fg: "#BE185D", border: "#FBCFE8", label: "★ Super Hot" },
};
