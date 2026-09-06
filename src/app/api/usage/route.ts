import { json, corsHeaders } from "@/lib/http";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { headers: corsHeaders });
}

export function GET() {
  const usages = getStore().usages;
  const totalTokens = usages.reduce((n, u) => n + u.promptTokens + u.completionTokens, 0);
  const byPurpose: Record<string, { calls: number; tokens: number }> = {};
  const byModel: Record<string, { calls: number; tokens: number }> = {};
  const byAgent: Record<string, { calls: number; tokens: number }> = {};
  for (const u of usages) {
    const tok = u.promptTokens + u.completionTokens;
    byPurpose[u.purpose] = byPurpose[u.purpose] ?? { calls: 0, tokens: 0 };
    byPurpose[u.purpose].calls += 1;
    byPurpose[u.purpose].tokens += tok;
    byModel[u.model] = byModel[u.model] ?? { calls: 0, tokens: 0 };
    byModel[u.model].calls += 1;
    byModel[u.model].tokens += tok;
    if (u.agentId) {
      byAgent[u.agentId] = byAgent[u.agentId] ?? { calls: 0, tokens: 0 };
      byAgent[u.agentId].calls += 1;
      byAgent[u.agentId].tokens += tok;
    }
  }
  return json({
    usages: usages.slice(0, 200),
    totals: {
      calls: usages.length,
      tokens: totalTokens,
      fallbacks: usages.filter((u) => u.fallback).length,
    },
    byPurpose,
    byModel,
    byAgent,
  });
}
