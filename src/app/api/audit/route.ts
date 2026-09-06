import { json, corsHeaders } from "@/lib/http";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { headers: corsHeaders });
}

export function GET(req: Request) {
  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  const agentId = url.searchParams.get("agentId");
  let audit = getStore().audit;
  if (action) audit = audit.filter((e) => e.action === action);
  if (agentId) audit = audit.filter((e) => e.agentId === agentId);
  return json({ audit: audit.slice(0, 200) });
}
