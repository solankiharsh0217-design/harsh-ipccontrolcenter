import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { searchPaidClients } from "@/lib/invoices/api";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSelect: (paidLeadId: string) => void;
}

export default function PaidClientSelector({ open, onOpenChange, onSelect }: Props) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancel = false;
    setLoading(true);
    const t = setTimeout(async () => {
      const r = await searchPaidClients(q);
      if (!cancel) setRows(r);
      setLoading(false);
    }, 200);
    return () => { cancel = true; clearTimeout(t); };
  }, [q, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>Select paid client / lead</DialogTitle></DialogHeader>
        <Input autoFocus placeholder="Search by name, email, phone, program" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="max-h-[420px] overflow-y-auto mt-2 text-[12.5px]">
          {loading && <div className="text-muted-foreground p-3">Loading…</div>}
          {!loading && rows.length === 0 && <div className="text-muted-foreground p-3">No paid clients found.</div>}
          {!loading && rows.map((r) => (
            <button key={r.id} onClick={() => { onSelect(r.id); onOpenChange(false); }} className="w-full text-left px-3 py-2 border-b border-line/50 hover:bg-off">
              <div className="font-medium">{r.name || "—"}</div>
              <div className="text-[11px] text-muted-foreground">
                {r.email || "—"} · {r.phone || "—"} · {r.product_name_snapshot || r.paid_batch_name || "—"}
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
