import type { Agent, Improvement, Trace } from "./types";

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
    createdAt: iso(86_400_000),
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
    createdAt: iso(72_000_000),
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
    createdAt: iso(50_000_000),
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
    createdAt: iso(40_000_000),
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

function logs(
  agentNode: string[],
  start: number,
  extras: { level?: Trace["status"]; error?: string } = {},
): Trace["logs"] {
  const base = agentNode.map((node, i) => ({
    ts: iso(start - i * 400),
    level: "info" as const,
    node,
    message: `Completed node ${node}`,
  }));
  if (extras.error) {
    base.push({
      ts: iso(start - agentNode.length * 400),
      level: "error" as const,
      node: agentNode[agentNode.length - 1],
      message: extras.error,
    });
  }
  return base;
}

export const seedTraces: Trace[] = [
  {
    id: "tr_atlas_1",
    agentId: "agent_atlas",
    startedAt: iso(3_600_000),
    endedAt: iso(3_597_200),
    latencyMs: 2800,
    request: "What changed in LangGraph checkpointing between 0.2 and 1.x?",
    response:
      "LangGraph 1.x treats checkpointers as first-class persistence. Thread ids remain the unit of conversation, but the store API is split from the checkpointer. Migrate by constructing a Postgres/Sqlite saver and passing it to compile(checkpointer=...). Citations: LangGraph persistence docs.",
    systemPrompt: seedAgents[0].systemPrompt,
    status: "ok",
    accuracy: 86,
    confidence: 78,
    trustScore: 84,
    logs: logs(["plan", "gather", "synthesize", "score"], 3_597_200),
    model: "mock-atlas",
  },
  {
    id: "tr_helix_1",
    agentId: "agent_helix",
    startedAt: iso(2_400_000),
    endedAt: iso(2_398_900),
    latencyMs: 1100,
    request: "My invoice doubled this month and I want a refund.",
    response:
      "I can see this looks like a billing surprise. Policy: refunds over suspected usage spikes require usage logs, not an automatic credit. Next steps: 1) export usage for the last 30 days 2) open a billing ticket if the spike is unexplained. Escalating because the amount may exceed $500.",
    systemPrompt: seedAgents[1].systemPrompt,
    status: "ok",
    accuracy: 81,
    confidence: 74,
    trustScore: 80,
    logs: logs(["classify", "policy", "draft", "score"], 2_398_900),
    model: "mock-helix",
  },
  {
    id: "tr_forge_1",
    agentId: "agent_forge",
    startedAt: iso(1_800_000),
    endedAt: iso(1_797_400),
    latencyMs: 2600,
    request: "Review this Python handler that interpolates user input into SQL.",
    response:
      "Finding 1 (high): SQL injection via f-string. Use parameterized queries. Finding 2 (med): missing timeout on DB cursor. Residual risk: high until the query is parameterized.",
    systemPrompt: seedAgents[2].systemPrompt,
    status: "ok",
    accuracy: 91,
    confidence: 88,
    trustScore: 90,
    logs: logs(["parse", "analyze", "rank", "score"], 1_797_400),
    model: "mock-forge",
  },
  {
    id: "tr_sentinel_err",
    agentId: "agent_sentinel",
    startedAt: iso(900_000),
    endedAt: iso(898_200),
    latencyMs: 1800,
    request: "API latency p99 jumped from 120ms to 2.4s after the 18:10 deploy.",
    response: "",
    systemPrompt: seedAgents[3].systemPrompt,
    status: "error",
    accuracy: 22,
    confidence: 19,
    trustScore: 31,
    error: "Tool node correlate timed out while fetching service metrics",
    logs: logs(["triage", "correlate"], 898_200, {
      error: "Tool node correlate timed out while fetching service metrics",
    }),
    model: "mock-sentinel",
  },
  {
    id: "tr_atlas_2",
    agentId: "agent_atlas",
    startedAt: iso(420_000),
    endedAt: iso(416_500),
    latencyMs: 3500,
    request: "Summarize evaluation methods for LLM agent trust scores.",
    response:
      "Trust is usually a composite of task accuracy, calibration (confidence vs correctness), groundedness, and operational reliability. Common methods: LLM-as-judge, human spot checks, and online feedback. Caveat: judges correlate poorly on open-ended tasks unless rubrics are tight.",
    systemPrompt: seedAgents[0].systemPrompt,
    status: "ok",
    accuracy: 79,
    confidence: 71,
    trustScore: 78,
    logs: logs(["plan", "gather", "synthesize", "score"], 416_500),
    model: "mock-atlas",
  },
];

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
    relatedTraceIds: ["tr_sentinel_err"],
    status: "open",
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
    relatedTraceIds: ["tr_atlas_2"],
    status: "open",
  },
];
