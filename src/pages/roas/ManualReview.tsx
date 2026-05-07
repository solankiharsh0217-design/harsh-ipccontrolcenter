import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { ManualOverrideDialog } from "@/components/roas/ManualOverrideDialog";
import { useRoasAuth } from "@/lib/roas/auth";
import { inr } from "@/lib/roas/format";

const sb: any = supabase;

export default function RoasManualReview() {
  const qc = useQueryClient();
  const { canEdit } = useRoasAuth();
  const [editing, setEditing] = useState<any | null>(null);

  const { data: buyers = [] } = useQuery({ queryKey: ["roas_mb"], queryFn: async () => (await sb.from("roas_media_buyers").select("*")).data || [] });
  const { data: cases = [], isLoading } = useQuery({
    queryKey: ["roas_review-cases"],
    queryFn: async () => (await sb.from("roas_enrollments").select("*").in("attribution_status", ["Manual Review", "Duplicate Conflict", "Unattributed"]).order("payment_date", { ascending: false }).limit(500)).data || [],
  });

  return (
    <div className="space-y-4 max-w-[1300px] mx-auto">
      <div>
        <h1 className="text-2xl font-semibold">Manual Review</h1>
        <p className="text-sm text-muted-foreground">{cases.length} cases needing attention</p>
      </div>
      {isLoading && <div className="text-muted-foreground text-sm">Loading...</div>}
      {!isLoading && cases.length === 0 && <Card><CardContent className="py-12 text-center text-muted-foreground">All clear.</CardContent></Card>}
      <div className="space-y-3">
        {cases.map((e: any) => (
          <Card key={e.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">{e.buyer_name || "Unknown buyer"}</CardTitle>
                  <Badge variant="outline">{e.attribution_status}</Badge>
                </div>
                {canEdit && <Button size="sm" onClick={() => setEditing(e)}>Resolve</Button>}
              </div>
            </CardHeader>
            <CardContent className="text-sm grid md:grid-cols-2 gap-3">
              <Row label="Phone" value={e.clean_phone} />
              <Row label="Email" value={e.clean_email} />
              <Row label="Amount" value={inr(e.amount_paid)} />
              <Row label="Net Revenue" value={inr(e.net_revenue)} />
              <Row label="Payment Date" value={e.payment_date ? new Date(e.payment_date).toLocaleString("en-IN") : "—"} />
              <Row label="Webinar Date" value={e.webinar_date || "—"} />
            </CardContent>
          </Card>
        ))}
      </div>
      {editing && (
        <ManualOverrideDialog enrollment={editing} buyers={buyers} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["roas_review-cases"] }); qc.invalidateQueries({ queryKey: ["roas_enrollments-all"] }); }} />
      )}
    </div>
  );
}
function Row({ label, value }: any) {
  return <div className="flex justify-between gap-3 py-1 border-b last:border-0 text-sm"><span className="text-muted-foreground">{label}</span><span className="font-mono text-xs text-right">{value || "—"}</span></div>;
}
