import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { seedAgents, seedImprovements, seedTraces } from "./seed";
import { LIMITS } from "./limits";
import { computeTrustScore, deriveAccuracy, deriveConfidence, reliabilityFromHistory } from "./scoring";
import { applyDerivedStatuses } from "./status";
import { sanitizeIngest } from "./validate";
import type {
  Agent,
  CopilotTurn,
  Improvement,
  IngestPayload,
  RegisterAgentPayload,
  StoreData,
  Trace,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "observability.json");

function emptyStore(): StoreData {
  return {
    agents: structuredClone(seedAgents),
    traces: structuredClone(seedTraces),
    improvements: structuredClone(seedImprovements),
    copilot: [],
  };
}

function readStore(): StoreData {
  try {
    if (!fs.existsSync(FILE)) {
      const seeded = emptyStore();
      atomicWrite(seeded);
      return seeded;
    }
    const raw = fs.readFileSync(FILE, "utf8");
    const parsed = JSON.parse(raw) as StoreData;
    parsed.agents ??= [];
    parsed.traces ??= [];
    parsed.improvements ??= [];
    parsed.copilot ??= [];
    return parsed;
  } catch {
    return emptyStore();
  }
}

function atomicWrite(store: StoreData) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, FILE);
}

function mutate<T>(fn: (store: StoreData) => T): T {
  const store = readStore();
  const result = fn(store);
  if (store.traces.length > LIMITS.maxTraces) {
    store.traces = store.traces.slice(0, LIMITS.maxTraces);
  }
  atomicWrite(store);
  return result;
}

export function getStore(): StoreData {
  return applyDerivedStatuses(readStore());
}

export function registerAgent(payload: RegisterAgentPayload): Agent {
  return mutate((store) => {
    const existing = store.agents.find((a) => a.slug === payload.slug || a.id === payload.id);
    const now = new Date().toISOString();
    if (existing) {
      existing.name = payload.name;
      existing.description = payload.description;
      existing.role = payload.role;
      existing.systemPrompt = payload.systemPrompt;
      existing.graph = payload.graph;
      existing.version = payload.version ?? existing.version;
      existing.endpoint = payload.endpoint ?? existing.endpoint;
      existing.status = "online";
      existing.lastHeartbeatAt = now;
      return existing;
    }
    const agent: Agent = {
      id: payload.id ?? `agent_${randomUUID().slice(0, 8)}`,
      name: payload.name,
      slug: payload.slug,
      description: payload.description,
      role: payload.role,
      systemPrompt: payload.systemPrompt,
      graph: payload.graph,
      version: payload.version ?? "1.0.0",
      endpoint: payload.endpoint,
      status: "online",
      lastHeartbeatAt: now,
      createdAt: now,
    };
    store.agents.push(agent);
    return agent;
  });
}

export function heartbeat(slugOrId: string) {
  return mutate((store) => {
    const agent = store.agents.find((a) => a.slug === slugOrId || a.id === slugOrId);
    if (!agent) return null;
    agent.lastHeartbeatAt = new Date().toISOString();
    const recentError = store.traces.filter((t) => t.agentId === agent.id).slice(0, 5).some((t) => t.status === "error");
    agent.status = recentError ? "degraded" : "online";
    return agent;
  });
}

export function ingestTrace(payload: IngestPayload): Trace {
  const clean = sanitizeIngest(payload);
  return mutate((store) => {
    const agent = store.agents.find((a) => a.id === clean.agentId || a.slug === clean.slug);
    if (!agent) {
      throw new Error("Unknown agent. Register it before ingesting traces.");
    }
    const startedAt = clean.startedAt ?? new Date().toISOString();
    const endedAt = clean.endedAt ?? new Date().toISOString();
    const latencyMs =
      clean.latencyMs ??
      Math.max(0, new Date(endedAt).getTime() - new Date(startedAt).getTime());
    const status = clean.status ?? (clean.error ? "error" : "ok");
    const accuracy = deriveAccuracy({
      response: clean.response,
      status,
      reported: clean.accuracy,
    });
    const confidence = deriveConfidence({
      reported: clean.confidence,
      response: clean.response,
      status,
    });
    const historical = reliabilityFromHistory(store.traces.filter((t) => t.agentId === agent.id));
    const trustScore =
      clean.trustScore ??
      computeTrustScore({
        accuracy,
        confidence,
        status,
        historicalReliability: historical,
      });

    const trace: Trace = {
      id: `tr_${randomUUID().slice(0, 10)}`,
      agentId: agent.id,
      startedAt,
      endedAt,
      latencyMs,
      request: clean.request,
      response: clean.response,
      systemPrompt: clean.systemPrompt ?? agent.systemPrompt,
      status,
      accuracy: Math.round(accuracy * 10) / 10,
      confidence: Math.round(confidence * 10) / 10,
      trustScore: Math.round(trustScore * 10) / 10,
      error: clean.error,
      logs: clean.logs ?? [],
      model: clean.model,
      tokens: clean.tokens,
      threadId: clean.threadId,
      degraded: clean.degraded,
      calibrationGap: Math.round((confidence - accuracy) * 10) / 10,
    };
    store.traces.unshift(trace);
    agent.lastHeartbeatAt = endedAt;
    agent.status = status === "error" ? "degraded" : "online";
    autoImproveOnError(store, agent, trace);
    return trace;
  });
}

function autoImproveOnError(store: StoreData, agent: Agent, trace: Trace) {
  if (trace.status !== "error" || !trace.error) return;
  const title = `Recover from: ${trace.error.slice(0, 72)}`;
  const exists = store.improvements.some((i) => i.agentId === agent.id && i.title === title && i.status === "open");
  if (exists) return;
  store.improvements.unshift({
    id: `imp_${randomUUID().slice(0, 8)}`,
    agentId: agent.id,
    createdAt: new Date().toISOString(),
    title,
    rationale: `Ingested error on ${trace.id}. Node logs: ${trace.logs
      .filter((l) => l.level === "error")
      .map((l) => l.message)
      .slice(0, 2)
      .join("; ")}`,
    suggestion: `Add a fallback edge after the failing node in ${agent.name} (${agent.graph.nodes.join(" → ")}). Cap tool timeouts and return a degraded-but-useful answer.`,
    category: "reliability",
    severity: "high",
    relatedTraceIds: [trace.id],
    status: "open",
  });
}

export function updateImprovement(id: string, status: Improvement["status"]) {
  return mutate((store) => {
    const item = store.improvements.find((i) => i.id === id);
    if (!item) return null;
    item.status = status;
    return item;
  });
}

export function addImprovements(items: Omit<Improvement, "id" | "createdAt">[]) {
  return mutate((store) => {
    const created: Improvement[] = items.map((item) => ({
      ...item,
      id: `imp_${randomUUID().slice(0, 8)}`,
      createdAt: new Date().toISOString(),
    }));
    store.improvements.unshift(...created);
    return created;
  });
}

export function addCopilotTurns(turns: CopilotTurn[]) {
  mutate((store) => {
    store.copilot.push(...turns);
    if (store.copilot.length > LIMITS.maxCopilotTurns) {
      store.copilot = store.copilot.slice(-LIMITS.maxCopilotTurns);
    }
  });
}

export function getAgent(idOrSlug: string) {
  return getStore().agents.find((a) => a.id === idOrSlug || a.slug === idOrSlug) ?? null;
}

export function getTrace(id: string) {
  return getStore().traces.find((t) => t.id === id) ?? null;
}

export function storeHealth() {
  try {
    const store = getStore();
    return {
      ok: true,
      agents: store.agents.length,
      traces: store.traces.length,
      writable: true,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "store failed" };
  }
}
