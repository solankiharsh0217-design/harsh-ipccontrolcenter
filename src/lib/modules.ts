export type ModuleKey =
  | "dashboard"
  | "founder-dashboard"
  | "announcements"
  | "roas"
  | "search"
  | "daily-reporting"
  | "reports"
  | "lead-qualifier"
  | "crm"
  | "paid-pipeline"
  | "team"
  | "admin"
  | "master-data"
  | "profit-statement";

export const MODULES: { key: ModuleKey; label: string; group: string }[] = [
  { key: "dashboard", label: "Dashboard", group: "Overview" },
  { key: "announcements", label: "Announcements", group: "Overview" },
  { key: "roas", label: "ROAS Calculator", group: "Tools" },
  { key: "search", label: "Student Search", group: "Tools" },
  { key: "daily-reporting", label: "Daily Lead Reporting", group: "Tools" },
  { key: "reports", label: "Reports & History", group: "Tools" },
  { key: "lead-qualifier", label: "Lead Qualifier", group: "Tools" },
  { key: "crm", label: "Calling CRM", group: "Tools" },
  { key: "paid-pipeline", label: "Paid Pipeline", group: "Tools" },
  { key: "profit-statement", label: "Profit Statement", group: "Tools" },
  { key: "team", label: "Team Directory", group: "People" },
  { key: "admin", label: "Admin Panel", group: "People" },
  { key: "master-data", label: "Master Data", group: "People" },
];
