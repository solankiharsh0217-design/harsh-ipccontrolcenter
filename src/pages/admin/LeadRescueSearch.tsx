import { useState } from "react";
import { Link } from "react-router-dom";
import { PageHead } from "@/components/ui-bits";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { logActivity } from "@/lib/auditLog";
import { normalizeEmail, normalizePhone } from "@/lib/identity";
import { toast } from "sonner";

type Row = {
  record_type: "crm_lead" | "paid_pipeline_lead" | "conversion";
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  pipeline: string | null;
  stage: string | null;
  archived: boolean;
  hidden_from_sales: boolean;
  assigned_owner: string | null;
  linked_paid_id: string | null;
  linked_crm_id: string | null;
  conversion_status: string | null;
  created_at: string | null;
  extra: any;
};

export default function LeadRescueSearch() {
  const { isAdmin, user } = useAuth();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [ran, setRan] = useState(false);

  if (!isAdmin) return <div className="p-6 text-sm">Admin only.</div>;

  const search = async () => {
    const term = q.trim();
    if (!term) return;
    setBusy(true);
    setRan(true);
    const out: Row[] = [];
    try {
      const email = normalizeEmail(term);
      const phone = normalizePhone(term);
      const looksUuid = /^[0-9a-f-]{32,36}$/i.test(term);

      // CRM leads — broad ILIKE on name/email/phone
      const orParts: string[] = [
        `full_name.ilike.%${term}%`,
        `email.ilike.%${term}%`,
        `phone.ilike.%${term}%`,
      ];
      if (phone) orParts.push(`phone.ilike.%${phone}%`);
      if (looksUuid) orParts.push(`id.eq.${term}`);
      const { data: crm } = await (supabase as any)
        .from("leads")
        .select("id, full_name, email, phone, stage_id, archived_at, deleted_at, hide_from_sales_workload, assigned_agent_id, paid_pipeline_lead_id, conversion_status, pipeline_id, created_at")
        .or(orParts.join(","))
        .limit(50);
      (crm || []).forEach((l: any) => out.push({
        record_type: "crm_lead",
        id: l.id,
        name: l.full_name,
        email: l.email,
        phone: l.phone,
        pipeline: l.pipeline_id,
        stage: l.stage_id,
        archived: !!l.archived_at,
        hidden_from_sales: !!l.hide_from_sales_workload,
        assigned_owner: l.assigned_agent_id,
        linked_paid_id: l.paid_pipeline_lead_id,
        linked_crm_id: null,
        conversion_status: l.conversion_status,
        created_at: l.created_at,
        extra: { deleted_at: l.deleted_at },
      }));

      // Paid pipeline buyers
      const pOr: string[] = [
        `name.ilike.%${term}%`,
        `email.ilike.%${term}%`,
        `phone.ilike.%${term}%`,
      ];
      if (phone) pOr.push(`phone.ilike.%${phone}%`);
      if (looksUuid) pOr.push(`id.eq.${term}`);
      const { data: paid } = await (supabase as any)
        .from("paid_pipeline_leads")
        .select("id, name, email, phone, paid_batch_id, paid_batch_name, pipeline_stage, archived_at, is_deleted, assigned_sales_executive, crm_lead_id, created_at")
        .or(pOr.join(","))
        .limit(50);
      (paid || []).forEach((l: any) => out.push({
        record_type: "paid_pipeline_lead",
        id: l.id,
        name: l.name,
        email: l.email,
        phone: l.phone,
        pipeline: l.paid_batch_name || l.paid_batch_id,
        stage: l.pipeline_stage,
        archived: !!l.archived_at,
        hidden_from_sales: false,
        assigned_owner: l.assigned_sales_executive,
        linked_paid_id: null,
        linked_crm_id: l.crm_lead_id,
        conversion_status: null,
        created_at: l.created_at,
        extra: { is_deleted: l.is_deleted },
      }));

      // Conversion audit rows — by any found ids
      const ids = [
        ...out.filter((r) => r.record_type === "crm_lead").map((r) => r.id),
        ...out.filter((r) => r.record_type === "paid_pipeline_lead").map((r) => r.id),
      ];
      if (ids.length) {
        const { data: conv } = await (supabase as any)
          .from("crm_lead_conversions")
          .select("*")
          .or(`source_lead_id.in.(${ids.join(",")}),paid_pipeline_lead_id.in.(${ids.join(",")})`)
          .limit(50);
        (conv || []).forEach((c: any) => out.push({
          record_type: "conversion",
          id: c.id,
          name: c.lead_name_snapshot || null,
          email: c.lead_email_snapshot || null,
          phone: c.lead_phone_snapshot || null,
          pipeline: c.conversion_type,
          stage: null,
          archived: false,
          hidden_from_sales: false,
          assigned_owner: c.created_by,
          linked_paid_id: c.paid_pipeline_lead_id,
          linked_crm_id: c.source_lead_id,
          conversion_status: c.conversion_type,
          created_at: c.created_at,
          extra: c,
        }));
      }

      await logActivity({
        module_key: "crm",
        action_type: "crm_missing_lead_search_run",
        entity_type: "lead",
        entity_id: term,
        summary: `Lead rescue search: "${term}" → ${out.length} record(s).`,
        metadata: { searched: term, normalized_email: email, normalized_phone: phone, found: out.length, by: user?.id },
      });
      if (out.length > 0) {
        await logActivity({
          module_key: "crm",
          action_type: "crm_missing_lead_found",
          entity_type: "lead",
          entity_id: term,
          summary: `Found ${out.length} record(s) matching "${term}".`,
          metadata: { ids: out.map((r) => ({ type: r.record_type, id: r.id })) },
        });
      }
    } catch (e: any) {
      toast.error(e.message || "Search failed");
    } finally {
      setBusy(false);
      setRows(out);
    }
  };

  const unarchive = async (row: Row) => {
    const table = row.record_type === "crm_lead" ? "leads" : "paid_pipeline_leads";
    const { error } = await (supabase as any).from(table).update({ archived_at: null, archived_by: null, archive_reason: null }).eq("id", row.id);
    if (error) { toast.error(error.message); return; }
    await logActivity({
      module_key: "crm",
      action_type: "crm_lead_unarchived_from_rescue",
      entity_type: row.record_type === "crm_lead" ? "crm_lead" : "paid_pipeline_lead",
      entity_id: row.id,
      entity_label: row.name || undefined,
      summary: `Unarchived ${row.record_type} via Lead Rescue Search.`,
      metadata: { old_visibility_state: { archived: true }, new_visibility_state: { archived: false }, performed_by: user?.id },
    });
    toast.success("Unarchived");
    search();
  };

  const showInCrm = async (row: Row) => {
    if (row.record_type !== "crm_lead") return;
    const old = { hidden_from_sales: row.hidden_from_sales, archived: row.archived };
    const patch: any = {};
    if (row.hidden_from_sales) patch.hide_from_sales_workload = false;
    if (row.archived) { patch.archived_at = null; patch.archived_by = null; patch.archive_reason = null; }
    if (Object.keys(patch).length === 0) { toast.info("Already visible"); return; }
    const { error } = await (supabase as any).from("leads").update(patch).eq("id", row.id);
    if (error) { toast.error(error.message); return; }
    await logActivity({
      module_key: "crm",
      action_type: "crm_lead_visibility_repaired",
      entity_type: "crm_lead",
      entity_id: row.id,
      entity_label: row.name || undefined,
      summary: `Restored visibility for ${row.name || row.id}.`,
      metadata: { old_visibility_state: old, new_visibility_state: { hidden_from_sales: false, archived: false }, performed_by: user?.id },
    });
    toast.success("Visibility restored");
    search();
  };

  const repairLink = async (row: Row) => {
    // For a CRM lead row missing paid link but where a matching paid buyer exists, or vice-versa.
    try {
      if (row.record_type === "crm_lead" && !row.linked_paid_id) {
        const em = normalizeEmail(row.email || "");
        const ph = normalizePhone(row.phone || "");
        let match: any = null;
        if (em) {
          const { data } = await (supabase as any).from("paid_pipeline_leads").select("id").ilike("email", em).limit(1);
          match = (data || [])[0];
        }
        if (!match && ph) {
          const { data } = await (supabase as any).from("paid_pipeline_leads").select("id").ilike("phone", `%${ph}`).limit(1);
          match = (data || [])[0];
        }
        if (!match) { toast.info("No matching paid buyer found"); return; }
        await (supabase as any).from("leads").update({ paid_pipeline_lead_id: match.id, conversion_status: "linked_to_paid" }).eq("id", row.id);
        await (supabase as any).from("paid_pipeline_leads").update({ crm_lead_id: row.id }).eq("id", match.id);
        await logActivity({
          module_key: "crm",
          action_type: "crm_conversion_link_repaired",
          entity_type: "crm_lead",
          entity_id: row.id,
          entity_label: row.name || undefined,
          summary: `Repaired link between CRM lead and paid buyer.`,
          metadata: { paid_pipeline_lead_id: match.id, performed_by: user?.id },
        });
        toast.success("Linked to paid buyer");
        search();
        return;
      }
      if (row.record_type === "paid_pipeline_lead" && !row.linked_crm_id) {
        const em = normalizeEmail(row.email || "");
        const ph = normalizePhone(row.phone || "");
        let match: any = null;
        if (em) {
          const { data } = await (supabase as any).from("leads").select("id").ilike("email", em).limit(1);
          match = (data || [])[0];
        }
        if (!match && ph) {
          const { data } = await (supabase as any).from("leads").select("id").ilike("phone", `%${ph}`).limit(1);
          match = (data || [])[0];
        }
        if (!match) { toast.info("No matching CRM lead found"); return; }
        await (supabase as any).from("paid_pipeline_leads").update({ crm_lead_id: match.id }).eq("id", row.id);
        await (supabase as any).from("leads").update({ paid_pipeline_lead_id: row.id, conversion_status: "linked_to_paid" }).eq("id", match.id);
        await logActivity({
          module_key: "crm",
          action_type: "crm_paid_buyer_link_repaired",
          entity_type: "paid_pipeline_lead",
          entity_id: row.id,
          entity_label: row.name || undefined,
          summary: `Repaired link between paid buyer and CRM lead.`,
          metadata: { crm_lead_id: match.id, performed_by: user?.id },
        });
        toast.success("Linked to CRM lead");
        search();
        return;
      }
      toast.info("Link already present");
    } catch (e: any) {
      toast.error(e.message || "Repair failed");
    }
  };

  return (
    <div>
      <PageHead title="Lead Rescue Search" sub="Find any lead — including converted, hidden, or archived — across CRM, Paid Pipeline, and conversion history." />

      <div className="rounded-xl border border-line bg-white p-4 mb-5">
        <div className="flex gap-2">
          <input
            className="ipc-input flex-1"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") search(); }}
            placeholder="Name, email, phone (10 digits), or record ID — e.g. Zuber, 9604246000, zuber.nadaf06@gmail.com"
          />
          <button className="ipc-btn-primary" onClick={search} disabled={busy || !q.trim()}>{busy ? "Searching…" : "Search"}</button>
        </div>
        <div className="text-[11px] text-muted-foreground mt-2">
          Searches case-insensitively across name, email, and phone in CRM leads, paid pipeline buyers, and conversion audit rows. Includes archived, hidden, and converted records.
        </div>
      </div>

      {ran && rows.length === 0 && !busy && (
        <div className="rounded-xl border border-line bg-off p-6 text-sm text-muted-foreground">No records found for "{q}".</div>
      )}

      {rows.length > 0 && (
        <div className="rounded-xl border border-line bg-white overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-off">
              <tr className="text-left">
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Email / Phone</th>
                <th className="px-3 py-2">Stage / Status</th>
                <th className="px-3 py-2">Flags</th>
                <th className="px-3 py-2">Links</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.record_type + r.id} className="border-t border-line align-top">
                  <td className="px-3 py-2 font-mono text-[10px]">{r.record_type}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.name || "—"}</div>
                    <div className="font-mono text-[10px] text-muted-foreground">{r.id}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div>{r.email || "—"}</div>
                    <div className="text-muted-foreground">{r.phone || "—"}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div>{r.stage || "—"}</div>
                    {r.conversion_status && <div className="text-[10px] text-muted-foreground">{r.conversion_status}</div>}
                  </td>
                  <td className="px-3 py-2 text-[10px]">
                    {r.archived && <div className="text-amber-700">archived</div>}
                    {r.hidden_from_sales && <div className="text-blue-700">hidden from sales</div>}
                    {r.extra?.is_deleted && <div className="text-red-700">soft-deleted</div>}
                    {r.extra?.deleted_at && <div className="text-red-700">deleted</div>}
                    {!r.archived && !r.hidden_from_sales && !r.extra?.is_deleted && !r.extra?.deleted_at && <div className="text-green-700">visible</div>}
                  </td>
                  <td className="px-3 py-2 text-[10px] font-mono">
                    {r.linked_paid_id && <div title="Paid buyer">→ paid {r.linked_paid_id.slice(0, 8)}</div>}
                    {r.linked_crm_id && <div title="CRM lead">→ crm {r.linked_crm_id.slice(0, 8)}</div>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {r.record_type === "crm_lead" && (
                        <Link to={`/crm?lead=${r.id}`} className="ipc-btn-secondary !h-7 !text-[10px] !px-2">Open CRM</Link>
                      )}
                      {r.record_type === "paid_pipeline_lead" && (
                        <Link to={`/paid-pipeline?lead=${r.id}`} className="ipc-btn-secondary !h-7 !text-[10px] !px-2">Open Paid</Link>
                      )}
                      {r.linked_paid_id && r.record_type === "crm_lead" && (
                        <Link to={`/paid-pipeline?lead=${r.linked_paid_id}`} className="ipc-btn-secondary !h-7 !text-[10px] !px-2">Paid Buyer</Link>
                      )}
                      {r.linked_crm_id && r.record_type === "paid_pipeline_lead" && (
                        <Link to={`/crm?lead=${r.linked_crm_id}`} className="ipc-btn-secondary !h-7 !text-[10px] !px-2">CRM Lead</Link>
                      )}
                      {r.archived && r.record_type !== "conversion" && (
                        <button className="ipc-btn-secondary !h-7 !text-[10px] !px-2" onClick={() => unarchive(r)}>Unarchive</button>
                      )}
                      {r.record_type === "crm_lead" && (r.hidden_from_sales || r.archived) && (
                        <button className="ipc-btn-secondary !h-7 !text-[10px] !px-2" onClick={() => showInCrm(r)}>Show in CRM</button>
                      )}
                      {((r.record_type === "crm_lead" && !r.linked_paid_id) || (r.record_type === "paid_pipeline_lead" && !r.linked_crm_id)) && (
                        <button className="ipc-btn-secondary !h-7 !text-[10px] !px-2" onClick={() => repairLink(r)}>Repair Link</button>
                      )}
                      <button
                        className="ipc-btn-secondary !h-7 !text-[10px] !px-2"
                        onClick={() => { navigator.clipboard.writeText(r.id); toast.success("ID copied"); }}
                      >Copy ID</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
