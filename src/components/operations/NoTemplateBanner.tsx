import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { ensureSeedTemplate } from "@/lib/operationsTemplates";

export default function NoTemplateBanner({
  isAdmin,
  onCreated,
  compact = false,
}: {
  isAdmin: boolean;
  onCreated?: () => void;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);

  const handleCreate = async () => {
    setBusy(true);
    try {
      await ensureSeedTemplate();
      toast.success("Default operations process template created");
      onCreated?.();
    } catch (e: any) {
      toast.error(e?.message || "Failed to create default template");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`border border-[#FDE68A] bg-[#FFFBEB] rounded-md ${compact ? "p-2.5" : "p-3"} flex items-start gap-2.5`}>
      <AlertTriangle className="w-4 h-4 text-[#92400E] mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-medium text-[#92400E]">
          No operations process template found.
        </div>
        <div className="text-[11px] text-[#92400E]/80 mt-0.5">
          {isAdmin
            ? "Create the default template to enable intake, readiness checklist, custom fields, and communications."
            : "Operations process template is not configured yet. Please contact admin."}
        </div>
        {isAdmin && (
          <button
            onClick={handleCreate}
            disabled={busy}
            className="ipc-btn ipc-btn-black !text-[11px] !h-7 mt-2"
          >
            {busy ? "Creating…" : "Create Default Template"}
          </button>
        )}
      </div>
    </div>
  );
}
