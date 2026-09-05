import { json, corsHeaders } from "@/lib/http";
import { getAgent, getStore, heartbeat } from "@/lib/store";
import { summarizeAgent } from "@/lib/scoring";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { headers: corsHeaders });
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const agent = getAgent(id);
  if (!agent) return json({ error: "not found" }, 404);
  const store = getStore();
  const traces = store.traces.filter((t) => t.agentId === agent.id);
  const improvements = store.improvements.filter((i) => i.agentId === agent.id);
  return json({ agent, traces, improvements, stats: summarizeAgent(agent, store.traces) });
}

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const agent = heartbeat(id);
  if (!agent) return json({ error: "not found" }, 404);
  return json({ agent });
}
