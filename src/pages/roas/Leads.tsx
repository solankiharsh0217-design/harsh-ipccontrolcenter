import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useMemo, useState } from "react";
import Papa from "papaparse";
import { Download, Search } from "lucide-react";
import { rel } from "@/lib/roas/format";

const sb: any = supabase;

export default function RoasLeads() {
  const [search, setSearch] = useState("");
  const [buyer, setBuyer] = useState("all");
  const [dup, setDup] = useState("all");

  const { data: buyers = [] } = useQuery({ queryKey: ["roas_mb"], queryFn: async () => (await sb.from("roas_media_buyers").select("*")).data || [] });
  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["roas_leads"],
    queryFn: async () => (await sb.from("roas_leads").select("*").order("created_at_from_sheet", { ascending: false }).limit(2000)).data || [],
  });

  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim();
    return leads.filter((l: any) => {
      if (buyer !== "all" && l.media_buyer_id !== buyer) return false;
      if (dup !== "all") {
        if (dup === "unique" && l.duplicate_status !== "unique") return false;
        if (dup !== "unique" && l.duplicate_status !== dup) return false;
      }
      if (s) {
        const hay = `${l.lead_name || ""} ${l.clean_phone || ""} ${l.clean_email || ""} ${l.campaign_name || ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [leads, search, buyer, dup]);

  const exportCsv = () => {
    const rows = filtered.map((l: any) => ({
      lead_name: l.lead_name, phone: l.clean_phone, email: l.clean_email,
      media_buyer: buyers.find((b: any) => b.id === l.media_buyer_id)?.name,
      lead_date: l.created_at_from_sheet, webinar_date: l.webinar_date,
      campaign: l.campaign_name, adset: l.adset_name, ad: l.ad_name, duplicate_status: l.duplicate_status,
    }));
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `roas-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <div className="space-y-4 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">ROAS Leads</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} of {leads.length} leads</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv}><Download className="w-4 h-4 mr-1.5" /> Export CSV</Button>
      </div>

      <Card>
        <CardContent className="p-3 flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-2 top-2.5 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search name, phone, email, campaign..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={buyer} onValueChange={setBuyer}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All buyers</SelectItem>
              {buyers.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={dup} onValueChange={setDup}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All duplicate statuses</SelectItem>
              <SelectItem value="unique">Unique only</SelectItem>
              <SelectItem value="Same Buyer Duplicate">Same Buyer Duplicate</SelectItem>
              <SelectItem value="Cross Buyer Duplicate">Cross Buyer Duplicate</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr><Th>Name</Th><Th>Phone</Th><Th>Email</Th><Th>Buyer</Th><Th>Lead Date</Th><Th>Webinar</Th><Th>Campaign</Th><Th>Ad Set</Th><Th>Ad</Th><Th>Duplicate</Th></tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={10} className="text-center py-8 text-muted-foreground">Loading...</td></tr>}
              {!isLoading && filtered.length === 0 && <tr><td colSpan={10} className="text-center py-8 text-muted-foreground">No leads match.</td></tr>}
              {filtered.map((l: any) => {
                const b = buyers.find((x: any) => x.id === l.media_buyer_id);
                return (
                  <tr key={l.id} className="border-t hover:bg-muted/30">
                    <Td>{l.lead_name || <span className="text-muted-foreground">—</span>}</Td>
                    <Td className="font-mono text-xs">{l.clean_phone}</Td>
                    <Td className="text-xs">{l.clean_email}</Td>
                    <Td>{b?.name}</Td>
                    <Td className="text-xs">{l.created_at_from_sheet ? rel(l.created_at_from_sheet) : "—"}</Td>
                    <Td className="text-xs">{l.webinar_date || "—"}</Td>
                    <Td className="text-xs">{l.campaign_name || "—"}</Td>
                    <Td className="text-xs">{l.adset_name || "—"}</Td>
                    <Td className="text-xs">{l.ad_name || "—"}</Td>
                    <Td>
                      {l.duplicate_status === "Cross Buyer Duplicate" && <Badge variant="destructive" className="text-[10px]">Cross</Badge>}
                      {l.duplicate_status === "Same Buyer Duplicate" && <Badge variant="secondary" className="text-[10px]">Same</Badge>}
                      {(!l.duplicate_status || l.duplicate_status === "unique") && <Badge variant="outline" className="text-[10px]">Unique</Badge>}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
const Th = ({ children }: any) => <th className="text-left font-medium px-3 py-2 whitespace-nowrap">{children}</th>;
const Td = ({ children, className = "" }: any) => <td className={`px-3 py-2 ${className}`}>{children}</td>;
