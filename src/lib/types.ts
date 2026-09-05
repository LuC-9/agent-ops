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
export type ImprovementStatus = "open" | "accepted" | "dismissed";

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
