export type ModuleKey =
  | "dashboard"
  | "founder_dashboard"
  | "founder-dashboard"
  | "announcements"
  | "roas"
  | "search"
  | "daily-reporting"
  | "reports"
  | "lead-qualifier"
  | "crm"
  | "calling_crm"
  | "paid-pipeline"
  | "paid_pipeline"
  | "follow_up_command_center"
  | "payment_recovery"
  | "webinar_performance"
  | "team"
  | "admin"
  | "master-data"
  | "master_settings"
  | "audit_log"
  | "notifications"
  | "profit-statement"
  | "media_buyer_operations"
  | "offline_seminar_roas";


// Canonical module key for Founder Dashboard. We keep "founder-dashboard"
// in the ModuleKey union as a backward-compatible alias for any prior grants.
export const FOUNDER_DASHBOARD_KEY: ModuleKey = "founder_dashboard";
export const FOUNDER_DASHBOARD_ALIASES: ModuleKey[] = ["founder_dashboard", "founder-dashboard"];

export const MODULES: { key: ModuleKey; label: string; group: string }[] = [
  { key: "dashboard", label: "Dashboard", group: "Overview" },
  { key: "founder_dashboard", label: "Founder Dashboard", group: "Overview" },
  { key: "announcements", label: "Announcements", group: "Overview" },
  { key: "roas", label: "ROAS Calculator", group: "Tools" },
  { key: "search", label: "Student Search", group: "Tools" },
  { key: "daily-reporting", label: "Daily Lead Reporting", group: "Tools" },
  { key: "reports", label: "Reports & History", group: "Tools" },
  { key: "lead-qualifier", label: "Lead Qualifier", group: "Tools" },
  { key: "calling_crm", label: "Calling CRM", group: "Tools" },
  { key: "paid_pipeline", label: "Paid Pipeline", group: "Tools" },
  { key: "follow_up_command_center", label: "Follow-Up Command Center", group: "Tools" },
  { key: "payment_recovery", label: "Payment Recovery", group: "Tools" },
  { key: "media_buyer_operations", label: "Media Buyer Operations", group: "Tools" },
  { key: "offline_seminar_roas", label: "Offline Seminar ROAS", group: "Tools" },
  { key: "webinar_performance", label: "Webinar Performance", group: "Tools" },
  { key: "profit-statement", label: "Profit Statement", group: "Tools" },
  { key: "team", label: "Team Directory", group: "People" },
  { key: "admin", label: "Admin Panel", group: "People" },
  { key: "master-data", label: "Master Data", group: "People" },
  { key: "master_settings", label: "Master Settings", group: "People" },
  { key: "audit_log", label: "Audit Log", group: "People" },
  { key: "notifications", label: "Notifications", group: "Overview" },
];


