import { useNavigate } from "react-router-dom";
import { PageHead, SectionLabel } from "@/components/ui-bits";
import { useAuth } from "@/context/AuthContext";

interface HubCard {
  title: string;
  desc: string;
  cta: string;
  to: string;
  show: boolean;
}

export default function RevenueCommandCenter() {
  const nav = useNavigate();
  const { isAdmin, hasModule } = useAuth();

  const cards: HubCard[] = [
    {
      title: "Paid Pipeline",
      desc: "Track token buyers, final sales, finance status, and payment progress.",
      cta: "Open Paid Pipeline",
      to: "/paid-pipeline",
      show: isAdmin || hasModule("paid_pipeline") || hasModule("paid-pipeline"),
    },
    {
      title: "Follow-Up Command Center",
      desc: "Track due, overdue, missed, and urgent follow-ups across paid leads and CRM.",
      cta: "Open Follow-Up Command Center",
      to: "/follow-up-command-center",
      show: isAdmin || hasModule("follow_up_command_center"),
    },
    {
      title: "Payment Recovery",
      desc: "Recover pending balances, high-value payments, finance delays, and dropped-risk revenue.",
      cta: "Open Payment Recovery",
      to: "/payment-recovery",
      show: isAdmin || hasModule("payment_recovery"),
    },
    {
      title: "Media Buyer Operations Desk",
      desc: "Assign students to media buyers, track calls, collect ad access, launch ads, pause/resume service days, and monitor media buyer execution.",
      cta: "Open Media Buyer Desk",
      to: "/media-buyer-operations",
      show: isAdmin || hasModule("media_buyer_operations"),
    },
  ];

  const visible = cards.filter((c) => c.show);

  return (
    <div className="max-w-[1060px]">
      <PageHead title="Revenue Command Center" sub="Manage paid leads, follow-ups, and payment recovery from one place." />
      <SectionLabel>Modules</SectionLabel>
      {visible.length === 0 ? (
        <div className="border border-line rounded-xl bg-white px-[22px] py-8 font-sans text-[13px] text-muted-foreground">
          You don't have access to any modules in this center.
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3.5">
          {visible.map((c) => (
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
