import type { Agent, Trace } from "./types";
import { LIMITS } from "./limits";

export function derivedAgentStatus(agent: Agent, traces: Trace[]): Agent["status"] {
  const mine = traces.filter((t) => t.agentId === agent.id);
  const lastHb = agent.lastHeartbeatAt ? new Date(agent.lastHeartbeatAt).getTime() : 0;
  const stale = !lastHb || Date.now() - lastHb > LIMITS.staleHeartbeatMs;
  const recentError = mine.slice(0, 5).some((t) => t.status === "error");
  if (stale) return recentError ? "degraded" : "offline";
  if (recentError) return "degraded";
  return "online";
}

export function applyDerivedStatuses<T extends { agents: Agent[]; traces: Trace[] }>(store: T): T {
  store.agents = store.agents.map((agent) => ({
    ...agent,
    status: derivedAgentStatus(agent, store.traces),
  }));
  return store;
}
