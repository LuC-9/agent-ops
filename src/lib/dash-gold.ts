import { getStore } from "./store";
import { priceForModel } from "./dash-state";
import type { Agent, LogEvent, Trace } from "./types";

export type ScopeQ = {
  project?: string;
  platform?: string;
  service?: string;
  time_range?: string;
  start?: string;
  end?: string;
};

export interface GoldSpan {
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
  span_name: string;
  span_kind: string;
  start_time: string;
  end_time: string;
  duration_ms: number;
  status_code: string;
  status_message: string | null;
  service_name: string;
  agent_name: string;
  conversation_id: string;
  model: string | null;
  gen_ai_input_tokens: number;
  gen_ai_output_tokens: number;
  llm_cost_total_usd: number;
  input_text: string | null;
  output_text: string | null;
  attributes_json: string;
  project_id: string;
  source_platform: string;
  ingested_at: string;
  is_tool: boolean;
}

export interface GoldLog {
  timestamp: string;
  service_name: string;
  environment: string;
  severity: string;
  message: string;
  trace_id: string;
  span_id: string;
  project_id: string;
}

export interface GoldMetric {
  timestamp: string;
  service_name: string;
  project_id: string;
  environment: string;
  category: string;
  metric_type: string;
  value: number;
  response_code: string | null;
  response_code_class: string | null;
  state: string | null;
  readiness_status: string | null;
  hist_count: number | null;
  hist_min: number | null;
  hist_max: number | null;
}

const PROJECT = "local";
const PLATFORM = "langgraph";

function estTokens(text: string) {
  return Math.max(1, Math.ceil((text || "").length / 4));
}

function csvSet(v?: string) {
  if (!v) return null;
  const s = new Set(v.split(",").map((x) => x.trim()).filter(Boolean));
  return s.size ? s : null;
}

export function timeWindow(q: ScopeQ): { start: Date; end: Date } {
  const end = q.end ? new Date(q.end) : new Date();
  if (q.time_range === "custom" && q.start) {
    return { start: new Date(q.start), end };
  }
  const map: Record<string, number> = {
    "5m": 5,
    "10m": 10,
    "30m": 30,
    "1h": 60,
    "6h": 360,
    "12h": 720,
    "1d": 1440,
    "3d": 4320,
    "5d": 7200,
    "7d": 10080,
    "15d": 21600,
    "1mo": 43200,
  };
  const mins = map[q.time_range || "1h"] ?? 60;
  return { start: new Date(end.getTime() - mins * 60_000), end };
}

function truncBucket(iso: string, range: string) {
  const d = new Date(iso);
  const mins = range === "5m" || range === "10m" || range === "30m" || range === "1h" ? 1 : range === "6h" || range === "12h" || range === "1d" ? 60 : 1440;
  if (mins === 1) {
    d.setSeconds(0, 0);
  } else if (mins === 60) {
    d.setMinutes(0, 0, 0);
  } else {
    d.setHours(0, 0, 0, 0);
  }
  return d.toISOString();
}

function toolish(node?: string) {
  const n = (node || "").toLowerCase();
  return ["gather", "correlate", "policy", "analyze", "retrieve", "tool", "scan"].some((k) => n.includes(k));
}

function levelToSev(level: LogEvent["level"]) {
  if (level === "error") return "ERROR";
  if (level === "warn") return "WARN";
  if (level === "debug") return "DEBUG";
  return "INFO";
}

export function buildGold() {
  const store = getStore();
  const byId = new Map(store.agents.map((a) => [a.id, a]));
  const spans: GoldSpan[] = [];
  const logs: GoldLog[] = [];

  for (const tr of store.traces) {
    const agent = byId.get(tr.agentId);
    const service = agent?.slug ?? tr.agentId;
    const agentName = agent?.name ?? tr.agentId;
    const model = tr.model || "unknown";
    const pin = tr.tokens?.prompt ?? estTokens(tr.request + (tr.systemPrompt || ""));
    const pout = tr.tokens?.completion ?? estTokens(tr.response || "");
    const price = priceForModel(model);
    const cost = (pin / 1e6) * price.input_cost + (pout / 1e6) * price.output_cost;
    const conv = tr.threadId || tr.agentId;
    const nodes = (agent?.graph.nodes?.length ? agent.graph.nodes : tr.logs.map((l) => l.node).filter(Boolean)) as string[];
    const n = Math.max(1, tr.logs.length || nodes.length || 1);
    const slice = tr.latencyMs / n;
    const t0 = new Date(tr.startedAt).getTime();

    const rootId = `${tr.id}_root`;
    const rootName = nodes[0] || "invoke";
    spans.push({
      trace_id: tr.id,
      span_id: rootId,
      parent_span_id: null,
      span_name: rootName,
      span_kind: "SERVER",
      start_time: tr.startedAt,
      end_time: tr.endedAt,
      duration_ms: tr.latencyMs,
      status_code: tr.status === "error" ? "ERROR" : "OK",
      status_message: tr.error ?? null,
      service_name: service,
      agent_name: agentName,
      conversation_id: conv,
      model,
      gen_ai_input_tokens: pin,
      gen_ai_output_tokens: pout,
      llm_cost_total_usd: Math.round(cost * 1e6) / 1e6,
      input_text: tr.request,
      output_text: tr.response || null,
      attributes_json: JSON.stringify({ "gen_ai.operation.name": "invoke", trust: tr.trustScore, accuracy: tr.accuracy }),
      project_id: PROJECT,
      source_platform: PLATFORM,
      ingested_at: tr.endedAt,
      is_tool: false,
    });

    const logRows = tr.logs.length
      ? tr.logs
      : nodes.map((node, i) => ({
          ts: new Date(t0 + i * slice).toISOString(),
          level: "info" as const,
          node,
          message: `Completed node ${node}`,
        }));

    logRows.forEach((log, i) => {
      const sid = `${tr.id}_n${i}`;
      const parent = i === 0 ? rootId : `${tr.id}_n${i - 1}`;
      const st = log.ts || new Date(t0 + i * slice).toISOString();
      const en = new Date(new Date(st).getTime() + slice).toISOString();
      const isTool = toolish(log.node);
      spans.push({
        trace_id: tr.id,
        span_id: sid,
        parent_span_id: parent,
        span_name: log.node || `step_${i}`,
        span_kind: isTool ? "CLIENT" : "INTERNAL",
        start_time: st,
        end_time: en,
        duration_ms: Math.round(slice),
        status_code: log.level === "error" ? "ERROR" : "OK",
        status_message: log.level === "error" ? log.message : null,
        service_name: service,
        agent_name: agentName,
        conversation_id: conv,
        model: log.node === "llm" || i === logRows.length - 1 ? model : null,
        gen_ai_input_tokens: 0,
        gen_ai_output_tokens: 0,
        llm_cost_total_usd: 0,
        input_text: null,
        output_text: null,
        attributes_json: JSON.stringify(
          isTool ? { "gen_ai.tool.name": log.node, "gen_ai.operation.name": "execute_tool" } : { node: log.node },
        ),
        project_id: PROJECT,
        source_platform: PLATFORM,
        ingested_at: tr.endedAt,
        is_tool: isTool,
      });
      logs.push({
        timestamp: st,
        service_name: service,
        environment: "local",
        severity: levelToSev(log.level),
        message: log.message,
        trace_id: tr.id,
        span_id: sid,
        project_id: PROJECT,
      });
    });
  }

  const metrics = synthesizeMetrics(spans, getStore().agents);
  return { spans, logs, metrics, agents: store.agents };
}

function synthesizeMetrics(spans: GoldSpan[], agents: Agent[]): GoldMetric[] {
  const out: GoldMetric[] = [];
  const bySvc = new Map<string, GoldSpan[]>();
  for (const s of spans.filter((x) => !x.parent_span_id)) {
    const arr = bySvc.get(s.service_name) ?? [];
    arr.push(s);
    bySvc.set(s.service_name, arr);
  }
  for (const [svc, rows] of bySvc) {
    for (const s of rows) {
      const cls = s.status_code === "ERROR" ? "5xx" : "2xx";
      out.push({
        timestamp: s.start_time,
        service_name: svc,
        project_id: PROJECT,
        environment: "local",
        category: "requests",
        metric_type: "run.googleapis.com/request_count",
        value: 1,
        response_code: s.status_code === "ERROR" ? "500" : "200",
        response_code_class: cls,
        state: agents.find((a) => a.slug === svc)?.status === "online" ? "active" : "idle",
        readiness_status: "ready",
        hist_count: null,
        hist_min: null,
        hist_max: null,
      });
      out.push({
        timestamp: s.start_time,
        service_name: svc,
        project_id: PROJECT,
        environment: "local",
        category: "latency",
        metric_type: "run.googleapis.com/request_latencies",
        value: s.duration_ms,
        response_code: null,
        response_code_class: cls,
        state: null,
        readiness_status: null,
        hist_count: 1,
        hist_min: s.duration_ms,
        hist_max: s.duration_ms,
      });
    }
    const last = rows[0];
    if (last) {
      out.push({
        timestamp: last.start_time,
        service_name: svc,
        project_id: PROJECT,
        environment: "local",
        category: "capacity",
        metric_type: "run.googleapis.com/container/instance_count",
        value: 1,
        response_code: null,
        response_code_class: null,
        state: "active",
        readiness_status: "ready",
        hist_count: null,
        hist_min: null,
        hist_max: null,
      });
      out.push({
        timestamp: last.start_time,
        service_name: svc,
        project_id: PROJECT,
        environment: "local",
        category: "capacity",
        metric_type: "run.googleapis.com/container/cpu/utilizations",
        value: 0.35,
        response_code: null,
        response_code_class: null,
        state: null,
        readiness_status: null,
        hist_count: null,
        hist_min: null,
        hist_max: null,
      });
      out.push({
        timestamp: last.start_time,
        service_name: svc,
        project_id: PROJECT,
        environment: "local",
        category: "capacity",
        metric_type: "run.googleapis.com/container/memory/utilizations",
        value: 0.42,
        response_code: null,
        response_code_class: null,
        state: null,
        readiness_status: null,
        hist_count: null,
        hist_min: null,
        hist_max: null,
      });
    }
  }
  return out;
}

export function filterSpans(spans: GoldSpan[], q: ScopeQ) {
  const { start, end } = timeWindow(q);
  const projects = csvSet(q.project);
  const platforms = csvSet(q.platform);
  const services = csvSet(q.service);
  return spans.filter((s) => {
    const t = new Date(s.start_time).getTime();
    if (t < start.getTime() || t > end.getTime()) return false;
    if (projects && !projects.has(s.project_id)) return false;
    if (platforms && !platforms.has(s.source_platform)) return false;
    if (services && !services.has(s.service_name)) return false;
    return true;
  });
}

export function filterLogs(logs: GoldLog[], q: ScopeQ & { severity?: string }) {
  const { start, end } = timeWindow(q);
  const projects = csvSet(q.project);
  const services = csvSet(q.service);
  return logs.filter((l) => {
    const t = new Date(l.timestamp).getTime();
    if (t < start.getTime() || t > end.getTime()) return false;
    if (projects && !projects.has(l.project_id)) return false;
    if (services && !services.has(l.service_name)) return false;
    if (q.severity && l.severity !== q.severity) return false;
    return true;
  });
}

export function filterMetrics(metrics: GoldMetric[], q: ScopeQ & Record<string, string | undefined>) {
  const { start, end } = timeWindow(q);
  const projects = csvSet(q.project);
  const services = csvSet(q.service);
  return metrics.filter((m) => {
    const t = new Date(m.timestamp).getTime();
    if (t < start.getTime() || t > end.getTime()) return false;
    if (projects && !projects.has(m.project_id)) return false;
    if (services && !services.has(m.service_name)) return false;
    if (q.category && m.category !== q.category) return false;
    if (q.metric_type && m.metric_type !== q.metric_type) return false;
    if (q.state && m.state !== q.state) return false;
    if (q.readiness && m.readiness_status !== q.readiness) return false;
    if (q.rclass && m.response_code_class !== q.rclass) return false;
    return true;
  });
}

export function quantile(values: number[], q: number) {
  const s = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!s.length) return 0;
  const i = (s.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  if (lo === hi) return s[lo];
  return s[lo] * (hi - i) + s[hi] * (i - lo);
}

export function groupBy<T, K extends string | number>(rows: T[], key: (r: T) => K) {
  const m = new Map<K, T[]>();
  for (const r of rows) {
    const k = key(r);
    const arr = m.get(k);
    if (arr) arr.push(r);
    else m.set(k, [r]);
  }
  return m;
}

export { truncBucket, PROJECT, PLATFORM };
