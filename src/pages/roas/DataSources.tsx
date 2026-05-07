import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useEffect, useState } from "react";
import { useRoasAuth } from "@/lib/roas/auth";
import { toast } from "sonner";
import { LEAD_FIELDS, ENROLLMENT_FIELDS, autoMap } from "@/lib/roas/fields";
import { fetchPreview } from "@/lib/roas/preview";
import { syncSource } from "@/lib/roas/sync";
import { rel, num } from "@/lib/roas/format";
import { AlertTriangle, RefreshCw, Pencil, Trash2 } from "lucide-react";

const sb: any = supabase;

export default function RoasDataSources() {
  const qc = useQueryClient();
  const { isAdmin } = useRoasAuth();
  const [editing, setEditing] = useState<any | null>(null);
  const [mapping, setMapping] = useState<any | null>(null);

  const { data: buyers = [] } = useQuery({ queryKey: ["roas_mb"], queryFn: async () => (await sb.from("roas_media_buyers").select("*")).data || [] });
  const { data: sources = [] } = useQuery({ queryKey: ["roas_sources-setup"], queryFn: async () => (await sb.from("roas_data_sources").select("*").order("source_name")).data || [] });

  if (!isAdmin) return <div className="text-sm text-muted-foreground">Admin only.</div>;

  const del = async (id: string) => {
    if (!confirm("Delete this data source? This will also delete its imported rows.")) return;
    const { error } = await sb.from("roas_data_sources").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["roas_sources-setup"] });
  };

  return (
    <div className="space-y-4 max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Data Sources</h1>
          <p className="text-sm text-muted-foreground">Published Google Sheet links for leads & enrollments.</p>
        </div>
        <Button onClick={() => setEditing({})}>+ Add source</Button>
      </div>

      <Card>
        <CardContent className="p-3 flex gap-2 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>Published Google Sheet links are publicly accessible. Publish only dashboard-safe tabs. Don't expose PAN, addresses, screenshots, or private remarks.</div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-3">
        {sources.map((s: any) => {
          const b = buyers.find((x: any) => x.id === s.media_buyer_id);
          const hasMapping = Object.keys(s.column_mapping_json || {}).length > 0;
          return (
            <Card key={s.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{s.source_name}</CardTitle>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(s)}><Pencil className="w-4 h-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => del(s.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">{s.source_type === "lead_sheet" ? `Lead sheet · ${b?.name || "—"}` : "Enrollment sheet"}</div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="text-xs truncate" title={s.published_sheet_url}>{s.published_sheet_url}</div>
                <div className="flex items-center gap-2 flex-wrap">
                  {hasMapping ? <Badge variant="outline">Mapped</Badge> : <Badge variant="secondary">Not mapped</Badge>}
                  {s.last_synced_at && <span className="text-xs text-muted-foreground">Synced {rel(s.last_synced_at)} · {num(s.last_rows_imported)} new</span>}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setMapping(s)}>Column mapping</Button>
                  <Button size="sm" variant="outline" onClick={async () => {
                    toast.promise(syncSource(s.id), { loading: `Syncing ${s.source_name}...`, success: () => { qc.invalidateQueries(); return "Synced"; }, error: (e) => `Failed: ${e.message}` });
                  }}><RefreshCw className="w-3.5 h-3.5 mr-1" /> Sync</Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {editing && <SourceDialog source={editing} buyers={buyers} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["roas_sources-setup"] }); }} />}
      {mapping && <MappingDialog source={mapping} onClose={() => setMapping(null)} onSaved={() => { setMapping(null); qc.invalidateQueries({ queryKey: ["roas_sources-setup"] }); }} />}
    </div>
  );
}

function SourceDialog({ source, buyers, onClose, onSaved }: any) {
  const [form, setForm] = useState({
    source_name: source.source_name || "",
    source_type: source.source_type || "lead_sheet",
    media_buyer_id: source.media_buyer_id || "",
    published_sheet_url: source.published_sheet_url || "",
    status: source.status || "active",
  });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!form.source_name || !form.published_sheet_url) return toast.error("Name and URL required");
    if (form.source_type === "lead_sheet" && !form.media_buyer_id) return toast.error("Pick a media buyer");
    setSaving(true);
    const payload: any = { ...form, media_buyer_id: form.source_type === "lead_sheet" ? form.media_buyer_id : null };
    const { error } = source.id
      ? await sb.from("roas_data_sources").update(payload).eq("id", source.id)
      : await sb.from("roas_data_sources").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Saved"); onSaved();
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>{source.id ? "Edit" : "Add"} data source</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Source name</Label><Input value={form.source_name} onChange={(e) => setForm({ ...form, source_name: e.target.value })} /></div>
          <div>
            <Label>Source type</Label>
            <Select value={form.source_type} onValueChange={(v) => setForm({ ...form, source_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="lead_sheet">Lead Sheet</SelectItem><SelectItem value="enrollment_sheet">Enrollment Sheet</SelectItem></SelectContent>
            </Select>
          </div>
          {form.source_type === "lead_sheet" && (
            <div>
              <Label>Media Buyer</Label>
              <Select value={form.media_buyer_id} onValueChange={(v) => setForm({ ...form, media_buyer_id: v })}>
                <SelectTrigger><SelectValue placeholder="Pick" /></SelectTrigger>
                <SelectContent>{buyers.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Published Google Sheet URL</Label>
            <Input value={form.published_sheet_url} onChange={(e) => setForm({ ...form, published_sheet_url: e.target.value })} placeholder="https://docs.google.com/spreadsheets/d/.../pubhtml" />
            <p className="text-xs text-muted-foreground mt-1">File → Share → Publish to web → copy link.</p>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MappingDialog({ source, onClose, onSaved }: any) {
  const fields = source.source_type === "lead_sheet" ? LEAD_FIELDS : ENROLLMENT_FIELDS;
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMappingState] = useState<Record<string, string>>(source.column_mapping_json || {});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchPreview(source.published_sheet_url).then(({ headers, error }) => {
      setLoading(false);
      if (error) { setError(error); return; }
      setHeaders(headers);
      if (Object.keys(source.column_mapping_json || {}).length === 0) setMappingState(autoMap(headers, fields));
    });
  }, [source.id]);

  const save = async () => {
    const hasContact = mapping.phone || mapping.email;
    if (!hasContact) return toast.error("Phone or email is required for attribution");
    const { error } = await sb.from("roas_data_sources").update({ column_mapping_json: mapping }).eq("id", source.id);
    if (error) return toast.error(error.message);
    toast.success("Mapping saved"); onSaved();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Column mapping — {source.source_name}</DialogTitle></DialogHeader>
        {loading && <div className="py-8 text-center text-muted-foreground">Fetching sheet headers...</div>}
        {error && <div className="text-destructive bg-destructive/5 p-3 rounded text-sm">{error}</div>}
        {!loading && !error && (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">Map your sheet's columns to internal fields. Phone or email mandatory.</div>
            {fields.map((f) => (
              <div key={f.key} className="grid grid-cols-2 gap-2 items-center">
                <Label className="text-sm">{f.label}{f.required && <span className="text-destructive ml-0.5">*</span>}</Label>
                <Select value={mapping[f.key] || "_none"} onValueChange={(v) => setMappingState({ ...mapping, [f.key]: v === "_none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="— not mapped —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— not mapped —</SelectItem>
                    {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        )}
        <DialogFooter><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={loading || !!error}>Save mapping</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
