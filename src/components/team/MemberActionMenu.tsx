import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreVertical, Settings, UserMinus, ShieldOff, RotateCcw, Trash2, Users, Layers } from "lucide-react";

interface Props {
  isAdmin: boolean;
  isDeactivated: boolean;
  onManage: () => void;
  onApplyTemplate?: () => void;
  onDeactivate: () => void;
  onRemoveAccess: () => void;
  onRestore: () => void;
  onDelete: () => void;
  onAssignedLeads?: () => void;
}

export default function MemberActionMenu({ isAdmin, isDeactivated, onManage, onApplyTemplate, onDeactivate, onRemoveAccess, onRestore, onDelete, onAssignedLeads }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const toggle = () => {
    if (open) { setOpen(false); return; }
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const menuH = 220;
    const top = r.bottom + menuH > window.innerHeight ? r.top - menuH - 4 : r.bottom + 4;
    setPos({ top, left: Math.max(8, r.right - 200) });
    setOpen(true);
  };

  const item = (icon: React.ReactNode, label: string, onClick: () => void, danger = false) => (
    <button
      onClick={() => { setOpen(false); onClick(); }}
      className={`w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] font-sans hover:bg-off ${danger ? "text-red-700" : "text-black"}`}
    >
      {icon}{label}
    </button>
  );

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        className="absolute top-2 right-2 h-7 w-7 rounded-md border border-line bg-white hover:bg-off flex items-center justify-center text-muted-foreground hover:text-black"
        title="More actions"
        aria-label="More actions"
      >
        <MoreVertical className="w-3.5 h-3.5" />
      </button>
      {open && pos && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[9999] w-[200px] rounded-md border border-line bg-white shadow-lg py-1"
          style={{ top: pos.top, left: pos.left }}
        >
          {item(<Settings className="w-3.5 h-3.5" />, "Manage Member", onManage)}
          {isAdmin && onAssignedLeads && item(<Users className="w-3.5 h-3.5" />, "Assigned CRM Leads", onAssignedLeads)}
          {isAdmin && !isDeactivated && item(<UserMinus className="w-3.5 h-3.5" />, "Deactivate Member", onDeactivate)}
          {isAdmin && !isDeactivated && item(<ShieldOff className="w-3.5 h-3.5" />, "Remove Access", onRemoveAccess)}
          {isAdmin && isDeactivated && item(<RotateCcw className="w-3.5 h-3.5" />, "Restore Member", onRestore)}
          {isAdmin && (
            <>
              <div className="my-1 border-t border-line" />
              {item(<Trash2 className="w-3.5 h-3.5" />, "Delete Member", onDelete, true)}
            </>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
