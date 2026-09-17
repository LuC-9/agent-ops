import type { Agent, Improvement, Trace } from "./types";

export const SEED_REVISION = 4;

const now = Date.now();
const iso = (deltaMs: number) => new Date(now - deltaMs).toISOString();

export const seedAgents: Agent[] = [
  {
    id: "agent_atlas",
    name: "Atlas Research",
    slug: "atlas-research",
    description: "Multi-hop research agent that plans queries, gathers evidence, and synthesizes citations.",
    role: "research",
    version: "1.2.0",
    status: "offline",
    lastHeartbeatAt: null,
    createdAt: iso(40 * 86_400_000),
    graph: {
      nodes: ["plan", "gather", "regather", "synthesize", "score"],
      edges: [
        { from: "START", to: "plan" },
        { from: "plan", to: "gather" },
        { from: "gather", to: "synthesize" },
        { from: "synthesize", to: "score" },
        { from: "score", to: "END" },
      ],
    },
    systemPrompt: `You are Atlas, a careful research analyst.
Break the question into sub-queries, gather only evidence you can cite, and refuse to invent sources.
Return a concise brief with claims, caveats, and a self-reported confidence between 0 and 100.`,
  },
  {
    id: "agent_helix",
    name: "Helix Support",
    slug: "helix-support",
    description: "Tier-1 customer support agent that classifies intent, retrieves policy, and drafts replies.",
    role: "support",
    version: "1.0.4",
    status: "offline",
    lastHeartbeatAt: null,
    createdAt: iso(38 * 86_400_000),
    graph: {
      nodes: ["classify", "policy", "draft", "escalate", "score"],
      edges: [
        { from: "START", to: "classify" },
        { from: "classify", to: "policy" },
        { from: "policy", to: "draft" },
        { from: "draft", to: "score" },
        { from: "score", to: "END" },
      ],
    },
    systemPrompt: `You are Helix, a customer support specialist for Northstar Cloud.
Be empathetic, follow policy, never invent refunds or credits, and escalate billing disputes over $500.
Always include next steps the customer can take.`,
  },
  {
    id: "agent_forge",
    name: "Forge Code Review",
    slug: "forge-code-review",
    description: "Reviews diffs for defects, security issues, and missing tests, then ranks findings.",
    role: "code_review",
    version: "0.9.1",
    status: "offline",
    lastHeartbeatAt: null,
    createdAt: iso(36 * 86_400_000),
    graph: {
      nodes: ["parse", "analyze", "rank", "score"],
      edges: [
        { from: "START", to: "parse" },
        { from: "parse", to: "analyze" },
        { from: "analyze", to: "rank" },
        { from: "rank", to: "score" },
        { from: "score", to: "END" },
      ],
    },
    systemPrompt: `You are Forge, a senior code reviewer.
Prefer concrete, line-level findings. Flag injection, authz gaps, and race conditions first.
Do not rewrite the entire file. Rate residual risk and confidence.`,
  },
  {
    id: "agent_sentinel",
    name: "Sentinel Incident",
    slug: "sentinel-incident",
    description: "On-call incident agent that correlates symptoms, proposes blast-radius, and drafts runbooks.",
    role: "incident",
    version: "2.0.0",
    status: "offline",
    lastHeartbeatAt: null,
    createdAt: iso(35 * 86_400_000),
    graph: {
      nodes: ["triage", "correlate", "fallback", "runbook", "score"],
      edges: [
        { from: "START", to: "triage" },
        { from: "triage", to: "correlate" },
        { from: "correlate", to: "runbook" },
        { from: "runbook", to: "score" },
        { from: "score", to: "END" },
      ],
    },
    systemPrompt: `You are Sentinel, an incident commander assistant.
Classify severity, estimate blast radius, and propose the smallest safe mitigation.
    Never recommend deleting production data. Log uncertainty explicitly.`,
  },
];

export const ASSISTANT_AGENT_ID = "agent_northstar";
export const ASSISTANT_SLUG = "observability-assistant";

export const assistantAgent: Agent = {
  id: ASSISTANT_AGENT_ID,
  name: "Northstar Assistant",
  slug: ASSISTANT_SLUG,
  description: "Dashboard copilot: chart explain, fleet briefs, and trace summaries.",
  role: "observability",
  version: "1.0.0",
  status: "offline",
  lastHeartbeatAt: null,
  createdAt: iso(1 * 86_400_000),
  graph: {
    nodes: ["invoke", "receive", "gather", "llm", "score"],
    edges: [
      { from: "START", to: "invoke" },
      { from: "invoke", to: "receive" },
      { from: "receive", to: "gather" },
      { from: "gather", to: "llm" },
      { from: "llm", to: "score" },
      { from: "score", to: "END" },
    ],
  },
  systemPrompt: `You are the Northstar observability copilot.
Answer from local telemetry only. Cite trace ids and graph nodes. Do not invent metrics.`,
};

function logsAt(nodes: string[], endedAt: string, extras: { error?: string } = {}): Trace["logs"] {
  const t1 = new Date(endedAt).getTime();
  const base: Trace["logs"] = nodes.map((node, i) => {
    let level: "info" | "warn" | "error" | "debug" = "info";
    if (node === "regather" || node === "fallback" || node === "escalate") {
      level = "warn";
    } else if (node === "gather" || node === "parse" || node === "triage") {
      level = "debug";
    }
    return {
      ts: new Date(t1 - (nodes.length - 1 - i) * 400).toISOString(),
      level,
      node,
      message: level === "warn" ? `Warning on node ${node}: fallback/retry engaged` : `Completed node ${node}`,
    };
  });
  if (extras.error) {
    base.push({
      ts: endedAt,
      level: "error",
      node: nodes[nodes.length - 1],
      message: extras.error,
    });
  }
  return base;
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PROMPTS: Record<string, { request: string; response: string; nodes: string[] }[]> = {
  agent_atlas: [
    {
      nodes: ["plan", "gather", "synthesize", "score"],
      request: "What changed in LangGraph checkpointing between 0.2 and 1.x?",
      response:
        "LangGraph 1.x treats checkpointers as first-class persistence. Thread ids remain the unit of conversation. Citations: LangGraph persistence docs.",
    },
    {
      nodes: ["plan", "gather", "synthesize", "score"],
      request: "Summarize evaluation methods for LLM agent trust scores.",
      response:
        "Trust is usually a composite of task accuracy, calibration, groundedness, and operational reliability. Caveat: judges correlate poorly unless rubrics are tight.",
    },
    {
      nodes: ["plan", "gather", "synthesize", "score"],
      request: "Compare vector stores vs keyword search for agent memory.",
      response:
        "Hybrid retrieval usually wins: BM25 for identifiers, dense vectors for paraphrases. Cite Pinecone and Elasticsearch hybrid docs.",
    },
  ],
  agent_helix: [
    {
      nodes: ["classify", "policy", "draft", "score"],
      request: "My invoice doubled this month and I want a refund.",
      response:
        "Refunds over usage spikes require usage logs, not an automatic credit. Next: export 30-day usage, then open a billing ticket.",
    },
    {
      nodes: ["classify", "policy", "draft", "score"],
      request: "How do I rotate API keys without downtime?",
      response:
        "Create a second key, dual-write for 24h, then revoke the old key. Policy does not allow sharing keys in chat.",
    },
    {
      nodes: ["classify", "policy", "draft", "score"],
      request: "Can you upgrade my workspace to enterprise today?",
      response:
        "Enterprise upgrades are sales-assisted. I can open a request; I cannot apply credits or change SKUs myself.",
    },
  ],
  agent_forge: [
    {
      nodes: ["parse", "analyze", "rank", "score"],
      request: "Review this Python handler that interpolates user input into SQL.",
      response:
        "Finding 1 (high): SQL injection via f-string. Use parameterized queries. Residual risk: high until parameterized.",
    },
    {
      nodes: ["parse", "analyze", "rank", "score"],
      request: "Review a React form that stores JWTs in localStorage.",
      response:
        "Finding (med): XSS can steal the token. Prefer httpOnly cookies. Residual risk: medium.",
    },
    {
      nodes: ["parse", "analyze", "rank", "score"],
      request: "Review a worker that retries unbounded on 500s.",
      response:
        "Finding (high): retry storm. Cap attempts with jittered backoff. Residual risk: high.",
    },
  ],
  agent_sentinel: [
    {
      nodes: ["triage", "correlate", "runbook", "score"],
      request: "Checkout p99 timeout after the 18:10 deploy. Error rate 2.4% on payments-api.",
      response:
        "Severity SEV-2. Blast radius: checkout. Mitigation: rollback 18:10, keep SLO snapshot fallback. Uncertainty: metrics partial.",
    },
    {
      nodes: ["triage", "correlate", "runbook", "score"],
      request: "Auth service CPU 92% and login latency 4s.",
      response:
        "SEV-2 capacity. Scale auth replicas, shed non-critical token refresh. Do not flush sessions.",
    },
    {
      nodes: ["triage", "correlate"],
      request: "API latency p99 jumped from 120ms to 2.4s after the 18:10 deploy.",
      response: "",
    },
  ],
};

function buildMonthTraces(): Trace[] {
  const rand = mulberry32(20260910);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)]!;
  const traces: Trace[] = [];
  const dayMs = 86_400_000;
  const hourMs = 3_600_000;

  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);

  for (let day = 0; day < 30; day++) {
    const weekday = new Date(midnight.getTime() - day * dayMs).getDay();
    const weekend = weekday === 0 || weekday === 6;
    const burst = weekend ? 4 + Math.floor(rand() * 4) : 8 + Math.floor(rand() * 6);
    for (let i = 0; i < burst; i++) {
      const agent = pick(seedAgents);
      const pack = pick(PROMPTS[agent.id]!);
      const hour = weekend ? 10 + Math.floor(rand() * 8) : 8 + Math.floor(rand() * 12);
      const minute = Math.floor(rand() * 60);
      const started = Math.min(
        midnight.getTime() - day * dayMs + hour * hourMs + minute * 60_000,
        now - 30_000 - Math.floor(rand() * 120_000),
      );
      const latency = 700 + Math.floor(rand() * 3200);
      const ended = started + latency;
      const fail =
        agent.id === "agent_sentinel"
          ? rand() < 0.18
          : rand() < 0.06;
      const recent = day < 10;
      const model = recent
        ? rand() < 0.7
          ? "gemini-2.5-flash"
          : `mock-${agent.slug.split("-")[0]}`
        : rand() < 0.45
          ? "gemini-2.5-flash"
          : `mock-${agent.slug.split("-")[0]}`;
      const accuracy = fail ? 18 + rand() * 12 : 74 + rand() * 20;
      const confidence = fail ? 16 + rand() * 12 : 68 + rand() * 22;
      const reliability = fail ? 0.35 : 0.9;
      const trust = accuracy * 0.4 + confidence * 0.3 + reliability * 100 * 0.3;
      const promptTokens = 400 + Math.floor(rand() * 900);
      const completionTokens = fail ? 40 + Math.floor(rand() * 80) : 220 + Math.floor(rand() * 700);
      const error = fail ? "Tool node correlate timed out while fetching service metrics" : undefined;
      traces.push({
        id: `tr_seed_${day}_${i}_${agent.id.slice(-4)}`,
        agentId: agent.id,
        startedAt: new Date(started).toISOString(),
        endedAt: new Date(ended).toISOString(),
        latencyMs: latency,
        request: pack.request,
        response: fail ? "" : pack.response,
        systemPrompt: agent.systemPrompt,
        status: fail ? "error" : "ok",
        accuracy: Math.round(accuracy * 10) / 10,
        confidence: Math.round(confidence * 10) / 10,
        trustScore: Math.round(trust * 10) / 10,
        error,
        logs: logsAt(pack.nodes, new Date(ended).toISOString(), error ? { error } : {}),
        model,
        tokens: { prompt: promptTokens, completion: completionTokens },
        threadId: `${agent.id}-day${day}`,
        calibrationGap: Math.round((confidence - accuracy) * 10) / 10,
      });
    }
  }

  traces.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return traces;
}

export const seedTraces: Trace[] = buildMonthTraces();

export const seedImprovements: Improvement[] = [
  {
    id: "imp_sentinel_timeout",
    agentId: "agent_sentinel",
    createdAt: iso(800_000),
    title: "Add a metrics-fetch timeout fallback in correlate",
    rationale:
      "The correlate node failed once in the last hour by timing out. The graph has no recovery edge, so the runbook node never ran.",
    suggestion:
      "Add a correlate_fallback node that uses the last known SLO snapshot when live metrics time out, and route correlate -> correlate_fallback on tool errors. Cap the HTTP client at 800ms.",
    category: "reliability",
    severity: "high",
    relatedTraceIds: seedTraces.filter((t) => t.agentId === "agent_sentinel" && t.status === "error").slice(0, 3).map((t) => t.id),
    status: "open",
    source: "auto",
    promptPatch: "If live metrics time out, continue from the last SLO snapshot and mark the run degraded.",
  },
  {
    id: "imp_atlas_citations",
    agentId: "agent_atlas",
    createdAt: iso(300_000),
    title: "Require structured citations in the synthesize node",
    rationale:
      "Accuracy dipped on open-ended evaluation questions; responses mention sources but do not attach URLs or document ids.",
    suggestion:
      "Update the system prompt: every claim must include source_id. Fail the score node if citations < 1. Add a retrieve tool that returns {title, url, snippet}.",
    category: "prompt",
    severity: "medium",
    relatedTraceIds: seedTraces.filter((t) => t.agentId === "agent_atlas").slice(0, 2).map((t) => t.id),
    status: "open",
    source: "analyst",
    promptPatch: "Every factual claim must include a source_id. Fail the score node if citations == 0.",
  },
];
