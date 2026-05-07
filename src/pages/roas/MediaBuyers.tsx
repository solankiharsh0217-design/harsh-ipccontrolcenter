import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState } from "react";
import { useRoasAuth } from "@/lib/roas/auth";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";

const sb: any = supabase;

export default function RoasMediaBuyers() {
  const qc = useQueryClient();
  const { isAdmin } = useRoasAuth();
  const [editing, setEditing] = useState<any | null>(null);

  const { data: buyers = [] } = useQuery({ queryKey: ["roas_mb_setup"], queryFn: async () => (await sb.from("roas_media_buyers").select("*").order("name")).data || [] });

  if (!isAdmin) return <div className="text-sm text-muted-foreground">Admin only.</div>;

  const del = async (id: string) => {
    if (!confirm("Delete this media buyer?")) return;
    const { error } = await sb.from("roas_media_buyers").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["roas_mb_setup"] });
  };

  return (
    <div className="space-y-4 max-w-[900px] mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Media Buyers</h1>
          <p className="text-sm text-muted-foreground">Configure media buyer profiles for ROAS attribution.</p>
        </div>
        <Button onClick={() => setEditing({})}>+ Add buyer</Button>
      </div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="text-left px-3 py-2">Name</th><th className="text-left px-3 py-2">Email</th><th className="text-left px-3 py-2">Status</th><th></th></tr></thead>
            <tbody>
              {buyers.length === 0 && <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">No buyers yet.</td></tr>}
              {buyers.map((b: any) => (
                <tr key={b.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{b.name}</td>
                  <td className="px-3 py-2 text-xs">{b.email || "—"}</td>
                  <td className="px-3 py-2 text-xs capitalize">{b.status || "active"}</td>
                  <td className="px-3 py-2 text-right">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(b)}><Pencil className="w-4 h-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => del(b.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      {editing && <BuyerDialog buyer={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["roas_mb_setup"] }); qc.invalidateQueries({ queryKey: ["roas_mb"] }); }} />}
    </div>
  );
}

function BuyerDialog({ buyer, onClose, onSaved }: any) {
  const [form, setForm] = useState({ name: buyer.name || "", email: buyer.email || "", status: buyer.status || "active" });
  const save = async () => {
    if (!form.name) return toast.error("Name required");
    const { error } = buyer.id ? await sb.from("roas_media_buyers").update(form).eq("id", buyer.id) : await sb.from("roas_media_buyers").insert(form);
    if (error) return toast.error(error.message);
    toast.success("Saved"); onSaved();
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>{buyer.id ? "Edit" : "Add"} media buyer</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div><Label>Status</Label><Input value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} placeholder="active" /></div>
        </div>
        <DialogFooter><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
