import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { syncSource, syncAll } from "@/lib/roas/sync";
import { useState } from "react";
import { toast } from "sonner";
import { rel, num } from "@/lib/roas/format";
import { RefreshCw } from "lucide-react";
import { useRoasAuth } from "@/lib/roas/auth";

const sb: any = supabase;

export default function RoasSync() {
  const qc = useQueryClient();
  const { canSync, isAdmin } = useRoasAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [reattributing, setReattributing] = useState(false);

  const reattribute = async () => {
    if (!confirm("Re-run cycle-based attribution on all enrollments (manual overrides preserved)?")) return;
    setReattributing(true);
    try {
      const { data, error } = await supabase.functions.invoke("roas-reattribute-all", { body: {} });
      if (error) throw error;
      toast.success(`Re-attributed ${(data as any)?.processed ?? 0} enrollments`);
      qc.invalidateQueries();
    } catch (e: any) { toast.error(`Failed: ${e.message}`); }
    finally { setReattributing(false); }
  };

  const { data: sources = [] } = useQuery({ queryKey: ["roas_sources-sync"], queryFn: async () => (await sb.from("roas_data_sources").select("*").order("source_name")).data || [] });
  const { data: buyers = [] } = useQuery({ queryKey: ["roas_mb"], queryFn: async () => (await sb.from("roas_media_buyers").select("*")).data || [] });
  const { data: logs = [] } = useQuery({ queryKey: ["roas_sync-logs"], queryFn: async () => (await sb.from("roas_sync_logs").select("*").order("sync_started_at", { ascending: false }).limit(50)).data || [] });

  const runOne = async (id: string, name: string) => {
    setBusy(id);
    try { await syncSource(id); toast.success(`${name} synced`); qc.invalidateQueries(); }
    catch (e: any) { toast.error(`${name} failed: ${e.message}`); }
    finally { setBusy(null); }
  };
  const runAll = async () => {
    setBusy("all");
    try { await syncAll(); toast.success("All sources synced"); qc.invalidateQueries(); }
    catch (e: any) { toast.error(`Sync failed: ${e.message}`); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-4 max-w-[1100px] mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Sync</h1>
          <p className="text-sm text-muted-foreground">Manual + automatic data sync from Published Google Sheets.</p>
        </div>
        {canSync && (
          <div className="flex gap-2">
            {isAdmin && <Button variant="outline" onClick={reattribute} disabled={reattributing}><RefreshCw className={`w-4 h-4 mr-1.5 ${reattributing ? "animate-spin" : ""}`} /> Re-run attribution</Button>}
            <Button onClick={runAll} disabled={busy === "all"}><RefreshCw className={`w-4 h-4 mr-1.5 ${busy === "all" ? "animate-spin" : ""}`} /> Sync All</Button>
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        {sources.length === 0 && <Card className="md:col-span-3"><CardContent className="py-8 text-center text-muted-foreground">No data sources yet. Go to Setup → Data Sources.</CardContent></Card>}
        {sources.map((s: any) => {
          const b = buyers.find((x: any) => x.id === s.media_buyer_id);
          const stale = s.last_synced_at && Date.now() - new Date(s.last_synced_at).getTime() > 30 * 60 * 1000;
          return (
            <Card key={s.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{s.source_name}</CardTitle>
                    <div className="text-xs text-muted-foreground mt-0.5">{s.source_type === "lead_sheet" ? `Lead sheet · ${b?.name || "—"}` : "Enrollment sheet"}</div>
                  </div>
                  <Badge variant={s.status === "active" ? "default" : "secondary"} className="text-[10px]">{s.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Last synced</span><span>{s.last_synced_at ? rel(s.last_synced_at) : "Never"}</span></div>
                <div className="flex justify-between text-xs text-muted-foreground"><span>Fetched {num(s.last_rows_fetched)}</span><span>Imported {num(s.last_rows_imported)}</span><span>Skipped {num(s.last_duplicates_skipped)}</span></div>
                {s.last_sync_error && <div className="text-xs text-destructive bg-destructive/5 rounded p-2 break-words">{s.last_sync_error}</div>}
                {canSync && <Button size="sm" variant="outline" className="w-full" disabled={busy === s.id} onClick={() => runOne(s.id, s.source_name)}><RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${busy === s.id ? "animate-spin" : ""}`} /> Sync now</Button>}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Recent sync logs</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr><Th>Started</Th><Th>Source</Th><Th>Status</Th><Th>Fetched</Th><Th>Imported</Th><Th>Updated</Th><Th>Skipped</Th><Th>Trigger</Th></tr>
            </thead>
            <tbody>
              {logs.length === 0 && <tr><td colSpan={8} className="text-center py-6 text-muted-foreground">No syncs yet.</td></tr>}
              {logs.map((l: any) => {
                const s = sources.find((x: any) => x.id === l.data_source_id);
                return (
                  <tr key={l.id} className="border-t">
                    <Td className="text-xs">{rel(l.sync_started_at)}</Td>
                    <Td className="text-xs">{s?.source_name || "—"}</Td>
                    <Td><Badge variant="outline" className="text-[10px]">{l.sync_status}</Badge></Td>
                    <Td>{num(l.rows_fetched)}</Td><Td>{num(l.rows_imported)}</Td><Td>{num(l.rows_updated)}</Td><Td>{num(l.duplicate_rows_skipped)}</Td>
                    <Td className="text-xs">{l.triggered_by || "—"}</Td>
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
