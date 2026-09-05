import { json, corsHeaders } from "@/lib/http";
import { analyzeStore, llmAugment } from "@/lib/observability-agent";
import { addImprovements, getStore } from "@/lib/store";

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
  const refined = await llmAugment(prompt, fallback);
  let finalIdeas = ideas;
  try {
    const parsed = JSON.parse(refined) as typeof ideas;
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
