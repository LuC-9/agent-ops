import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { seedAgents, seedImprovements, seedTraces, SEED_REVISION, assistantAgent, ASSISTANT_AGENT_ID } from "./seed";
import { LIMITS } from "./limits";
import { computeTrustScore, deriveAccuracy, deriveConfidence, reliabilityFromHistory } from "./scoring";
import { applyDerivedStatuses } from "./status";
import { sanitizeIngest } from "./validate";
import type {
  Agent,
  AiPurpose,
  AiUsage,
  AuditEvent,
  CopilotTurn,
  Improvement,
  IngestPayload,
  RegisterAgentPayload,
  StoreData,
  Trace,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "observability.json");

function ensureAssistantAgent(store: StoreData) {
  if (!store.agents.some((a) => a.id === ASSISTANT_AGENT_ID || a.slug === assistantAgent.slug)) {
    store.agents.push(structuredClone(assistantAgent));
  }
}

function dashboardStepLogs(startedAt: string, endedAt: string, fallback: boolean) {
  const nodes = ["receive", "gather", "llm", "score"];
  const t0 = new Date(startedAt).getTime();
  const span = Math.max(4, new Date(endedAt).getTime() - t0);
  return nodes.map((node, i) => ({
    ts: new Date(t0 + (span * i) / nodes.length).toISOString(),
    level: "info" as const,
    node,
    message:
      node === "llm"
        ? fallback
          ? "Completed node llm (heuristic fallback)"
          : "Completed node llm"
        : `Completed node ${node}`,
  }));
}

function backfillDashboardAiTraces(store: StoreData) {
  ensureAssistantAgent(store);
  const agent = store.agents.find((a) => a.id === ASSISTANT_AGENT_ID);
  if (!agent) return;
  for (const u of store.usages) {
    if (u.purpose !== "copilot" && u.purpose !== "analyst") continue;
    if (u.traceId && store.traces.some((t) => t.id === u.traceId && t.agentId === ASSISTANT_AGENT_ID)) continue;
    const endedAt = u.ts;
    const startedAt = new Date(new Date(endedAt).getTime() - Math.max(1, u.latencyMs || 1)).toISOString();
    const reply = store.copilot.find((c) => c.role === "assistant" && Math.abs(new Date(c.createdAt).getTime() - new Date(u.ts).getTime()) < 8000);
    const question = u.summary || store.copilot.find((c) => c.role === "user" && Math.abs(new Date(c.createdAt).getTime() - new Date(u.ts).getTime()) < 8000)?.content || u.purpose;
    const trace: Trace = {
      id: `tr_${randomUUID().slice(0, 10)}`,
      agentId: agent.id,
      startedAt,
      endedAt,
      latencyMs: u.latencyMs || 1,
      request: question,
      response: reply?.content || "",
      systemPrompt: agent.systemPrompt,
      status: "ok",
      accuracy: u.fallback ? 62 : 88,
      confidence: u.fallback ? 70 : 86,
      trustScore: u.fallback ? 68 : 84,
      logs: dashboardStepLogs(startedAt, endedAt, u.fallback),
      model: u.model,
      tokens: { prompt: u.promptTokens, completion: u.completionTokens },
      degraded: u.fallback,
      calibrationGap: u.fallback ? 8 : -2,
    };
    store.traces.unshift(trace);
    u.traceId = trace.id;
    u.agentId = agent.id;
  }
}

function emptyStore(): StoreData {
  return {
    seedRevision: SEED_REVISION,
    agents: [...structuredClone(seedAgents), structuredClone(assistantAgent)],
    traces: structuredClone(seedTraces),
    improvements: structuredClone(seedImprovements),
    copilot: [],
    audit: [],
    usages: [],
  };
}

function mergeLiveAgents(seeded: StoreData, existing: StoreData) {
  for (const a of existing.agents) {
    const s = seeded.agents.find((x) => x.id === a.id || x.slug === a.slug);
    if (!s) continue;
    s.status = a.status;
    s.lastHeartbeatAt = a.lastHeartbeatAt;
    s.endpoint = a.endpoint ?? s.endpoint;
    s.systemPrompt = a.systemPrompt || s.systemPrompt;
    s.version = a.version || s.version;
  }
  seeded.copilot = existing.copilot ?? [];
}

function readStore(): StoreData {
  try {
    if (!fs.existsSync(FILE)) {
      const seeded = emptyStore();
      backfillIfEmpty(seeded);
      atomicWrite(seeded);
      return seeded;
    }
    const raw = fs.readFileSync(FILE, "utf8");
    const parsed = JSON.parse(raw) as StoreData;
    parsed.agents ??= [];
    parsed.traces ??= [];
    parsed.improvements ??= [];
    parsed.copilot ??= [];
    parsed.audit ??= [];
    parsed.usages ??= [];
    const hadAssistant = parsed.agents.some((a) => a.id === ASSISTANT_AGENT_ID);
    ensureAssistantAgent(parsed);
    const before = parsed.traces.length;
    backfillDashboardAiTraces(parsed);
    const backfilled = parsed.traces.length !== before || !hadAssistant;
    if (parsed.seedRevision !== SEED_REVISION) {
      const seeded = emptyStore();
      mergeLiveAgents(seeded, parsed);
      backfillIfEmpty(seeded);
      atomicWrite(seeded);
      return seeded;
    }
    if (backfilled || (parsed.audit.length === 0 && parsed.traces.length)) {
      if (parsed.audit.length === 0 && parsed.traces.length) backfillIfEmpty(parsed);
      atomicWrite(parsed);
    }
    return parsed;
  } catch {
    return emptyStore();
  }
}

function pushAudit(store: StoreData, event: Omit<AuditEvent, "id" | "ts"> & { ts?: string }) {
  store.audit.unshift({
    id: `aud_${randomUUID().slice(0, 10)}`,
    ts: event.ts ?? new Date().toISOString(),
    action: event.action,
    actor: event.actor,
    agentId: event.agentId,
    traceId: event.traceId,
    suggestionId: event.suggestionId,
    summary: event.summary,
    data: event.data,
  });
}

function pushUsage(store: StoreData, usage: Omit<AiUsage, "id">) {
  store.usages.unshift({
    id: `use_${randomUUID().slice(0, 10)}`,
    ...usage,
  });
}

function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}

function backfillIfEmpty(store: StoreData) {
  if (store.audit.length || store.usages.length) return;
  for (const tr of [...store.traces].reverse()) {
    pushAudit(store, {
      ts: tr.endedAt,
      action: "agent.invoke",
      actor: "agent-runtime",
      agentId: tr.agentId,
      traceId: tr.id,
      summary: `${tr.status} · ${tr.request.slice(0, 80)}`,
      data: { accuracy: tr.accuracy, trust: tr.trustScore, model: tr.model },
    });
    const promptTokens = tr.tokens?.prompt ?? estimateTokens(tr.request + tr.systemPrompt);
    const completionTokens = tr.tokens?.completion ?? estimateTokens(tr.response || "");
    pushUsage(store, {
      ts: tr.endedAt,
      purpose: "agent",
      model: tr.model ?? "unknown",
      agentId: tr.agentId,
      traceId: tr.id,
      promptTokens,
      completionTokens,
      latencyMs: tr.latencyMs,
      fallback: !tr.model || tr.model === "deterministic-pack",
      provider: (tr.model ?? "").includes("gemini") ? "gemini" : tr.model?.includes("gpt") ? "openai" : "local",
    });
  }
  for (const imp of store.improvements) {
    pushAudit(store, {
      ts: imp.createdAt,
      action: "suggestion.created",
      actor: imp.source === "analyst" ? "analyst" : "system",
      agentId: imp.agentId,
      suggestionId: imp.id,
      summary: imp.title,
    });
  }
}

export function recordUsage(usage: Omit<AiUsage, "id">) {
  mutate((store) => {
    pushUsage(store, usage);
  });
}

export function recordAudit(event: Omit<AuditEvent, "id" | "ts"> & { ts?: string }) {
  mutate((store) => {
    pushAudit(store, event);
  });
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
  if (store.audit.length > LIMITS.maxAudit) store.audit = store.audit.slice(0, LIMITS.maxAudit);
  if (store.usages.length > LIMITS.maxUsages) store.usages = store.usages.slice(0, LIMITS.maxUsages);
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
      pushAudit(store, {
        action: "agent.register",
        actor: "agent-runtime",
        agentId: existing.id,
        summary: `Re-registered ${existing.name} v${existing.version}`,
      });
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
    pushAudit(store, {
      action: "agent.register",
      actor: "agent-runtime",
      agentId: agent.id,
      summary: `Onboarded ${agent.name}`,
    });
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

export function ingestTrace(payload: IngestPayload, opts?: {
  usagePurpose?: AiPurpose;
  skipAutoImprove?: boolean;
  usageExtra?: Pick<AiUsage, "summary" | "node" | "fallback" | "provider">;
}): Trace {
  const clean = sanitizeIngest(payload);
  return mutate((store) => {
    ensureAssistantAgent(store);
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
    pushAudit(store, {
      action: "agent.invoke",
      actor: agent.id === ASSISTANT_AGENT_ID ? "copilot" : "agent-runtime",
      agentId: agent.id,
      traceId: trace.id,
      summary: `${status}${clean.degraded ? " (degraded)" : ""} · ${clean.request.slice(0, 80)}`,
      data: { accuracy: trace.accuracy, trust: trace.trustScore, model: trace.model },
    });
    const promptTokens = clean.tokens?.prompt ?? estimateTokens(clean.request + (clean.systemPrompt ?? agent.systemPrompt));
    const completionTokens = clean.tokens?.completion ?? estimateTokens(clean.response || "");
    pushUsage(store, {
      ts: endedAt,
      purpose: opts?.usagePurpose ?? "agent",
      model: clean.model ?? "unknown",
      agentId: agent.id,
      traceId: trace.id,
      node: opts?.usageExtra?.node,
      summary: opts?.usageExtra?.summary,
      promptTokens,
      completionTokens,
      latencyMs,
      fallback: opts?.usageExtra?.fallback ?? (!clean.model || clean.model === "deterministic-pack"),
      provider: opts?.usageExtra?.provider ?? ((clean.model ?? "").includes("gemini") ? "gemini" : (clean.model ?? "").includes("gpt") ? "openai" : "local"),
    });
    for (const extra of clean.usages ?? []) {
      pushUsage(store, { ...extra, agentId: extra.agentId ?? agent.id, traceId: extra.traceId ?? trace.id });
    }
    if (!opts?.skipAutoImprove) autoImproveOnError(store, agent, trace);
    return trace;
  });
}

export function ingestDashboardAi(input: {
  request: string;
  response: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  fallback: boolean;
  provider: AiUsage["provider"];
  purpose: "copilot" | "analyst";
  node?: string;
  summary?: string;
  threadId?: string;
  relatedTraceId?: string;
}): Trace {
  const ended = new Date();
  const started = new Date(ended.getTime() - Math.max(1, input.latencyMs));
  const request = input.relatedTraceId && !input.request.includes(input.relatedTraceId)
    ? `${input.request} (subject ${input.relatedTraceId})`
    : input.request;
  return ingestTrace(
    {
      agentId: ASSISTANT_AGENT_ID,
      request,
      response: input.response,
      startedAt: started.toISOString(),
      endedAt: ended.toISOString(),
      latencyMs: input.latencyMs,
      model: input.model,
      tokens: { prompt: input.promptTokens, completion: input.completionTokens },
      degraded: input.fallback,
      threadId: input.threadId,
      logs: dashboardStepLogs(started.toISOString(), ended.toISOString(), input.fallback),
      accuracy: input.fallback ? 62 : 88,
      confidence: input.fallback ? 70 : 86,
    },
    {
      usagePurpose: input.purpose,
      skipAutoImprove: true,
      usageExtra: {
        summary: input.summary ?? input.request.slice(0, 240),
        node: input.node,
        fallback: input.fallback,
        provider: input.provider,
      },
    },
  );
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
    source: "auto",
  });
  pushAudit(store, {
    action: "suggestion.created",
    actor: "system",
    agentId: agent.id,
    suggestionId: store.improvements[0].id,
    traceId: trace.id,
    summary: title,
  });
}

export function updateImprovement(id: string, status: Improvement["status"], actor = "operator") {
  return mutate((store) => {
    const item = store.improvements.find((i) => i.id === id);
    if (!item) return null;
    item.status = status;
    item.actor = actor;
    if (status === "applied" && item.promptPatch) {
      const agent = store.agents.find((a) => a.id === item.agentId);
      if (agent && !agent.systemPrompt.includes(item.promptPatch)) {
        agent.systemPrompt = `${agent.systemPrompt.trim()}\n\n${item.promptPatch}`;
        item.appliedAt = new Date().toISOString();
      }
    }
    const action =
      status === "accepted" ? "suggestion.accepted" : status === "applied" ? "suggestion.applied" : status === "dismissed" ? "suggestion.dismissed" : "suggestion.created";
    if (status !== "open") {
      pushAudit(store, {
        action,
        actor,
        agentId: item.agentId,
        suggestionId: item.id,
        summary: `${status}: ${item.title}`,
      });
    }
    return item;
  });
}

export function addImprovements(items: Omit<Improvement, "id" | "createdAt">[]) {
  return mutate((store) => {
    const created: Improvement[] = [];
    for (const item of items) {
      const dup = store.improvements.some(
        (i) =>
          i.agentId === item.agentId &&
          i.title === item.title &&
          (i.status === "open" || i.status === "applied" || i.status === "accepted"),
      );
      if (dup) continue;
      const row: Improvement = {
        ...item,
        source: item.source ?? "analyst",
        id: `imp_${randomUUID().slice(0, 8)}`,
        createdAt: new Date().toISOString(),
      };
      store.improvements.unshift(row);
      created.push(row);
      pushAudit(store, {
        action: "suggestion.created",
        actor: "analyst",
        agentId: row.agentId,
        suggestionId: row.id,
        summary: row.title,
      });
    }
    return created;
  });
}

export function addCopilotTurns(turns: CopilotTurn[], meta?: {
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs?: number;
  fallback?: boolean;
  provider?: "gemini" | "openai" | "local";
}) {
  mutate((store) => {
    store.copilot.push(...turns);
    if (store.copilot.length > LIMITS.maxCopilotTurns) {
      store.copilot = store.copilot.slice(-LIMITS.maxCopilotTurns);
    }
    const question = turns.find((t) => t.role === "user");
    if (question) {
      pushAudit(store, {
        action: "copilot.asked",
        actor: "operator",
        summary: question.content.slice(0, 120),
      });
    }
    if (meta) {
      const model = meta.model ?? "unknown";
      pushUsage(store, {
        ts: new Date().toISOString(),
        purpose: "copilot",
        model,
        summary: question?.content.slice(0, 240),
        promptTokens: meta.promptTokens ?? estimateTokens(question?.content ?? ""),
        completionTokens: meta.completionTokens ?? estimateTokens(turns.find((t) => t.role === "assistant")?.content ?? ""),
        latencyMs: meta.latencyMs ?? 0,
        fallback: meta.fallback ?? false,
        provider: meta.provider ?? (model.includes("gemini") ? "gemini" : model.includes("gpt") ? "openai" : "local"),
      });
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
