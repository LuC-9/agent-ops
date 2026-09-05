import { json, corsHeaders } from "@/lib/http";
import { getStore, getTrace } from "@/lib/store";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { headers: corsHeaders });
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const trace = getTrace(id);
  if (!trace) return json({ error: "not found" }, 404);
  const agent = getStore().agents.find((a) => a.id === trace.agentId) ?? null;
  return json({ trace, agent });
}
