import { json, corsHeaders } from "@/lib/http";
import { storeHealth } from "@/lib/store";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { headers: corsHeaders });
}

export function GET() {
  return json({ service: "northstar-observability", ...storeHealth() });
}
