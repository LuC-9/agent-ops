import { json, corsHeaders } from "@/lib/http";
import { analyzeStore, llmAugmentDetailed } from "@/lib/observability-agent";
import { addImprovements, getStore, ingestDashboardAi, recordAudit } from "@/lib/store";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { headers: corsHeaders });
}

export async function POST() {
  const store = getStore();
  const ideas = analyzeStore(store);
  if (ideas.length === 0) {
    return json({ improvements: [], note: "No new patterns beyond existing open items." });
  }
  const prompt = `Given this agent telemetry JSON, refine these improvement drafts. Keep titles. Return the same number of items as JSON array with keys title, rationale, suggestion.\nDrafts: ${JSON.stringify(ideas)}\nAgents: ${JSON.stringify(store.agents.map((a) => ({ id: a.id, name: a.name, prompt: a.systemPrompt, graph: a.graph })))}\nRecent errors: ${JSON.stringify(store.traces.filter((t) => t.status === "error").slice(0, 8))}`;
  const fallback = JSON.stringify(ideas);
  const detailed = await llmAugmentDetailed(prompt, fallback);
  ingestDashboardAi({
    request: `Analyze logs; draft improvements (${ideas.length})`,
    response: detailed.text,
    model: detailed.model,
    promptTokens: detailed.promptTokens,
    completionTokens: detailed.completionTokens,
    latencyMs: detailed.latencyMs,
    fallback: detailed.fallback,
    provider: detailed.provider,
    purpose: "analyst",
    node: "analyst.run",
    summary: `Analyzed logs; drafted ${ideas.length} suggestion(s)`,
  });
  recordAudit({
    action: "analyst.run",
    actor: "analyst",
    summary: `Analyzed logs; drafted ${ideas.length} suggestion(s)`,
  });
  let finalIdeas = ideas;
  try {
    const parsed = JSON.parse(detailed.text) as typeof ideas;
    if (Array.isArray(parsed) && parsed.length) {
      finalIdeas = ideas.map((idea, i) => ({
        ...idea,
        rationale: parsed[i]?.rationale ?? idea.rationale,
        suggestion: parsed[i]?.suggestion ?? idea.suggestion,
        title: parsed[i]?.title ?? idea.title,
      }));
    }
  } catch {
    /* heuristic drafts already good */
  }
  const created = addImprovements(finalIdeas);
  return json({ improvements: created });
}
