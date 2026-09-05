import { json, corsHeaders } from "@/lib/http";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { headers: corsHeaders });
}

export function GET(req: Request) {
  const url = new URL(req.url);
  const agentId = url.searchParams.get("agentId");
  const status = url.searchParams.get("status");
  let traces = getStore().traces;
  if (agentId) traces = traces.filter((t) => t.agentId === agentId);
  if (status === "ok" || status === "error") traces = traces.filter((t) => t.status === status);
  return json({ traces });
}
