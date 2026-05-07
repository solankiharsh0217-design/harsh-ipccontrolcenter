import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { useRoasAuth } from "@/lib/roas/auth";
import { toast } from "sonner";
import { inr, num } from "@/lib/roas/format";
import { Trash2 } from "lucide-react";

const sb: any = supabase;

export default function RoasAdSpend() {
  const qc = useQueryClient();
  const { user, canEdit, isAdmin } = useRoasAuth();

  const { data: buyers = [] } = useQuery({ queryKey: ["roas_mb"], queryFn: async () => (await sb.from("roas_media_buyers").select("*")).data || [] });
  const { data: webinars = [] } = useQuery({ queryKey: ["roas_web"], queryFn: async () => (await sb.from("roas_webinars").select("*").order("webinar_start_date", { ascending: false })).data || [] });
  const { data: spends = [] } = useQuery({ queryKey: ["roas_spends"], queryFn: async () => (await sb.from("roas_ad_spends").select("*").order("spend_date", { ascending: false }).limit(500)).data || [] });

  const [form, setForm] = useState({ media_buyer_id: "", webinar_id: "", spend_date: new Date().toISOString().slice(0, 10), spend_amount: "", remarks: "" });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.media_buyer_id || !form.spend_amount) return toast.error("Buyer and amount required");
    const { error } = await sb.from("roas_ad_spends").insert({
      media_buyer_id: form.media_buyer_id,
      webinar_id: form.webinar_id || null,
      webinar_date: webinars.find((w: any) => w.id === form.webinar_id)?.webinar_start_date || null,
      spend_date: form.spend_date,
      spend_amount: Number(form.spend_amount),
      entered_by: user?.id ?? null,
      remarks: form.remarks || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Spend added");
    setForm({ ...form, spend_amount: "", remarks: "" });
    qc.invalidateQueries({ queryKey: ["roas_spends"] });
    qc.invalidateQueries({ queryKey: ["roas_ad_spends-all"] });
  };

  const del = async (id: string) => {
    if (!confirm("Delete this spend entry?")) return;
    const { error } = await sb.from("roas_ad_spends").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["roas_spends"] });
    qc.invalidateQueries({ queryKey: ["roas_ad_spends-all"] });
  };

  const total = spends.reduce((s: number, x: any) => s + Number(x.spend_amount || 0), 0);

  return (
    <div className="space-y-4 max-w-[1200px] mx-auto">
      <div>
        <h1 className="text-2xl font-semibold">Ad Spend</h1>
        <p className="text-sm text-muted-foreground">Total recorded: {inr(total)} across {num(spends.length)} entries</p>
      </div>
      {canEdit && (
        <Card>
          <CardHeader><CardTitle className="text-base">Add Ad Spend</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={submit} className="grid md:grid-cols-5 gap-3 items-end">
              <div>
                <Label>Media Buyer</Label>
                <Select value={form.media_buyer_id} onValueChange={(v) => setForm({ ...form, media_buyer_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{buyers.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Webinar (optional)</Label>
                <Select value={form.webinar_id} onValueChange={(v) => setForm({ ...form, webinar_id: v })}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>{webinars.map((w: any) => <SelectItem key={w.id} value={w.id}>{w.webinar_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Spend Date</Label><Input type="date" value={form.spend_date} onChange={(e) => setForm({ ...form, spend_date: e.target.value })} /></div>
              <div><Label>Amount (₹)</Label><Input type="number" min="0" value={form.spend_amount} onChange={(e) => setForm({ ...form, spend_amount: e.target.value })} /></div>
              <Button type="submit">Add</Button>
              <div className="md:col-span-5"><Label>Remarks</Label><Textarea value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} rows={2} /></div>
            </form>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle className="text-base">Spend history</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr><Th>Date</Th><Th>Buyer</Th><Th>Webinar</Th><Th>Amount</Th><Th>Remarks</Th><Th>{" "}</Th></tr>
            </thead>
            <tbody>
              {spends.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No spends yet.</td></tr>}
              {spends.map((s: any) => {
                const b = buyers.find((x: any) => x.id === s.media_buyer_id);
                const w = webinars.find((x: any) => x.id === s.webinar_id);
                return (
                  <tr key={s.id} className="border-t hover:bg-muted/30">
                    <Td className="text-xs">{s.spend_date}</Td>
                    <Td>{b?.name}</Td>
                    <Td className="text-xs">{w?.webinar_name || "—"}</Td>
                    <Td className="font-medium">{inr(s.spend_amount)}</Td>
                    <Td className="text-xs text-muted-foreground">{s.remarks || "—"}</Td>
                    <Td>{isAdmin && <Button size="sm" variant="ghost" onClick={() => del(s.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>}</Td>
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
