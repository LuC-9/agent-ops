import { summarizeAgent } from "./scoring";
import { llmAugmentDetailed } from "./observability-agent";
import { getStore, ingestDashboardAi } from "./store";
import type { StoreData, Trace } from "./types";

function clip(s: string, n: number) {
  const t = (s || "").trim();
  return t.length <= n ? t : `${t.slice(0, n)}…`;
}

function agentOf(store: StoreData, trace: Trace) {
  return store.agents.find((a) => a.id === trace.agentId);
}

export function heuristicTraceSummary(store: StoreData, traceId: string) {
  const trace = store.traces.find((t) => t.id === traceId);
  if (!trace) return null;
  const agent = agentOf(store, trace);
  const nodes = trace.logs.map((l) => l.node).filter(Boolean);
  const errLogs = trace.logs.filter((l) => l.level === "error").map((l) => l.message);
  const lines = [
    `${agent?.name ?? trace.agentId} ran ${trace.status.toUpperCase()} in ${trace.latencyMs} ms (${trace.model ?? "unknown model"}).`,
    `Accuracy ${trace.accuracy.toFixed(1)}, confidence ${trace.confidence.toFixed(1)}, trust ${trace.trustScore.toFixed(1)}.`,
    nodes.length ? `Graph path: ${nodes.join(" → ")}.` : "",
    trace.error ? `Failure: ${trace.error}.` : "",
    errLogs.length ? `Error logs: ${errLogs.slice(0, 2).join("; ")}.` : "",
    `Operator asked: ${clip(trace.request, 220)}`,
    trace.response ? `Answered: ${clip(trace.response, 280)}` : "No response was produced.",
  ];
  return { trace, agent, text: lines.filter(Boolean).join(" ") };
}

export function heuristicFixHint(store: StoreData, traceId: string) {
  const base = heuristicTraceSummary(store, traceId);
  if (!base) return null;
  const { trace, agent } = base;
  const graph = agent?.graph.nodes.join(" → ") ?? "unknown graph";
  let hint: string;
  if (trace.status === "error" || /timeout/i.test(trace.error || "")) {
    hint = `Add a fallback after the failing node in ${graph}. Cap the tool timeout, return a degraded answer, and keep the runbook/score nodes reachable.`;
  } else if ((trace.calibrationGap ?? trace.confidence - trace.accuracy) > 12) {
    hint = `The score node is over-confident. Cap confidence at accuracy + 8 and ask a clarifying question when the gap is large.`;
  } else if (agent?.role === "research" && !/http|citation|source/i.test(trace.response)) {
    hint = `Require source_id on every claim in synthesize, and fail the score node if citations == 0.`;
  } else {
    hint = `Keep the happy path, but log retrieved evidence size and loop gather once if the answer is thin.`;
  }
  return { ...base, text: `${base.text} Next step: ${hint}` };
}

export function heuristicFleetBrief(store: StoreData) {
  const fleet = store.agents.filter((a) => a.role !== "observability");
  const skip = new Set(store.agents.filter((a) => a.role === "observability").map((a) => a.id));
  const traces = store.traces.filter((t) => !skip.has(t.agentId));
  const errors = traces.filter((t) => t.status === "error");
  const weakest = [...fleet]
    .map((a) => ({ a, s: summarizeAgent(a, traces) }))
    .sort((x, y) => x.s.avgTrust - y.s.avgTrust)[0];
  const topErr = errors[0];
  const lines = [
    `Fleet: ${fleet.length} agents, ${traces.length} traces, ${errors.length} errors (${traces.length ? Math.round((errors.length / traces.length) * 100) : 0}%).`,
    weakest
      ? `Weakest trust: ${weakest.a.name} at ${weakest.s.avgTrust.toFixed(1)} (accuracy ${weakest.s.avgAccuracy.toFixed(1)}, error rate ${Math.round(weakest.s.errorRate * 100)}%).`
      : "",
    topErr ? `Latest failure: ${topErr.id} — ${topErr.error || "low accuracy"} on "${clip(topErr.request, 120)}".` : "No recent errors.",
    `Open suggestions: ${store.improvements.filter((i) => i.status === "open").length}.`,
  ];
  return lines.filter(Boolean).join(" ");
}

export async function runAiInsight(kind: "trace" | "fix" | "fleet", traceId?: string) {
  const store = getStore();
  let draft: string;
  let prompt: string;
  if (kind === "fleet") {
    draft = heuristicFleetBrief(store);
    prompt = `Write a 5-7 sentence operator brief from this telemetry only. Name agents and numbers. End with the single highest-priority action.\n\n${draft}`;
  } else {
    if (!traceId) throw new Error("traceId required");
    const packed = kind === "fix" ? heuristicFixHint(store, traceId) : heuristicTraceSummary(store, traceId);
    if (!packed) throw new Error("trace not found");
    draft = packed.text;
    prompt =
      kind === "fix"
        ? `You are an observability engineer. Using only this trace, write: (1) 3-sentence summary (2) likely failing node (3) one concrete graph/prompt patch. Do not invent metrics.\n\n${draft}`
        : `Summarize this agent trace in 4-6 sentences for an on-call engineer. Cover outcome, scores, path, and what the user asked. Do not invent metrics.\n\n${draft}`;
  }
  const detailed = await llmAugmentDetailed(prompt, draft);
  const trace = ingestDashboardAi({
    request: kind === "fleet" ? "Write fleet brief" : kind === "fix" ? `Suggest a fix for ${traceId}` : `Summarize trace ${traceId}`,
    response: detailed.text,
    model: detailed.model,
    promptTokens: detailed.promptTokens,
    completionTokens: detailed.completionTokens,
    latencyMs: detailed.latencyMs,
    fallback: detailed.fallback,
    provider: detailed.provider,
    purpose: "copilot",
    node: `insight:${kind}`,
    summary: kind === "fleet" ? "Fleet brief" : kind === "fix" ? `Suggest a fix (${traceId})` : `Summarize trace (${traceId})`,
    relatedTraceId: kind === "fleet" ? undefined : traceId,
  });
  return { text: detailed.text, fallback: detailed.fallback, model: detailed.model, traceId: trace.id };
}
