import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { useRoasAuth } from "@/lib/roas/auth";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { inr } from "@/lib/roas/format";

const sb: any = supabase;

export default function RoasWebinars() {
  const qc = useQueryClient();
  const { isAdmin } = useRoasAuth();
  const [editing, setEditing] = useState<any | null>(null);
  const { data: webinars = [] } = useQuery({ queryKey: ["roas_web"], queryFn: async () => (await sb.from("roas_webinars").select("*").order("webinar_start_date", { ascending: false })).data || [] });
  if (!isAdmin) return <div className="text-sm text-muted-foreground">Admin only.</div>;

  const del = async (id: string) => {
    if (!confirm("Delete this webinar?")) return;
    const { error } = await sb.from("roas_webinars").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["roas_web"] });
  };

  return (
    <div className="space-y-4 max-w-[1100px] mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Webinars</h1>
          <p className="text-sm text-muted-foreground">Manage webinar offers, dates, and pricing.</p>
        </div>
        <Button onClick={() => setEditing({})}>+ Add webinar</Button>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        {webinars.map((w: any) => (
          <Card key={w.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{w.webinar_name}</CardTitle>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(w)}><Pencil className="w-4 h-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => del(w.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Status</span><Badge variant="outline">{w.status}</Badge></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Day 1</span><span>{w.webinar_start_date || "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Day 2</span><span>{w.webinar_end_date || "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Price</span><span>{inr(w.program_price)} + {w.gst_rate}% GST</span></div>
              {w.offer_name && <div className="flex justify-between"><span className="text-muted-foreground">Offer</span><span>{w.offer_name}</span></div>}
            </CardContent>
          </Card>
        ))}
      </div>
      {editing && <WebinarDialog webinar={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["roas_web"] }); }} />}
    </div>
  );
}

function WebinarDialog({ webinar, onClose, onSaved }: any) {
  const [form, setForm] = useState({
    webinar_name: webinar.webinar_name || "",
    webinar_start_date: webinar.webinar_start_date || "",
    webinar_end_date: webinar.webinar_end_date || "",
    landing_page_url: webinar.landing_page_url || "",
    offer_name: webinar.offer_name || "",
    program_price: webinar.program_price ?? 100000,
    gst_rate: webinar.gst_rate ?? 18,
    status: webinar.status || "Upcoming",
  });
  const save = async () => {
    if (!form.webinar_name) return toast.error("Name required");
    const payload: any = {
      ...form,
      program_price: Number(form.program_price), gst_rate: Number(form.gst_rate),
      webinar_start_date: form.webinar_start_date || null, webinar_end_date: form.webinar_end_date || null,
    };
    const { error } = webinar.id
      ? await sb.from("roas_webinars").update(payload).eq("id", webinar.id)
      : await sb.from("roas_webinars").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Saved"); onSaved();
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>{webinar.id ? "Edit" : "Add"} webinar</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name</Label><Input value={form.webinar_name} onChange={(e) => setForm({ ...form, webinar_name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Day 1</Label><Input type="date" value={form.webinar_start_date} onChange={(e) => setForm({ ...form, webinar_start_date: e.target.value })} /></div>
            <div><Label>Day 2</Label><Input type="date" value={form.webinar_end_date} onChange={(e) => setForm({ ...form, webinar_end_date: e.target.value })} /></div>
          </div>
          <div><Label>Landing page URL</Label><Input value={form.landing_page_url} onChange={(e) => setForm({ ...form, landing_page_url: e.target.value })} /></div>
          <div><Label>Offer name</Label><Input value={form.offer_name} onChange={(e) => setForm({ ...form, offer_name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Program price (₹)</Label><Input type="number" value={form.program_price} onChange={(e) => setForm({ ...form, program_price: e.target.value as any })} /></div>
            <div><Label>GST rate (%)</Label><Input type="number" value={form.gst_rate} onChange={(e) => setForm({ ...form, gst_rate: e.target.value as any })} /></div>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{["Upcoming", "Live", "Completed", "Archived"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
