import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const res = await fetch(`${SUPABASE_URL}/functions/v1/roas-sync-source`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SERVICE_KEY}`,
      "x-triggered-by": "cron",
    },
    body: JSON.stringify({ allActive: true }),
  });
  const body = await res.text();
  return new Response(body, { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
