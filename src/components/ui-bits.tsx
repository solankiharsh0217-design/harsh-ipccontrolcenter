import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";

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

export const LoadingState = ({ label = "Loading…", size = "sm", block = false, className = "" }: { label?: string; size?: "sm" | "md"; block?: boolean; className?: string }) => (
  <div role="status" aria-live="polite" className={`flex items-center gap-2 font-sans text-muted-foreground ${block ? "justify-center py-12 text-sm" : "text-[12px]"} ${className}`}>
    <Loader2 aria-hidden="true" className={`${size === "md" ? "w-5 h-5" : "w-4 h-4"} animate-spin shrink-0`} />
    <span>{label}</span>
  </div>
);

export const LoadingRow = ({ colSpan, label = "Loading…" }: { colSpan: number; label?: string }) => (
  <tr>
    <td colSpan={colSpan} className="px-3 py-8">
      <div role="status" aria-live="polite" className="flex items-center justify-center gap-2 font-sans text-sm text-muted-foreground">
        <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin shrink-0" />
        <span>{label}</span>
      </div>
    </td>
  </tr>
);

export const EmptyState = ({ title, hint, bordered = false, center = false, className = "" }: { title: string; hint?: string; bordered?: boolean; center?: boolean; className?: string }) => (  <div className={`font-sans text-muted-foreground ${bordered ? "border border-dashed border-line rounded-lg py-12 px-4 text-center text-sm" : `text-[12px] py-6 ${center ? "text-center" : ""}`} ${className}`}>    <div>{title}</div>    {hint && <div className="text-[12px] opacity-80 mt-1">{hint}</div>}  </div>);export const EmptyRow = ({ colSpan, title, hint }: { colSpan: number; title: string; hint?: string }) => (  <tr>    <td colSpan={colSpan} className="px-3 py-8">      <div className="text-center font-sans text-sm text-muted-foreground">        <div>{title}</div>        {hint && <div className="text-[12px] opacity-80 mt-1">{hint}</div>}      </div>    </td>  </tr>);
