import { useAuth } from "@/context/AuthContext";

export type AdminCard = {
  title: string;
  desc: string;
  cta: string;
  to: string;
  show: boolean;
};

export type AdminSection = {
  slug: string;
  label: string;
  blurb: string;
  cards: AdminCard[];
};

export function getAdminSections(isAdmin: boolean, hasModule: (m: string) => boolean): AdminSection[] {
  const sections: AdminSection[] = [
    {
      slug: "people",
      label: "People",
      blurb: "Manage your team directory, access permissions, and media buyer operations.",
      cards: [
        {
          title: "Team Directory",
          desc: "Team members, roles, departments, and contact information.",
          cta: "Open Team Directory",
          to: "/team",
          show: isAdmin || hasModule("team"),
        },
        {
          title: "Admin Panel",
          desc: "Access requests, module access, and admin-level controls.",
          cta: "Open Admin Panel",
          to: "/admin",
          show: isAdmin,
        },
        {
          title: "Access Templates",
          desc: "Reusable module access presets. Apply a template to any team member in one click.",
          cta: "Manage Access Templates",
          to: "/admin-center/access-templates",
          show: isAdmin,
        },
        {
          title: "Assignment Eligibility Setup",
          desc: "Bulk enable or disable lead assignment eligibility for multiple team members at once.",
          cta: "Open Eligibility Setup",
          to: "/admin-center/eligibility",
          show: isAdmin,
        },
        {
          title: "Media Buyer Dashboard Preview",
          desc: "View each media buyer's work dashboard, pending calls, active ad clients, and overdue tasks.",
          cta: "Open Media Buyer Desk",
          to: "/media-buyer-operations",
          show: isAdmin || hasModule("media_buyer_operations"),
        },
      ],
    },
    {
      slug: "business-configuration",
      label: "Business Configuration",
      blurb: "Configure master settings, company details, invoicing, and service catalogs.",
      cards: [
        {
          title: "Master Settings",
          desc: "Business profile, products, CRM stages, recovery thresholds, and templates.",
          cta: "Open Master Settings",
          to: "/master-settings",
          show: isAdmin || hasModule("master_settings"),
        },
        {
          title: "Company Settings",
          desc: "Set legal name, GSTIN, address, bank details, branding (logo/signature/stamp) and email sender used on invoices.",
          cta: "Open Company Settings",
          to: "/admin-center/company-settings",
          show: isAdmin,
        },
        {
          title: "Invoice Settings",
          desc: "Configure invoice numbering, default GST rates, tax mode, HSN/SAC and standard invoice text.",
          cta: "Open Invoice Settings",
          to: "/admin-center/invoice-settings",
          show: isAdmin,
        },
        {
          title: "Invoice Item Catalog",
          desc: "Manage reusable invoice items, categories, default rates, HSN/SAC, and tax status.",
          cta: "Open Item Catalog",
          to: "/admin-center/item-catalog",
          show: isAdmin,
        },
        {
          title: "Offer Catalog",
          desc: "Manage promised services, bonuses, and offer presets.",
          cta: "Open Offer Catalog",
          to: "/admin-center/offer-catalog",
          show: isAdmin,
        },
        {
          title: "Service Packages / Tiers",
          desc: "Define the service tiers (Normal, Specialized, Premium…) you can attach during paid lead import. Carries from Calling CRM → Paid Pipeline → Operations.",
          cta: "Open Service Packages",
          to: "/admin-center/service-packages",
          show: isAdmin,
        },
        {
          title: "Lead Conversion Rules",
          desc: "Configure which CRM stages trigger Send to Paid Onboarding, default destination, owner policy, and follow-up handling.",
          cta: "Open Conversion Rules",
          to: "/admin-center/conversion-rules",
          show: isAdmin,
        },
        {
          title: "SAC / HSN Master",
          desc: "Curate the SAC/HSN code list used by the invoice editor's tax-code finder.",
          cta: "Open SAC/HSN Master",
          to: "/admin-center/tax-codes",
          show: isAdmin,
        },
      ],
    },
    {
      slug: "communication",
      label: "Communication",
      blurb: "Manage system notifications and membership agreements.",
      cards: [
        {
          title: "Notifications",
          desc: "View and manage in-app notifications and alerts.",
          cta: "Open Notifications",
          to: "/notifications",
          show: isAdmin || hasModule("notifications"),
        },
        {
          title: "Code of Conduct",
          desc: "Configure the Diamond Membership agreement template and track every signing request, status, and signed record.",
          cta: "Open Code of Conduct",
          to: "/admin-center/code-of-conduct",
          show: isAdmin,
        },
      ],
    },
    {
      slug: "performance",
      label: "Performance",
      blurb: "Track team productivity, manage KPIs, reviews, and reward systems.",
      cards: [
        {
          title: "Team Performance Dashboard",
          desc: "Executive view of team productivity: attendance, KPI completion, scores, pending reviews, reward liability, and people needing attention — all in one place.",
          cta: "Open Team Performance Dashboard",
          to: "/team-performance",
          show: isAdmin,
        },
        {
          title: "Team Performance OS",
          desc: "Set-and-forget KPIs. Manage the KPI library, role-based templates, and assign KPIs to team members.",
          cta: "Open Team Performance",
          to: "/team-performance/admin",
          show: isAdmin,
        },
        {
          title: "KPI Review & Scorecard",
          desc: "Review submitted KPI proofs, approve or reject with notes, mark overdue KPIs missed, and inspect daily/weekly/monthly scorecards per team member.",
          cta: "Open KPI Review",
          to: "/team-performance/review",
          show: isAdmin,
        },
        {
          title: "KPI Rewards",
          desc: "Configure reward rules, generate reward earnings from approved KPI performance, and track approvals and payouts.",
          cta: "Open KPI Rewards",
          to: "/team-performance/rewards",
          show: isAdmin,
        },
        {
          title: "KRA & KPI Settings",
          desc: "Create KRAs, add KPIs with target, direction, unit, cadence, weight and their share of the 1,000 points, plus the AI-check toggle.",
          cta: "Open KRA & KPI Settings",
          to: "/admin-center/kra-kpi-settings",
          show: isAdmin || hasModule("kra_kpi_settings"),
        },
        {
          title: "Graded Review Queue",
          desc: "Grade submitted KPIs green, yellow or red against attainment, with the evidence in view.",
          cta: "Open Review Queue",
          to: "/admin-center/kpi-review-queue",
          show: isAdmin || hasModule("kpi_review_queue"),
        },
        {
          title: "Points Rules",
          desc: "What each action is worth, and the switch that starts applying penalties. A rule set to 0 is off.",
          cta: "Open Points Rules",
          to: "/admin-center/point-rules",
          show: isAdmin || hasModule("points_rules"),
        },
        {
          title: "Appraisal Bands",
          desc: "The words attached to a score out of 1,000 — where each band begins and what it means.",
          cta: "Open Appraisal Bands",
          to: "/admin-center/appraisal-bands",
          show: isAdmin || hasModule("appraisal_bands"),
        },
        {
          title: "Recognition",
          desc: "Recognise a person with a written reason. Adds five points, once.",
          cta: "Open Recognition",
          to: "/admin-center/recognition",
          show: isAdmin || hasModule("recognition"),
        },
      ],

    },
    {
      slug: "resources-system",
      label: "Resources & System",
      blurb: "Access the resource library, audit logs, and system refinement tools.",
      cards: [
        {
          title: "IPC Resource Library",
          desc: "Upload, organize, and share team resources, files, templates, links, and assets.",
          cta: "Manage Resource Library",
          to: "/admin-center/resource-library",
          show: isAdmin,
        },
        {
          title: "Audit Log",
          desc: "History of important changes across the Control Center.",
          cta: "Open Audit Log",
          to: "/audit-log",
          show: isAdmin || hasModule("audit_log"),
        },
        {
          title: "Lead Rescue Search",
          desc: "Find any lead — including converted, hidden, archived, or unlinked — across CRM and Paid Pipeline.",
          cta: "Open Lead Rescue",
          to: "/admin-center/lead-rescue",
          show: isAdmin,
        },
        {
          title: "System Refinement Checklist",
          desc: "Track QA issues, functional gaps, data accuracy checks, and refinement tasks before finalizing the Business OS.",
          cta: "Open Checklist",
          to: "/admin-center/system-refinement",
          show: isAdmin,
        },
      ],
    },
  ];

  return sections
    .map(s => ({
      ...s,
      cards: s.cards.filter(c => c.show)
    }))
    .filter(s => s.cards.length > 0);
}
