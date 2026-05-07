import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useMemo, useState } from "react";
import Papa from "papaparse";
import { Download, Search } from "lucide-react";
import { inr } from "@/lib/roas/format";
import { useRoasAuth } from "@/lib/roas/auth";
import { ManualOverrideDialog } from "@/components/roas/ManualOverrideDialog";

const sb: any = supabase;

export default function RoasEnrollments() {
  const qc = useQueryClient();
  const { canEdit } = useRoasAuth();
  const [search, setSearch] = useState("");
  const [buyer, setBuyer] = useState("all");
  const [status, setStatus] = useState("all");
  const [pay, setPay] = useState("all");
  const [editing, setEditing] = useState<any | null>(null);

  const { data: buyers = [] } = useQuery({ queryKey: ["roas_mb"], queryFn: async () => (await sb.from("roas_media_buyers").select("*")).data || [] });
  const { data: enrollments = [], isLoading } = useQuery({
    queryKey: ["roas_enrollments-table"],
    queryFn: async () => (await sb.from("roas_enrollments").select("*").order("payment_date", { ascending: false }).limit(2000)).data || [],
  });

  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim();
    return enrollments.filter((e: any) => {
      if (buyer !== "all" && e.attributed_media_buyer_id !== buyer) return false;
      if (status !== "all" && e.attribution_status !== status) return false;
      if (pay !== "all" && (e.payment_status || "").toLowerCase() !== pay) return false;
      if (s) {
        const hay = `${e.buyer_name || ""} ${e.clean_phone || ""} ${e.clean_email || ""} ${e.transaction_id || ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [enrollments, search, buyer, status, pay]);

  const exportCsv = () => {
    const rows = filtered.map((e: any) => ({
      buyer_name: e.buyer_name, phone: e.clean_phone, email: e.clean_email,
      amount_paid: e.amount_paid, net_revenue: e.net_revenue, total_invoice_value: e.total_invoice_value,
      payment_date: e.payment_date, payment_status: e.payment_status,
      attributed_buyer: buyers.find((b: any) => b.id === e.attributed_media_buyer_id)?.name,
      attribution_status: e.attribution_status, attribution_method: e.attribution_method,
    }));
    const csv = Papa.unparse(rows);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `roas-enrollments-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <div className="space-y-4 max-w-[1500px] mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">ROAS Enrollments</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} of {enrollments.length} enrollments</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv}><Download className="w-4 h-4 mr-1.5" /> Export CSV</Button>
      </div>

      <Card>
        <CardContent className="p-3 flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-2 top-2.5 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search name, phone, email, txn id..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={buyer} onValueChange={setBuyer}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All buyers</SelectItem>
              {buyers.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All attribution</SelectItem>
              <SelectItem value="Attributed">Attributed</SelectItem>
              <SelectItem value="Manual Review">Manual Review</SelectItem>
              <SelectItem value="Duplicate Conflict">Duplicate Conflict</SelectItem>
              <SelectItem value="Unattributed">Unattributed</SelectItem>
              <SelectItem value="Organic">Organic</SelectItem>
              <SelectItem value="Refunded">Refunded</SelectItem>
            </SelectContent>
          </Select>
          <Select value={pay} onValueChange={setPay}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All payments</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="refunded">Refunded</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr><Th>Buyer</Th><Th>Phone</Th><Th>Amount</Th><Th>Net Rev</Th><Th>Payment Date</Th><Th>Status</Th><Th>Attributed</Th><Th>Attribution</Th><Th>Method</Th>{canEdit && <Th>Action</Th>}</tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={canEdit ? 10 : 9} className="text-center py-8 text-muted-foreground">Loading...</td></tr>}
              {!isLoading && filtered.length === 0 && <tr><td colSpan={canEdit ? 10 : 9} className="text-center py-8 text-muted-foreground">No enrollments.</td></tr>}
              {filtered.map((e: any) => {
                const b = buyers.find((x: any) => x.id === e.attributed_media_buyer_id);
                return (
                  <tr key={e.id} className="border-t hover:bg-muted/30">
                    <Td>{e.buyer_name || "—"}</Td>
                    <Td className="font-mono text-xs">{e.clean_phone}</Td>
                    <Td>{inr(e.amount_paid)}</Td>
                    <Td>{inr(e.net_revenue)}</Td>
                    <Td className="text-xs">{e.payment_date ? new Date(e.payment_date).toLocaleDateString("en-IN") : "—"}</Td>
                    <Td><Badge variant="outline" className="text-[10px]">{e.payment_status || "—"}</Badge></Td>
                    <Td>{b?.name || <span className="text-muted-foreground">—</span>}{e.manual_override && <span className="ml-1 text-[10px] text-muted-foreground">(manual)</span>}</Td>
                    <Td><Badge variant="outline" className="text-[10px]">{e.attribution_status || "—"}</Badge></Td>
                    <Td className="text-xs">{e.attribution_method || "—"}</Td>
                    {canEdit && <Td><Button variant="ghost" size="sm" onClick={() => setEditing(e)}>Override</Button></Td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {editing && (
        <ManualOverrideDialog
          enrollment={editing} buyers={buyers}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["roas_enrollments-table"] }); qc.invalidateQueries({ queryKey: ["roas_enrollments-all"] }); }}
        />
      )}
    </div>
  );
}
const Th = ({ children }: any) => <th className="text-left font-medium px-3 py-2 whitespace-nowrap">{children}</th>;
const Td = ({ children, className = "" }: any) => <td className={`px-3 py-2 ${className}`}>{children}</td>;
