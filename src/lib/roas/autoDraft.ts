// Supabase draft sync for ROAS Auto Wizard v6.
// Mirrors the localStorage draft to roas_calculation_drafts (per user).

import { supabase } from "@/integrations/supabase/client";
import type { RevenueConfig } from "./attributionEngine";

export type DraftPayload = {
  step: number;
  webinar: any;
  masterUrl: string;
  spreadsheetId: string;
  spreadsheetTitle: string;
  detectedTabs: any[];
  tabRoles: any[];
  adSpends: Record<string, string>;
  results: any;
  resultsStatus: "fresh" | "outdated" | null;
  savedSessionId: string | null;
  revenueConfig?: RevenueConfig | null;
};

const stepLabel = (n: number) =>
  n === 1 ? "webinar_details" : n === 2 ? "connect_sheet" : n === 3 ? "ad_spends" : "results";

let pending: ReturnType<typeof setTimeout> | null = null;
let lastJson = "";

export function scheduleDraftSync(userId: string, payload: DraftPayload, delayMs = 1500) {
  if (!userId) return;
  const json = JSON.stringify(payload);
  if (json === lastJson) return;
  lastJson = json;
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => { void pushDraft(userId, payload); }, delayMs);
}

export async function pushDraft(userId: string, p: DraftPayload) {
  if (!userId) return;
  try {
    // Find existing in-progress draft for this user + method
    const { data: existing } = await supabase
      .from("roas_calculation_drafts")
      .select("id")
      .eq("user_id", userId)
      .eq("calculation_method", "automatic_master_sheet")
      .eq("is_completed", false)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const row: any = {
      user_id: userId,
      calculation_method: "automatic_master_sheet",
      draft_name: p.webinar?.name || null,
      active_step: stepLabel(p.step),
      spreadsheet_id: p.spreadsheetId || null,
      master_sheet_url: p.masterUrl || null,
      master_sheet_title: p.spreadsheetTitle || null,
      webinar_details: p.webinar,
      detected_tabs: p.detectedTabs,
      tab_roles: p.tabRoles,
      column_mappings: p.tabRoles?.map((r: any) => ({
        sheetId: r.sheetId, tabName: r.tabName, columnMapping: r.columnMapping || null,
      })) || [],
      ad_spend_data: p.adSpends,
      result_snapshot: p.results,
      result_status: p.resultsStatus,
      saved_attribution_session_id: p.savedSessionId,
      is_completed: !!p.savedSessionId,
      revenue_config: p.revenueConfig ?? null,
      updated_at: new Date().toISOString(),
    };
    if (existing?.id) {
      await supabase.from("roas_calculation_drafts").update(row).eq("id", existing.id);
    } else {
      await supabase.from("roas_calculation_drafts").insert(row);
    }
  } catch {
    /* best-effort */
  }
}

export async function loadRemoteDraft(userId: string): Promise<DraftPayload | null> {
  if (!userId) return null;
  try {
    const { data } = await supabase
      .from("roas_calculation_drafts")
      .select("*")
      .eq("user_id", userId)
      .eq("calculation_method", "automatic_master_sheet")
      .eq("is_completed", false)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    const stepFromLabel: Record<string, number> = {
      webinar_details: 1, connect_sheet: 2, ad_spends: 3, results: 4,
    };
    return {
      step: stepFromLabel[data.active_step || "webinar_details"] || 1,
      webinar: data.webinar_details || {},
      masterUrl: data.master_sheet_url || "",
      spreadsheetId: data.spreadsheet_id || "",
      spreadsheetTitle: data.master_sheet_title || "",
      detectedTabs: (data.detected_tabs as any[]) || [],
      tabRoles: (data.tab_roles as any[]) || [],
      adSpends: (data.ad_spend_data as any) || {},
      results: data.result_snapshot,
      resultsStatus: (data.result_status as any) || null,
      savedSessionId: data.saved_attribution_session_id || null,
    };
  } catch {
    return null;
  }
}

export async function clearRemoteDraft(userId: string) {
  if (!userId) return;
  try {
    await supabase
      .from("roas_calculation_drafts")
      .delete()
      .eq("user_id", userId)
      .eq("calculation_method", "automatic_master_sheet")
      .eq("is_completed", false);
    lastJson = "";
  } catch { /* */ }
}
