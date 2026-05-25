import { useNavigate } from "react-router-dom";
import { PageHead, SectionLabel } from "@/components/ui-bits";
import { useAuth } from "@/context/AuthContext";

export default function AdminCenter() {
  const nav = useNavigate();
  const { isAdmin, hasModule } = useAuth();

  const cards = [
    {
      title: "Master Settings",
      desc: "Business profile, products, CRM stages, recovery thresholds, and templates.",
      cta: "Open Master Settings",
      to: "/master-settings",
      show: isAdmin || hasModule("master_settings"),
    },
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
      title: "Audit Log",
      desc: "History of important changes across the Control Center.",
      cta: "Open Audit Log",
      to: "/audit-log",
      show: isAdmin || hasModule("audit_log"),
    },
    {
      title: "Notifications",
      desc: "View and manage in-app notifications and alerts.",
      cta: "Open Notifications",
      to: "/notifications",
      show: isAdmin || hasModule("notifications"),
    },
    {
      title: "System Refinement Checklist",
      desc: "Track QA issues, functional gaps, data accuracy checks, and refinement tasks before finalizing the Business OS.",
      cta: "Open Checklist",
      to: "/admin-center/system-refinement",
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
      title: "Code of Conduct",
      desc: "Configure the Diamond Membership agreement template and track every signing request, status, and signed record.",
      cta: "Open Code of Conduct",
      to: "/admin-center/code-of-conduct",
      show: isAdmin,
    },
    {
      title: "Media Buyer Dashboard Preview",
      desc: "View each media buyer's work dashboard, pending calls, active ad clients, and overdue tasks.",
      cta: "Open Media Buyer Desk",
      to: "/media-buyer-operations",
      show: isAdmin || hasModule("media_buyer_operations"),
    },
  ].filter((c) => c.show);

  return (
    <div className="max-w-[1060px]">
      <PageHead title="Admin Center" sub="Manage settings, access, team members, audit history, and system controls." />
      <SectionLabel>Modules</SectionLabel>
      {cards.length === 0 ? (
        <div className="border border-line rounded-xl bg-white px-[22px] py-8 font-sans text-[13px] text-muted-foreground">
          You don't have access to any modules in this center.
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3.5">
          {cards.map((c) => (
            <div key={c.to} className="rounded-xl border border-line bg-white pt-[26px] px-[22px] pb-5 flex flex-col">
              <div className="font-serif text-xl font-medium text-black mb-2 leading-tight">{c.title}</div>
              <div className="font-sans text-xs font-light text-muted-foreground leading-[1.7] mb-5 flex-1">{c.desc}</div>
              <button
                onClick={() => nav(c.to)}
                className="font-sans text-[12px] font-medium text-white bg-black hover:bg-[#222] transition-colors rounded-md px-4 py-2.5 self-start"
              >
                {c.cta} →
              </button>
            </div>
          ))}
        </div>
      )}

      {isAdmin && (
        <div className="mt-10">
          <SectionLabel>Danger Zone</SectionLabel>
          <div className="rounded-xl border border-red-300 bg-red-50 pt-[26px] px-[22px] pb-5 flex flex-col max-w-[420px]">
            <div className="font-serif text-xl font-medium text-red-900 mb-2 leading-tight">
              Hard Wipe All Lead Data
            </div>
            <div className="font-sans text-xs font-light text-red-900/80 leading-[1.7] mb-5 flex-1">
              Permanently delete all CRM leads, batches, paid pipeline buyers, payments, operations clients, follow-ups, tag assignments, and lead-linked notifications — including active, archived, and soft-deleted records. Team, settings, stages, tags, templates, and rules are preserved.
            </div>
            <button
              onClick={() => nav("/admin-center/clean-slate")}
              className="font-sans text-[12px] font-medium text-white bg-red-600 hover:bg-red-700 transition-colors rounded-md px-4 py-2.5 self-start"
            >
              Open Hard Wipe →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

