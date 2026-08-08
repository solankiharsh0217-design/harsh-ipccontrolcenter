import { useNavigate } from "react-router-dom";
import { PageHead, SectionLabel } from "@/components/ui-bits";
import { useAuth } from "@/context/AuthContext";
import { getAdminSections } from "./admin-center/sections";

const MIGRATED_SLUGS = new Set(["people"]);

export default function AdminCenter() {
  const nav = useNavigate();
  const { isAdmin, hasModule } = useAuth();

  const sections = getAdminSections(isAdmin, hasModule);

  return (
    <div className="max-w-[1060px]">
      <PageHead title="Admin Center" sub="Manage settings, access, team members, audit history, and system controls." />
      
      {sections.length === 0 ? (
        <div className="border border-line rounded-xl bg-card px-[22px] py-8 font-sans text-[13px] text-muted-foreground">
          You don't have access to any modules in this center.
        </div>
      ) : (
        <div className="space-y-10">
          {sections.map((section) => (
            <div key={section.label}>
              <SectionLabel>{section.label}</SectionLabel>
              
              {MIGRATED_SLUGS.has(section.slug) ? (
                <div className="grid grid-cols-3 gap-3.5">
                  <div className="rounded-xl border border-line bg-card pt-[26px] px-[22px] pb-5 flex flex-col">
                    <div className="font-serif text-xl font-medium text-foreground mb-2 leading-tight">{section.label}</div>
                    <div className="font-sans text-xs font-light text-muted-foreground leading-[1.7] mb-5 flex-1">{section.blurb}</div>
                    <button
                      onClick={() => nav(`/admin-center/${section.slug}`)}
                      className="font-sans text-[12px] font-medium text-primary-foreground bg-primary hover:opacity-90 transition-opacity rounded-md px-4 py-2.5 self-start"
                    >
                      Open {section.label} →
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3.5">
                  {section.cards.map((c) => (
                    <div key={c.to} className="rounded-xl border border-line bg-card pt-[26px] px-[22px] pb-5 flex flex-col">
                      <div className="font-serif text-xl font-medium text-foreground mb-2 leading-tight">{c.title}</div>
                      <div className="font-sans text-xs font-light text-muted-foreground leading-[1.7] mb-5 flex-1">{c.desc}</div>
                      <button
                        onClick={() => nav(c.to)}
                        className="font-sans text-[12px] font-medium text-primary-foreground bg-primary hover:opacity-90 transition-opacity rounded-md px-4 py-2.5 self-start"
                      >
                        {c.cta} →
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {isAdmin && (
        <div className="mt-10">
          <SectionLabel>Danger Zone</SectionLabel>
          <div className="rounded-xl border border-danger/30 bg-destructive/10 pt-[26px] px-[22px] pb-5 flex flex-col max-w-[420px]">
            <div className="font-serif text-xl font-medium text-danger mb-2 leading-tight">
              Hard Wipe All Lead Data
            </div>
            <div className="font-sans text-xs font-light text-danger/80 leading-[1.7] mb-5 flex-1">
              Permanently delete all CRM leads, batches, paid pipeline buyers, payments, operations clients, follow-ups, tag assignments, and lead-linked notifications.
            </div>
            <button
              onClick={() => nav("/admin-center/clean-slate")}
              className="font-sans text-[12px] font-medium text-white bg-danger hover:bg-danger/90 transition-colors rounded-md px-4 py-2.5 self-start"
            >
              Open Hard Wipe →
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
