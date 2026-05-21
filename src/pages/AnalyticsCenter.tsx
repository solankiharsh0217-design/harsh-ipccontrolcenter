import { useNavigate } from "react-router-dom";
import { PageHead, SectionLabel } from "@/components/ui-bits";
import { useAuth } from "@/context/AuthContext";

export default function AnalyticsCenter() {
  const nav = useNavigate();
  const { isAdmin, hasModule } = useAuth();

  const cards = [
    {
      title: "Founder Dashboard",
      desc: "Top-level business KPIs, red flags, and founder-level insights.",
      cta: "Open Founder Dashboard",
      to: "/founder-dashboard",
      show: isAdmin || hasModule("founder_dashboard") || hasModule("founder-dashboard"),
    },
    {
      title: "Webinar Performance",
      desc: "Webinar attendance, conversion, and media buyer performance.",
      cta: "Open Webinar Performance",
      to: "/webinar-performance",
      show: isAdmin || hasModule("webinar_performance"),
    },
    {
      title: "AI Insights",
      desc: "AI-generated business diagnosis and recommended actions.",
      cta: "Open AI Insights",
      to: "/ai-insights",
      show: isAdmin,
    },
    {
      title: "Profit Statement",
      desc: "Revenue, costs, and profit overview across the business.",
      cta: "Open Profit Statement",
      to: "/profit-statement",
      show: isAdmin || hasModule("profit-statement"),
    },
    {
      title: "Media Buyer Comparison",
      desc: "Compare media buyers by spend, leads, CPL, attributed sales, and revenue quality.",
      cta: "Open Comparison",
      to: "/report-history/media-buyer-comparison",
      show: isAdmin || hasModule("reports"),
    },
  ].filter((c) => c.show);

  return (
    <div className="max-w-[1060px]">
      <PageHead title="Analytics Center" sub="View business performance, webinar performance, founder insights, and AI business diagnosis." />
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
    </div>
  );
}
