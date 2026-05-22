import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { logActivity } from "@/lib/auditLog";
import {
  getCanonicalMediaBuyers,
  normalizeMediaBuyerNameSync,
  refreshMediaBuyerCache,
  subscribeMediaBuyers,
} from "@/lib/mediaBuyers";

const inr = (n: number) =>
  "₹" + (Number.isFinite(n) ? Math.round(n) : 0).toLocaleString("en-IN");
const num = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const safeDiv = (a: number, b: number) => (b > 0 ? a / b : null);

const EVENT_TYPES = [
  "Offline Seminar",
  "Offline Bootcamp",
  "Offline Workshop",
  "Physical Masterclass",
  "Retreat",
  "Hybrid Event",
  "Other",
];

const DEFAULT_COST_CATS = [
  "Venue / Banquet",
  "Production",
  "Shooting / Video",
  "Team Cost",
  "Travel",
  "Hotel / Stay",
  "Food / Hospitality",
  "Printing / Branding",
  "Gifts / Kits",
  "Speaker / Trainer",
  "Miscellaneous",
];

type CostLine = { id: string; name: string; amount: number; notes?: string };
type BuyerLine = {
  id: string;
  name: string;
  ad_account?: string;
  ad_spend: number;
  leads?: number;
  registrations?: number;
  tickets_sold?: number;
  sales_count?: number;
  revenue_attributed?: number;
  revenue_collected?: number;
  revenue_pending?: number;
  notes?: string;
};

const uid = () => Math.random().toString(36).slice(2, 10);

export default function OfflineSeminarRoas({
  loadReportId,
  onBack,
  onSaved,
}: {
  loadReportId?: string | null;
  onBack?: () => void;
  onSaved?: () => void;
}) {
  const { user } = useAuth();

  // Event
  const [eventName, setEventName] = useState("");
  const [eventType, setEventType] = useState("Offline Seminar");
  const [eventDate, setEventDate] = useState(new Date().toISOString().slice(0, 10));
  const [eventMonth, setEventMonth] = useState(new Date().toISOString().slice(0, 7));
  const [city, setCity] = useState("");
  const [venueName, setVenueName] = useState("");
  const [programName, setProgramName] = useState("");
  const [businessUnit, setBusinessUnit] = useState("");
  const [notes, setNotes] = useState("");

  // Ticket
  const [ticketPrice, setTicketPrice] = useState<number>(0);
  const [ticketsSold, setTicketsSold] = useState<number>(0);
  const [ticketRevenueOverride, setTicketRevenueOverride] = useState<string>("");
  const [complimentaryPasses, setComplimentaryPasses] = useState<number>(0);
  const [noShowCount, setNoShowCount] = useState<number>(0);
  const [totalAttendeesOverride, setTotalAttendeesOverride] = useState<string>("");

  // Costs
  const [costs, setCosts] = useState<CostLine[]>(
    DEFAULT_COST_CATS.map((n) => ({ id: uid(), name: n, amount: 0 }))
  );

  // Media buyers
  const [buyers, setBuyers] = useState<BuyerLine[]>([]);
  const [canonical, setCanonical] = useState<string[]>([]);

  // Program sales
  const [programPrice, setProgramPrice] = useState<number>(0);
  const [salesCount, setSalesCount] = useState<number>(0);
  const [bookedRevenueOverride, setBookedRevenueOverride] = useState<string>("");
  const [revenueCollected, setRevenueCollected] = useState<number>(0);
  const [revenuePending, setRevenuePending] = useState<number>(0);
  const [refundsAdjustments, setRefundsAdjustments] = useState<number>(0);

  const [saving, setSaving] = useState(false);
  const [loadedId, setLoadedId] = useState<string | null>(null);

  // ───── load canonical buyers ─────
  useEffect(() => {
    let alive = true;
    refreshMediaBuyerCache().then(async () => {
      const list = await getCanonicalMediaBuyers();
      if (alive) setCanonical(list);
    });
    const unsub = subscribeMediaBuyers(async () => {
      const list = await getCanonicalMediaBuyers();
      if (alive) setCanonical(list);
    });
    return () => { alive = false; unsub(); };
  }, []);

  // ───── load existing report ─────
  useEffect(() => {
    if (!loadReportId) return;
    (async () => {
      const { data, error } = await (supabase as any)
        .from("offline_seminar_reports")
        .select("*")
        .eq("id", loadReportId)
        .maybeSingle();
      if (error || !data) { toast.error("Could not load report"); return; }
      setLoadedId(data.id);
      setEventName(data.event_name || "");
      setEventType(data.event_type || "Offline Seminar");
      setEventDate(data.event_date || new Date().toISOString().slice(0, 10));
      setEventMonth(data.event_month || (data.event_date || "").slice(0, 7));
      setCity(data.city || "");
      setVenueName(data.venue_name || "");
      setProgramName(data.program_name || "");
      setBusinessUnit(data.business_unit || "");
      setNotes(data.notes || "");
      setTicketPrice(num(data.ticket_price));
      setTicketsSold(num(data.tickets_sold));
      setTicketRevenueOverride(String(num(data.ticket_revenue)));
      setComplimentaryPasses(num(data.complimentary_passes));
      setNoShowCount(num(data.no_show_count));
      setTotalAttendeesOverride(String(num(data.total_attendees)));
      if (Array.isArray(data.cost_breakdown) && data.cost_breakdown.length) {
        setCosts(data.cost_breakdown.map((c: any) => ({
          id: uid(), name: c.name || "", amount: num(c.amount), notes: c.notes,
        })));
      }
      if (Array.isArray(data.media_buyer_breakdown)) {
        setBuyers(data.media_buyer_breakdown.map((b: any) => ({
          id: uid(),
          name: b.name || "",
          ad_account: b.ad_account || "",
          ad_spend: num(b.ad_spend),
          leads: num(b.leads),
          registrations: num(b.registrations),
          tickets_sold: num(b.tickets_sold),
          sales_count: num(b.sales_count),
          revenue_attributed: num(b.revenue_attributed),
          revenue_collected: num(b.revenue_collected),
          revenue_pending: num(b.revenue_pending),
          notes: b.notes,
        })));
      }
      setProgramPrice(num(data.program_price));
      setSalesCount(num(data.program_sales_count));
      setBookedRevenueOverride(String(num(data.program_booked_revenue)));
      setRevenueCollected(num(data.program_revenue_collected));
      setRevenuePending(num(data.program_revenue_pending));
      setRefundsAdjustments(num(data.refunds_adjustments));
    })();
  }, [loadReportId]);

  // Auto-derive event month
  useEffect(() => {
    if (eventDate) setEventMonth(eventDate.slice(0, 7));
  }, [eventDate]);

  // ───── computations ─────
  const ticketRevenueComputed = ticketPrice * ticketsSold;
  const ticketRevenue = ticketRevenueOverride.trim() === ""
    ? ticketRevenueComputed
    : num(ticketRevenueOverride);

  const totalAttendeesComputed = ticketsSold + complimentaryPasses - noShowCount;
  const totalAttendees = totalAttendeesOverride.trim() === ""
    ? Math.max(0, totalAttendeesComputed)
    : num(totalAttendeesOverride);

  const totalEventCost = useMemo(
    () => costs.reduce((a, c) => a + num(c.amount), 0),
    [costs]
  );
  const totalAdSpend = useMemo(
    () => buyers.reduce((a, b) => a + num(b.ad_spend), 0),
    [buyers]
  );
  const totalCost = totalAdSpend + totalEventCost;

  const bookedRevenueComputed = programPrice * salesCount;
  const bookedRevenue = bookedRevenueOverride.trim() === ""
    ? bookedRevenueComputed
    : num(bookedRevenueOverride);

  const totalGrossRevenue = ticketRevenue + bookedRevenue;
  const totalRealizedRevenue = ticketRevenue + revenueCollected - refundsAdjustments;
  const totalPendingRevenue = revenuePending;

  const netProfit = totalRealizedRevenue - totalCost;
  const netProfitMargin = safeDiv(netProfit, totalRealizedRevenue);
  const eventRoas = safeDiv(totalGrossRevenue, totalAdSpend);
  const realizedRoas = safeDiv(totalRealizedRevenue, totalAdSpend);
  const profitRoi = safeDiv(netProfit, totalCost);
  const costPerAttendee = safeDiv(totalCost, totalAttendees);
  const costPerSale = safeDiv(totalCost, salesCount);
  const breakEvenSales = safeDiv(totalCost, programPrice);

  // Buyer helpers
  const addBuyer = () =>
    setBuyers((b) => [...b, { id: uid(), name: "", ad_spend: 0 }]);
  const removeBuyer = (id: string) =>
    setBuyers((b) => b.filter((x) => x.id !== id));
  const updateBuyer = (id: string, patch: Partial<BuyerLine>) =>
    setBuyers((b) => b.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  // Cost helpers
  const addCost = () =>
    setCosts((c) => [...c, { id: uid(), name: "Custom Cost", amount: 0 }]);
  const removeCost = (id: string) =>
    setCosts((c) => c.filter((x) => x.id !== id));
  const updateCost = (id: string, patch: Partial<CostLine>) =>
    setCosts((c) => c.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  // ───── save ─────
  const validate = () => {
    if (!eventName.trim()) { toast.error("Event name is required"); return false; }
    if (!eventDate) { toast.error("Event date is required"); return false; }
    return true;
  };

  const buildPayload = () => ({
    event_name: eventName.trim(),
    event_type: eventType || null,
    event_date: eventDate,
    event_month: eventMonth || (eventDate ? eventDate.slice(0, 7) : null),
    city: city || null,
    venue_name: venueName || null,
    program_name: programName || null,
    business_unit: businessUnit || null,
    ticket_price: ticketPrice,
    tickets_sold: ticketsSold,
    ticket_revenue: ticketRevenue,
    complimentary_passes: complimentaryPasses,
    total_attendees: totalAttendees,
    no_show_count: noShowCount,
    total_ad_spend: totalAdSpend,
    total_event_cost: totalEventCost,
    total_cost: totalCost,
    program_price: programPrice,
    program_sales_count: salesCount,
    program_booked_revenue: bookedRevenue,
    program_revenue_collected: revenueCollected,
    program_revenue_pending: revenuePending,
    refunds_adjustments: refundsAdjustments,
    total_gross_revenue: totalGrossRevenue,
    total_realized_revenue: totalRealizedRevenue,
    total_pending_revenue: totalPendingRevenue,
    net_profit: netProfit,
    net_profit_margin: netProfitMargin == null ? null : netProfitMargin * 100,
    event_roas: eventRoas,
    realized_roas: realizedRoas,
    profit_roi: profitRoi == null ? null : profitRoi * 100,
    cost_per_attendee: costPerAttendee,
    cost_per_sale: costPerSale,
    break_even_sales_required: breakEvenSales,
    media_buyer_breakdown: buyers.map((b) => ({
      ...b,
      name: normalizeMediaBuyerNameSync(b.name),
    })),
    cost_breakdown: costs.map(({ id, ...rest }) => rest),
    notes: notes || null,
    created_by: user?.id || null,
  });

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    const payload = buildPayload();
    try {
      if (loadedId) {
        const { error } = await (supabase as any)
          .from("offline_seminar_reports")
          .update(payload)
          .eq("id", loadedId);
        if (error) throw error;
        toast.success("Offline seminar report updated");
        logActivity({
          module_key: "offline_seminar_roas",
          action_type: "offline_seminar_report_updated",
          entity_type: "offline_seminar_report",
          entity_id: loadedId,
          entity_label: payload.event_name,
          summary: `Offline Seminar Report '${payload.event_name}' updated.`,
        });
      } else {
        const { data, error } = await (supabase as any)
          .from("offline_seminar_reports")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        setLoadedId(data.id);
        toast.success("Offline seminar report saved");
        logActivity({
          module_key: "offline_seminar_roas",
          action_type: "offline_seminar_report_created",
          entity_type: "offline_seminar_report",
          entity_id: data.id,
          entity_label: payload.event_name,
          summary: `Offline Seminar Report '${payload.event_name}' created.`,
        });
      }
      onSaved?.();
    } catch (e: any) {
      toast.error("Save failed", { description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = () => {
    const rows: [string, string][] = [
      ["Event", eventName],
      ["Type", eventType],
      ["Date", eventDate],
      ["City", city],
      ["Venue", venueName],
      ["Program", programName],
      ["Ticket Price", String(ticketPrice)],
      ["Tickets Sold", String(ticketsSold)],
      ["Ticket Revenue", String(ticketRevenue)],
      ["Total Attendees", String(totalAttendees)],
      ["Total Ad Spend", String(totalAdSpend)],
      ["Total Event Cost", String(totalEventCost)],
      ["Total Cost", String(totalCost)],
      ["Program Sales", String(salesCount)],
      ["Program Booked Revenue", String(bookedRevenue)],
      ["Revenue Collected", String(revenueCollected)],
      ["Revenue Pending", String(revenuePending)],
      ["Total Gross Revenue", String(totalGrossRevenue)],
      ["Total Realized Revenue", String(totalRealizedRevenue)],
      ["Net Profit", String(netProfit)],
      ["Realized ROAS", realizedRoas == null ? "N/A" : realizedRoas.toFixed(2)],
      ["Profit ROI %", profitRoi == null ? "N/A" : (profitRoi * 100).toFixed(2)],
    ];
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `offline-seminar-${eventName.replace(/\W+/g, "-") || "report"}.csv`;
    a.click();
    if (loadedId) {
      logActivity({
        module_key: "offline_seminar_roas",
        action_type: "offline_seminar_report_exported",
        entity_type: "offline_seminar_report",
        entity_id: loadedId,
        entity_label: eventName,
        metadata: { format: "csv" },
        summary: `Offline Seminar Report '${eventName}' exported as CSV.`,
      });
    }
  };

  const topBuyer = useMemo(() => {
    const sorted = [...buyers]
      .filter((b) => b.name)
      .sort((a, b) => num(b.revenue_attributed) - num(a.revenue_attributed));
    return sorted[0]?.name || "—";
  }, [buyers]);

  const copySummary = async () => {
    const lines = [
      "Offline Seminar ROAS Summary",
      `Event: ${eventName}`,
      `Date: ${eventDate}`,
      `City: ${city || "—"}`,
      `Tickets Sold: ${ticketsSold}`,
      `Ticket Revenue: ${inr(ticketRevenue)}`,
      `Program Sales: ${salesCount}`,
      `Program Revenue: ${inr(bookedRevenue)}`,
      `Revenue Collected: ${inr(revenueCollected)}`,
      `Revenue Pending: ${inr(revenuePending)}`,
      `Total Ad Spend: ${inr(totalAdSpend)}`,
      `Total Event Cost: ${inr(totalEventCost)}`,
      `Total Cost: ${inr(totalCost)}`,
      `Net Profit: ${inr(netProfit)}`,
      `Realized ROAS: ${realizedRoas == null ? "N/A" : realizedRoas.toFixed(2) + "×"}`,
      `Profit ROI: ${profitRoi == null ? "N/A" : (profitRoi * 100).toFixed(1) + "%"}`,
      `Cost Per Attendee: ${costPerAttendee == null ? "N/A" : inr(costPerAttendee)}`,
      `Cost Per Sale: ${costPerSale == null ? "N/A" : inr(costPerSale)}`,
      `Top Media Buyer: ${topBuyer}`,
    ];
    await navigator.clipboard.writeText(lines.join("\n"));
    toast.success("Founder summary copied");
  };

  // ───── render ─────
  return (
    <div style={{ maxWidth: 960, padding: "8px 4px 80px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <div className="page-title">Offline Seminar ROAS</div>
          <p className="page-sub" style={{ marginBottom: 0 }}>
            Calculate offline event profitability using ticket revenue, ad spend, event costs, program sales, and media buyer performance.
          </p>
        </div>
        {onBack && (
          <button className="btn btn-g" onClick={onBack}>← Back</button>
        )}
      </div>

      {/* Section 1 — Event */}
      <Section title="Event Details" sub="Basic information about the offline event.">
        <div className="two-col">
          <Field label="Event Name *">
            <input className="fi" value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="e.g. Wealth Mastery Mumbai" />
          </Field>
          <Field label="Event Type">
            <select className="fsel" value={eventType} onChange={(e) => setEventType(e.target.value)}>
              {EVENT_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Event Date *">
            <input className="fi" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
          </Field>
          <Field label="Event Month">
            <input className="fi" type="month" value={eventMonth} onChange={(e) => setEventMonth(e.target.value)} />
          </Field>
          <Field label="City"><input className="fi" value={city} onChange={(e) => setCity(e.target.value)} /></Field>
          <Field label="Venue Name"><input className="fi" value={venueName} onChange={(e) => setVenueName(e.target.value)} /></Field>
          <Field label="Program / Offer Sold"><input className="fi" value={programName} onChange={(e) => setProgramName(e.target.value)} /></Field>
          <Field label="Business Unit / Event Owner"><input className="fi" value={businessUnit} onChange={(e) => setBusinessUnit(e.target.value)} /></Field>
        </div>
        <div style={{ marginTop: 12 }}>
          <Field label="Notes (optional)">
            <textarea className="fi" style={{ height: 70, padding: 10, resize: "vertical" }} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
      </Section>

      {/* Section 2 — Ticket */}
      <Section title="Ticket Revenue" sub="Tickets sold and attendance numbers.">
        <div className="three-col">
          <Field label="Ticket Price (₹)"><NumInput value={ticketPrice} onChange={setTicketPrice} /></Field>
          <Field label="Tickets Sold"><NumInput value={ticketsSold} onChange={setTicketsSold} /></Field>
          <Field label={`Ticket Revenue (auto ${inr(ticketRevenueComputed)})`}>
            <input className="fi" placeholder={String(ticketRevenueComputed)} value={ticketRevenueOverride} onChange={(e) => setTicketRevenueOverride(e.target.value)} />
          </Field>
          <Field label="Complimentary Passes"><NumInput value={complimentaryPasses} onChange={setComplimentaryPasses} /></Field>
          <Field label="No-Show Count"><NumInput value={noShowCount} onChange={setNoShowCount} /></Field>
          <Field label={`Total Attendees (auto ${Math.max(0, totalAttendeesComputed)})`}>
            <input className="fi" placeholder={String(Math.max(0, totalAttendeesComputed))} value={totalAttendeesOverride} onChange={(e) => setTotalAttendeesOverride(e.target.value)} />
          </Field>
        </div>
      </Section>

      {/* Section 3 — Costs */}
      <Section title="Event Costs" sub="Add costs for venue, production, team, travel, etc. Ad spend is captured separately below.">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {costs.map((c) => (
            <div key={c.id} style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1.4fr 32px", gap: 8, alignItems: "center" }}>
              <input className="fi" value={c.name} onChange={(e) => updateCost(c.id, { name: e.target.value })} placeholder="Cost name" />
              <NumInput value={c.amount} onChange={(v) => updateCost(c.id, { amount: v })} prefix="₹" />
              <input className="fi" value={c.notes || ""} onChange={(e) => updateCost(c.id, { notes: e.target.value })} placeholder="Notes (optional)" />
              <button className="mb-remove" onClick={() => removeCost(c.id)} title="Remove">✕</button>
            </div>
          ))}
          <button className="add-mb-btn" onClick={addCost}>+ Add Custom Cost</button>
        </div>
        <div style={{ marginTop: 12, textAlign: "right", fontSize: 12, color: "#888" }}>
          Total Event Cost: <strong style={{ color: "#0a0a0a", fontSize: 14 }}>{inr(totalEventCost)}</strong>
        </div>
      </Section>

      {/* Section 4 — Media Buyer Ad Spend */}
      <Section title="Media Buyer Ad Spend" sub="Select media buyers who ran ads for this event. Names are pulled from the saved buyer list.">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {buyers.length === 0 && (
            <div style={{ padding: 16, textAlign: "center", color: "#888", border: "1px dashed #E8E5DE", borderRadius: 10, fontSize: 12 }}>
              No media buyers added. Click below to add.
            </div>
          )}
          {buyers.map((b) => (
            <div key={b.id} className="mb-row">
              <div className="mb-row-head">
                <div className="mb-row-title">{b.name || "New Media Buyer"}</div>
                <button className="mb-remove" onClick={() => removeBuyer(b.id)}>✕</button>
              </div>
              <div className="three-col">
                <Field label="Media Buyer">
                  <select className="fsel" value={b.name} onChange={(e) => updateBuyer(b.id, { name: e.target.value })}>
                    <option value="">— Select —</option>
                    {canonical.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </Field>
                <Field label="Ad Account (optional)">
                  <input className="fi" value={b.ad_account || ""} onChange={(e) => updateBuyer(b.id, { ad_account: e.target.value })} />
                </Field>
                <Field label="Ad Spend (₹)">
                  <NumInput value={b.ad_spend} onChange={(v) => updateBuyer(b.id, { ad_spend: v })} prefix="₹" />
                </Field>
                <Field label="Leads"><NumInput value={b.leads || 0} onChange={(v) => updateBuyer(b.id, { leads: v })} /></Field>
                <Field label="Registrations"><NumInput value={b.registrations || 0} onChange={(v) => updateBuyer(b.id, { registrations: v })} /></Field>
                <Field label="Tickets Sold"><NumInput value={b.tickets_sold || 0} onChange={(v) => updateBuyer(b.id, { tickets_sold: v })} /></Field>
                <Field label="Sales Attributed"><NumInput value={b.sales_count || 0} onChange={(v) => updateBuyer(b.id, { sales_count: v })} /></Field>
                <Field label="Revenue Attributed (₹)"><NumInput value={b.revenue_attributed || 0} onChange={(v) => updateBuyer(b.id, { revenue_attributed: v })} prefix="₹" /></Field>
                <Field label="Revenue Collected (₹)"><NumInput value={b.revenue_collected || 0} onChange={(v) => updateBuyer(b.id, { revenue_collected: v })} prefix="₹" /></Field>
              </div>
            </div>
          ))}
          <button className="add-mb-btn" onClick={addBuyer}>+ Add Media Buyer</button>
        </div>
        <div style={{ marginTop: 12, textAlign: "right", fontSize: 12, color: "#888" }}>
          Total Ad Spend: <strong style={{ color: "#0a0a0a", fontSize: 14 }}>{inr(totalAdSpend)}</strong>
        </div>
      </Section>

      {/* Section 5 — Program Sales */}
      <Section title="Program Sales" sub="Revenue from program/course sales made at the event.">
        <div className="three-col">
          <Field label="Program Price (₹)"><NumInput value={programPrice} onChange={setProgramPrice} prefix="₹" /></Field>
          <Field label="Number of Sales"><NumInput value={salesCount} onChange={setSalesCount} /></Field>
          <Field label={`Booked Revenue (auto ${inr(bookedRevenueComputed)})`}>
            <input className="fi" placeholder={String(bookedRevenueComputed)} value={bookedRevenueOverride} onChange={(e) => setBookedRevenueOverride(e.target.value)} />
          </Field>
          <Field label="Revenue Collected (₹)"><NumInput value={revenueCollected} onChange={setRevenueCollected} prefix="₹" /></Field>
          <Field label="Revenue Pending (₹)"><NumInput value={revenuePending} onChange={setRevenuePending} prefix="₹" /></Field>
          <Field label="Refunds / Adjustments (₹)"><NumInput value={refundsAdjustments} onChange={setRefundsAdjustments} prefix="₹" /></Field>
        </div>
      </Section>

      {/* Section 6 — Bird's-eye dashboard */}
      <Section title="Bird's-Eye View" sub="Live profitability calculated from inputs above.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          <Stat lbl="Tickets Sold" val={String(ticketsSold)} />
          <Stat lbl="Ticket Revenue" val={inr(ticketRevenue)} />
          <Stat lbl="Total Ad Spend" val={inr(totalAdSpend)} />
          <Stat lbl="Total Event Cost" val={inr(totalEventCost)} />
          <Stat lbl="Total Cost" val={inr(totalCost)} />
          <Stat lbl="Program Sales" val={String(salesCount)} />
          <Stat lbl="Program Revenue" val={inr(bookedRevenue)} />
          <Stat lbl="Revenue Collected" val={inr(revenueCollected)} />
          <Stat lbl="Revenue Pending" val={inr(revenuePending)} />
          <Stat lbl="Net Profit" val={inr(netProfit)} tone={netProfit >= 0 ? "grn" : "red"} />
          <Stat lbl="Realized ROAS" val={realizedRoas == null ? "N/A" : realizedRoas.toFixed(2) + "×"} tone="gold" />
          <Stat lbl="Profit ROI" val={profitRoi == null ? "N/A" : (profitRoi * 100).toFixed(1) + "%"} tone="gold" />
        </div>
        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          <Stat lbl="Cost / Attendee" val={costPerAttendee == null ? "N/A" : inr(costPerAttendee)} />
          <Stat lbl="Cost / Sale" val={costPerSale == null ? "N/A" : inr(costPerSale)} />
          <Stat lbl="Break-even Sales" val={breakEvenSales == null ? "N/A" : Math.ceil(breakEvenSales).toString()} />
          <Stat lbl="Net Margin" val={netProfitMargin == null ? "N/A" : (netProfitMargin * 100).toFixed(1) + "%"} />
        </div>
      </Section>

      {/* Media buyer performance */}
      {buyers.length > 0 && (
        <Section title="Media Buyer Performance">
          <div style={{ border: "1px solid #E8E5DE", borderRadius: 10, overflow: "hidden" }}>
            <table className="attr-table">
              <thead>
                <tr>
                  <th>Media Buyer</th><th>Ad Spend</th><th>Leads</th><th>Tickets</th>
                  <th>Sales</th><th>Revenue Attr.</th><th>Collected</th><th>ROAS</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {buyers.map((b) => {
                  const r = safeDiv(num(b.revenue_attributed), num(b.ad_spend));
                  let status = "Data Missing";
                  if (b.name && num(b.ad_spend) > 0 && num(b.revenue_attributed) > 0) {
                    status = r != null && r >= 3 ? "Strong" : "Needs Review";
                  } else if (b.name && num(b.ad_spend) > 0) status = "Unattributed";
                  return (
                    <tr key={b.id}>
                      <td>{b.name || "—"}</td>
                      <td>{inr(num(b.ad_spend))}</td>
                      <td>{num(b.leads)}</td>
                      <td>{num(b.tickets_sold)}</td>
                      <td>{num(b.sales_count)}</td>
                      <td>{inr(num(b.revenue_attributed))}</td>
                      <td>{inr(num(b.revenue_collected))}</td>
                      <td>{r == null ? "—" : r.toFixed(2) + "×"}</td>
                      <td><span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 12, background: "#F7F6F3", color: "#0a0a0a" }}>{status}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 24, paddingTop: 16, borderTop: "1px solid #E8E5DE" }}>
        <button className="btn btn-g" onClick={copySummary}>📋 Copy Founder Summary</button>
        <button className="btn btn-g" onClick={exportCsv}>📁 Export CSV</button>
        <button className="btn btn-k" disabled={saving} onClick={save}>
          {saving ? "Saving…" : loadedId ? "Update Report" : "Save Report"}
        </button>
      </div>
    </div>
  );
}

// ───── small components ─────
function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="step-card" style={{ padding: 22 }}>
      <div style={{ marginBottom: 16 }}>
        <div className="step-title">{title}</div>
        {sub && <div className="step-sub">{sub}</div>}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="fl">{label}</label>
      {children}
    </div>
  );
}

function NumInput({ value, onChange, prefix }: { value: number; onChange: (v: number) => void; prefix?: string }) {
  return (
    <div style={{ position: "relative" }}>
      {prefix && <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#888", fontSize: 12, pointerEvents: "none" }}>{prefix}</span>}
      <input
        className="fi"
        style={prefix ? { paddingLeft: 22 } : undefined}
        type="number"
        inputMode="decimal"
        value={value === 0 ? "" : String(value)}
        onChange={(e) => onChange(num(e.target.value))}
      />
    </div>
  );
}

function Stat({ lbl, val, tone }: { lbl: string; val: string; tone?: "gold" | "grn" | "red" }) {
  const bg = tone === "gold" ? "#FBF6E9" : tone === "grn" ? "#F0FDF4" : tone === "red" ? "#FEF2F2" : "#fff";
  const border = tone === "gold" ? "#E8D49A" : tone === "grn" ? "#BBF7D0" : tone === "red" ? "#FECACA" : "#E8E5DE";
  const color = tone === "gold" ? "#C8A84B" : tone === "grn" ? "#16A34A" : tone === "red" ? "#DC2626" : "#0a0a0a";
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".12em", color: "#888", marginBottom: 6 }}>{lbl}</div>
      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 500, color, lineHeight: 1 }}>{val}</div>
    </div>
  );
}
