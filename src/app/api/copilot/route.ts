import { randomUUID } from "crypto";
import { json, corsHeaders } from "@/lib/http";
import { answerCopilot, llmAugmentDetailed } from "@/lib/observability-agent";
import { addCopilotTurns, getStore, ingestDashboardAi } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function OPTIONS() {
  return new Response(null, { headers: corsHeaders });
}

export function GET() {
  return json({ messages: getStore().copilot });
}

export async function POST(req: Request) {
  const body = await req.json();
  const question = String(body?.question ?? "").trim();
  if (!question) return json({ error: "question required" }, 400);
  const store = getStore();
  const heuristic = answerCopilot(store, question, body?.context);
  const context = JSON.stringify({
    question,
    agents: store.agents.map((a) => ({
      id: a.id,
      name: a.name,
      slug: a.slug,
      status: a.status,
      role: a.role,
    })),
    statsHint: store.traces.slice(0, 15).map((t) => ({
      id: t.id,
      agentId: t.agentId,
      status: t.status,
      accuracy: t.accuracy,
      confidence: t.confidence,
      trustScore: t.trustScore,
      error: t.error,
      request: t.request.slice(0, 160),
    })),
    improvements: store.improvements.slice(0, 8).map((i) => ({
      title: i.title,
      status: i.status,
      agentId: i.agentId,
      suggestion: i.suggestion.slice(0, 240),
    })),
    heuristic,
  });
  const detailed = await llmAugmentDetailed(
    `Answer the operator. Use only provided telemetry. Heuristic draft:\n${heuristic}\n\nTelemetry:\n${context}`,
    heuristic,
  );
  const now = new Date().toISOString();
  const user = { id: randomUUID(), role: "user" as const, content: question, createdAt: now };
  const assistant = { id: randomUUID(), role: "assistant" as const, content: detailed.text, createdAt: now };
  ingestDashboardAi({
    request: question,
    response: detailed.text,
    model: detailed.model,
    promptTokens: detailed.promptTokens,
    completionTokens: detailed.completionTokens,
    latencyMs: detailed.latencyMs,
    fallback: detailed.fallback,
    provider: detailed.provider,
    purpose: "copilot",
    node: "assistant.chat",
    summary: question.slice(0, 240),
  });
  addCopilotTurns([user, assistant]);
  return json({ answer: detailed.text, messages: getStore().copilot });
}
