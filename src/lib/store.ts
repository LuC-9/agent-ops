import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { seedAgents, seedImprovements, seedTraces } from "./seed";
import { computeTrustScore, deriveAccuracy, deriveConfidence, reliabilityFromHistory } from "./scoring";
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
    if (!fs.existsSync(FILE)) return emptyStore();
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

function writeStore(store: StoreData) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(store, null, 2));
}

export function getStore(): StoreData {
  return readStore();
}

export function registerAgent(payload: RegisterAgentPayload): Agent {
  const store = readStore();
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
    writeStore(store);
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
  writeStore(store);
  return agent;
}

export function heartbeat(slugOrId: string) {
  const store = readStore();
  const agent = store.agents.find((a) => a.slug === slugOrId || a.id === slugOrId);
  if (!agent) return null;
  agent.status = "online";
  agent.lastHeartbeatAt = new Date().toISOString();
  writeStore(store);
  return agent;
}

export function ingestTrace(payload: IngestPayload): Trace {
  const store = readStore();
  const agent = store.agents.find((a) => a.id === payload.agentId || a.slug === payload.slug);
  if (!agent) {
    throw new Error("Unknown agent. Register it before ingesting traces.");
  }
  const startedAt = payload.startedAt ?? new Date().toISOString();
  const endedAt = payload.endedAt ?? new Date().toISOString();
  const latencyMs =
    payload.latencyMs ??
    Math.max(0, new Date(endedAt).getTime() - new Date(startedAt).getTime());
  const status = payload.status ?? (payload.error ? "error" : "ok");
  const accuracy = deriveAccuracy({
    response: payload.response,
    status,
    reported: payload.accuracy,
  });
  const confidence = deriveConfidence({
    reported: payload.confidence,
    response: payload.response,
    status,
  });
  const historical = reliabilityFromHistory(store.traces.filter((t) => t.agentId === agent.id));
  const trustScore =
    payload.trustScore ??
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
    request: payload.request,
    response: payload.response,
    systemPrompt: payload.systemPrompt ?? agent.systemPrompt,
    status,
    accuracy: Math.round(accuracy * 10) / 10,
    confidence: Math.round(confidence * 10) / 10,
    trustScore: Math.round(trustScore * 10) / 10,
    error: payload.error,
    logs: payload.logs ?? [],
    model: payload.model,
    tokens: payload.tokens,
  };
  store.traces.unshift(trace);
  agent.lastHeartbeatAt = endedAt;
  agent.status = status === "error" ? "degraded" : "online";
  writeStore(store);
  return trace;
}

export function updateImprovement(id: string, status: Improvement["status"]) {
  const store = readStore();
  const item = store.improvements.find((i) => i.id === id);
  if (!item) return null;
  item.status = status;
  writeStore(store);
  return item;
}

export function addImprovements(items: Omit<Improvement, "id" | "createdAt">[]) {
  const store = readStore();
  const created: Improvement[] = items.map((item) => ({
    ...item,
    id: `imp_${randomUUID().slice(0, 8)}`,
    createdAt: new Date().toISOString(),
  }));
  store.improvements.unshift(...created);
  writeStore(store);
  return created;
}

export function addCopilotTurns(turns: CopilotTurn[]) {
  const store = readStore();
  store.copilot.push(...turns);
  if (store.copilot.length > 80) {
    store.copilot = store.copilot.slice(-80);
  }
  writeStore(store);
}

export function getAgent(idOrSlug: string) {
  return readStore().agents.find((a) => a.id === idOrSlug || a.slug === idOrSlug) ?? null;
}

export function getTrace(id: string) {
  return readStore().traces.find((t) => t.id === id) ?? null;
}
