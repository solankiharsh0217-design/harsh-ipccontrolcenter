import { ReactNode } from "react";
import { Link } from "react-router-dom";

export const PageHead = ({ title, sub, back }: { title: string; sub?: string; back?: boolean }) => (
  <>
    {back && (
      <Link to="/" className="inline-flex items-center gap-1.5 font-sans text-xs text-muted-foreground hover:text-black transition-colors mb-7">
        ← Back to dashboard
      </Link>
    )}
    <div className="mb-8">
      <h1 className="font-serif text-[32px] font-normal text-black leading-[1.1] mb-1.5">{title}</h1>
      {sub && <p className="font-sans text-[13px] font-light text-muted-foreground">{sub}</p>}
    </div>
  </>
);

export const SectionLabel = ({ children }: { children: ReactNode }) => (
  <div className="section-divider">{children}</div>
);

export const Tag = ({ type, children }: { type: "info"|"update"|"urgent"; children: ReactNode }) => {
  const cls = {
    urgent: "bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]",
    update: "bg-gold-pale text-gold-deep border-gold-mid",
    info:   "bg-off text-muted-foreground border-line",
  }[type];
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-[4px] font-sans text-[9px] font-medium tracking-[0.1em] uppercase border ${cls}`}>
      {children}
    </span>
  );
};
