import type { Agent, Trace } from "./types";

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

export function reliabilityFromHistory(traces: Trace[]): number {
  if (traces.length === 0) return 80;
  const window = traces.slice(-25);
  const ok = window.filter((t) => t.status === "ok").length;
  return (ok / window.length) * 100;
}

export function computeTrustScore(input: {
  accuracy: number;
  confidence: number;
  status: "ok" | "error";
  historicalReliability: number;
}): number {
  const reliability = input.status === "error" ? input.historicalReliability * 0.35 : input.historicalReliability;
  return clamp(0.4 * input.accuracy + 0.3 * input.confidence + 0.3 * reliability);
}

export function deriveAccuracy(input: {
  response: string;
  status: "ok" | "error";
  reported?: number;
}): number {
  if (typeof input.reported === "number" && !Number.isNaN(input.reported)) {
    return clamp(input.reported);
  }
  if (input.status === "error") return clamp(18 + Math.min(input.response.length, 40) / 8);
  const lengthScore = Math.min(input.response.trim().length / 12, 55);
  const structureBonus = /[-*] |\d+\.|```/.test(input.response) ? 18 : 8;
  const hedgePenalty = /(i don't know|not sure|unable to)/i.test(input.response) ? 12 : 0;
  return clamp(28 + lengthScore + structureBonus - hedgePenalty);
}

export function deriveConfidence(input: {
  reported?: number;
  response: string;
  status: "ok" | "error";
}): number {
  if (typeof input.reported === "number" && !Number.isNaN(input.reported)) {
    return clamp(input.reported);
  }
  if (input.status === "error") return 22;
  const certainty = /(therefore|recommended|clearly|high confidence)/i.test(input.response) ? 12 : 0;
  return clamp(62 + certainty + Math.min(input.response.length / 40, 18));
}

export function summarizeAgent(agent: Agent, traces: Trace[]) {
  const mine = traces.filter((t) => t.agentId === agent.id);
  if (mine.length === 0) {
    return {
      agentId: agent.id,
      traces: 0,
      errorRate: 0,
      avgAccuracy: 0,
      avgConfidence: 0,
      avgTrust: 0,
      avgLatencyMs: 0,
    };
  }
  const errors = mine.filter((t) => t.status === "error").length;
  const sum = (key: "accuracy" | "confidence" | "trustScore" | "latencyMs") =>
    mine.reduce((acc, t) => acc + t[key], 0) / mine.length;
  return {
    agentId: agent.id,
    traces: mine.length,
    errorRate: errors / mine.length,
    avgAccuracy: sum("accuracy"),
    avgConfidence: sum("confidence"),
    avgTrust: sum("trustScore"),
    avgLatencyMs: sum("latencyMs"),
  };
}
