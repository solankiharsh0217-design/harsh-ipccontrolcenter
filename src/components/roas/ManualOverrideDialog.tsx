import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { inr } from "@/lib/roas/format";

export function ManualOverrideDialog({
  enrollment, buyers, onClose, onSaved,
}: { enrollment: any; buyers: any[]; onClose: () => void; onSaved: () => void; }) {
  const [target, setTarget] = useState<string>(enrollment.attributed_media_buyer_id || "unattributed");
  const [status, setStatus] = useState<string>(enrollment.attribution_status || "Attributed");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id ?? null;

    const updates: any = {
      manual_override: true,
      manual_override_by: uid,
      manual_override_at: new Date().toISOString(),
      manual_override_reason: reason || null,
      attribution_method: "Manual Override",
      attribution_confidence: "High",
    };
    if (target === "unattributed") {
      updates.attributed_media_buyer_id = null;
      updates.attribution_status = status === "Attributed" ? "Unattributed" : status;
    } else if (target === "organic") {
      updates.attributed_media_buyer_id = null;
      updates.attribution_status = "Organic";
    } else {
      updates.attributed_media_buyer_id = target;
      updates.attribution_status = status === "Manual Review" || status === "Duplicate Conflict" ? "Attributed" : status;
    }

    const { error } = await supabase.from("roas_enrollments" as any).update(updates).eq("id", enrollment.id);
    if (error) { setSaving(false); return toast.error(error.message); }

    await supabase.from("roas_attribution_logs" as any).insert({
      enrollment_id: enrollment.id,
      old_media_buyer_id: enrollment.attributed_media_buyer_id,
      new_media_buyer_id: updates.attributed_media_buyer_id,
      old_status: enrollment.attribution_status,
      new_status: updates.attribution_status,
      change_reason: reason || "manual override",
      changed_by: uid,
    });

    setSaving(false);
    toast.success("Attribution updated");
    onSaved();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Manual Override</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="text-sm bg-muted/50 rounded p-3 space-y-1">
            <div><strong>{enrollment.buyer_name}</strong> — {inr(enrollment.amount_paid)}</div>
            <div className="text-xs text-muted-foreground">{enrollment.clean_phone} · {enrollment.clean_email}</div>
          </div>
          <div>
            <Label>Attribute to</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {buyers.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                <SelectItem value="organic">Organic / Direct</SelectItem>
                <SelectItem value="unattributed">Unattributed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Attributed">Attributed</SelectItem>
                <SelectItem value="Refunded">Refunded</SelectItem>
                <SelectItem value="Cancelled">Cancelled</SelectItem>
                <SelectItem value="Manual Review">Manual Review</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Reason / remarks</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why are you overriding?" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save override"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
