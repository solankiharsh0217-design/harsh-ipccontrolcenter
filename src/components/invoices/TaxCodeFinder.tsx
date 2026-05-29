import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { searchTaxCodes } from "@/lib/invoices/taxCodes";
import type { TaxCode } from "@/lib/invoices/types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSelect: (code: TaxCode) => void;
}

export default function TaxCodeFinder({ open, onOpenChange, onSelect }: Props) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<TaxCode[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (q.trim().length < 3) { setRows([]); return; }
    let cancel = false;
    setLoading(true);
    const t = setTimeout(async () => {
      const r = await searchTaxCodes(q);
      if (!cancel) setRows(r);
      setLoading(false);
    }, 250);
    return () => { cancel = true; clearTimeout(t); };
  }, [q, open]);

  const highlight = (text: string) => {
    if (q.trim().length < 3) return text;
    const re = new RegExp(`(${q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig");
    return text.split(re).map((p, i) => re.test(p) ? <mark key={i} className="bg-yellow-200">{p}</mark> : <span key={i}>{p}</span>);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>Find SAC / HSN code</DialogTitle></DialogHeader>
        <Input autoFocus placeholder="Type 3+ letters — e.g. coaching, advertising, photography" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="max-h-[420px] overflow-y-auto mt-2">
          {q.trim().length < 3 && <div className="text-[12px] text-muted-foreground p-3">Type at least 3 characters to search.</div>}
          {loading && <div className="text-[12px] text-muted-foreground p-3">Searching…</div>}
          {!loading && q.trim().length >= 3 && rows.length === 0 && <div className="text-[12px] text-muted-foreground p-3">No matches found.</div>}
          <table className="w-full text-[12.5px]">
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line/50 hover:bg-off">
                  <td className="py-2 px-2 font-mono w-20">{r.code}</td>
                  <td className="py-2 px-2 w-14 text-[11px]">{r.type}</td>
                  <td className="py-2 px-2">{highlight(r.description)}<div className="text-[10.5px] text-muted-foreground">{r.category}</div></td>
                  <td className="py-2 px-2 text-right w-16">{r.gst_rate_default ?? "—"}%</td>
                  <td className="py-2 px-2 text-right w-20"><Button size="sm" onClick={() => { onSelect(r); onOpenChange(false); }}>Apply</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
