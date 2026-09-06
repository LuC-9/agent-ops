export type AgentStatus = "online" | "offline" | "degraded";
export type TraceStatus = "ok" | "error";
export type LogLevel = "debug" | "info" | "warn" | "error";
export type ImprovementCategory =
  | "prompt"
  | "graph"
  | "tooling"
  | "evaluation"
  | "reliability";
export type ImprovementSeverity = "low" | "medium" | "high";
export type ImprovementStatus = "open" | "accepted" | "dismissed" | "applied";
export type AuditAction =
  | "agent.register"
  | "agent.heartbeat"
  | "agent.invoke"
  | "suggestion.created"
  | "suggestion.accepted"
  | "suggestion.dismissed"
  | "suggestion.applied"
  | "copilot.asked"
  | "analyst.run";
export type AiPurpose = "agent" | "copilot" | "analyst" | "tool";

export interface AuditEvent {
  id: string;
  ts: string;
  action: AuditAction;
  actor: string;
  agentId?: string;
  traceId?: string;
  suggestionId?: string;
  summary: string;
  data?: Record<string, unknown>;
}

export interface AiUsage {
  id: string;
  ts: string;
  purpose: AiPurpose;
  model: string;
  agentId?: string;
  traceId?: string;
  node?: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  fallback: boolean;
  provider: "gemini" | "openai" | "local";
}

export interface AgentGraph {
  nodes: string[];
  edges: { from: string; to: string }[];
}

export interface Agent {
  id: string;
  name: string;
  slug: string;
  description: string;
  role: string;
  systemPrompt: string;
  graph: AgentGraph;
  version: string;
  status: AgentStatus;
  lastHeartbeatAt: string | null;
  createdAt: string;
  endpoint?: string;
}

export interface LogEvent {
  ts: string;
  level: LogLevel;
  node?: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface Trace {
  id: string;
  agentId: string;
  startedAt: string;
  endedAt: string;
  latencyMs: number;
  request: string;
  response: string;
  systemPrompt: string;
  status: TraceStatus;
  accuracy: number;
  confidence: number;
  trustScore: number;
  error?: string;
  logs: LogEvent[];
  model?: string;
  tokens?: { prompt: number; completion: number };
  threadId?: string;
  degraded?: boolean;
  calibrationGap?: number;
}

export interface Improvement {
  id: string;
  agentId: string;
  createdAt: string;
  title: string;
  rationale: string;
  suggestion: string;
  category: ImprovementCategory;
  severity: ImprovementSeverity;
  relatedTraceIds: string[];
  status: ImprovementStatus;
  source?: "auto" | "analyst" | "operator";
  promptPatch?: string;
  appliedAt?: string;
  actor?: string;
}

export interface CopilotTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface StoreData {
  agents: Agent[];
  traces: Trace[];
  improvements: Improvement[];
  copilot: CopilotTurn[];
  audit: AuditEvent[];
  usages: AiUsage[];
}

export interface AgentStats {
  agentId: string;
  traces: number;
  errorRate: number;
  avgAccuracy: number;
  avgConfidence: number;
  avgTrust: number;
  avgLatencyMs: number;
  calibrationGap: number;
}

export interface IngestPayload {
  agentId?: string;
  slug?: string;
  request: string;
  response: string;
  systemPrompt?: string;
  status?: TraceStatus;
  accuracy?: number;
  confidence?: number;
  trustScore?: number;
  error?: string;
  logs?: LogEvent[];
  startedAt?: string;
  endedAt?: string;
  latencyMs?: number;
  model?: string;
  tokens?: { prompt: number; completion: number };
  threadId?: string;
  degraded?: boolean;
  usages?: Omit<AiUsage, "id">[];
}

export interface RegisterAgentPayload {
  id?: string;
  name: string;
  slug: string;
  description: string;
  role: string;
  systemPrompt: string;
  graph: AgentGraph;
  version?: string;
  endpoint?: string;
}
