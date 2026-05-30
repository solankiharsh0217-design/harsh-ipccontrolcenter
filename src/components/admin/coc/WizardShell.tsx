import { ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  step: number;
  totalSteps: number;
  stepLabel?: string;
  children: ReactNode;
  footer: ReactNode;
}

export default function WizardShell({ open, onClose, title, step, totalSteps, stepLabel, children, footer }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl bg-white">
        <DialogHeader>
          <DialogTitle className="text-[14px]">{title}</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-1.5 pb-2">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full ${i < step ? "bg-emerald-500" : i === step ? "bg-slate-900" : "bg-slate-200"}`} />
          ))}
        </div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Step {step + 1} of {totalSteps}{stepLabel ? ` — ${stepLabel}` : ""}</div>
        <div className="py-3 min-h-[180px]">{children}</div>
        <div className="flex justify-between items-center pt-2 border-t border-line">{footer}</div>
      </DialogContent>
    </Dialog>
  );
}
