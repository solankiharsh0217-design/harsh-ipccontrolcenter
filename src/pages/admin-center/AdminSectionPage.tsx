import { useNavigate } from "react-router-dom";
import { PageHead, SectionLabel } from "@/components/ui-bits";
import { useAuth } from "@/context/AuthContext";
import { getAdminSections } from "./sections";
import { ArrowLeft } from "lucide-react";

interface AdminSectionPageProps {
  slug: string;
}

export default function AdminSectionPage({ slug }: AdminSectionPageProps) {
  const nav = useNavigate();
  const { isAdmin, hasModule } = useAuth();
  
  const sections = getAdminSections(isAdmin, hasModule);
  const section = sections.find(s => s.slug === slug);

  if (!section || section.cards.length === 0) {
    return (
      <div className="max-w-[1060px]">
        <button 
          onClick={() => nav("/admin-center")}
          className="flex items-center text-[13px] text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          Back to Admin Center
        </button>
        <div className="border border-line rounded-xl bg-card px-[22px] py-8 font-sans text-[13px] text-muted-foreground">
          You don't have access to any modules in this center.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1060px]">
      <button 
        onClick={() => nav("/admin-center")}
        className="flex items-center text-[13px] text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4 mr-1.5" />
        Back to Admin Center
      </button>

      <PageHead title={section.label} sub={section.blurb} />
      
      <div className="space-y-10">
        <div>
          <SectionLabel>{section.label}</SectionLabel>
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
        </div>
      </div>
    </div>
  );
}
