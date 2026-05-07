import { supabase } from "@/integrations/supabase/client";

export async function syncSource(sourceId: string) {
  const { data, error } = await supabase.functions.invoke("roas-sync-source", { body: { sourceId } });
  if (error) throw error;
  return data;
}

export async function syncAll() {
  const { data, error } = await supabase.functions.invoke("roas-sync-source", { body: { allActive: true } });
  if (error) throw error;
  return data;
}
