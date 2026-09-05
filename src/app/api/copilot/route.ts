import { randomUUID } from "crypto";
import { json, corsHeaders } from "@/lib/http";
import { answerCopilot, llmAugment } from "@/lib/observability-agent";
import { addCopilotTurns, getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

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
  const heuristic = answerCopilot(store, question);
  const context = JSON.stringify({
    question,
    agents: store.agents,
    statsHint: store.traces.slice(0, 15).map((t) => ({
      id: t.id,
      agentId: t.agentId,
      status: t.status,
      accuracy: t.accuracy,
      confidence: t.confidence,
      trustScore: t.trustScore,
      error: t.error,
      request: t.request,
    })),
    improvements: store.improvements.slice(0, 10),
    heuristic,
  });
  const answer = await llmAugment(
    `Answer the operator. Use only provided telemetry. Heuristic draft:\n${heuristic}\n\nTelemetry:\n${context}`,
    heuristic,
  );
  const now = new Date().toISOString();
  const user = { id: randomUUID(), role: "user" as const, content: question, createdAt: now };
  const assistant = { id: randomUUID(), role: "assistant" as const, content: answer, createdAt: now };
  addCopilotTurns([user, assistant]);
  return json({ answer, messages: getStore().copilot });
}
