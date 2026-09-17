import { randomUUID } from "crypto";
import { answerCopilot, llmAugmentDetailed, type DashContext } from "./observability-agent";
import { addCopilotTurns, getStore, ingestDashboardAi } from "./store";
import { runAiInsight } from "./ai-insights";
import {
  addPricing,
  createUser,
  deleteUser,
  findUser,
  getEngineFlag,
  getPipeline,
  listPricing,
  listUsers,
  patchPricing,
  patchUser,
  pipelineStatus,
  setEngineTelemetry,
  startPipeline,
} from "./dash-state";
import {
  PLATFORM,
  PROJECT,
  ScopeQ,
  buildGold,
  filterLogs,
  filterMetrics,
  filterSpans,
  groupBy,
  quantile,
  timeWindow,
  truncBucket,
  type GoldSpan,
} from "./dash-gold";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type Principal = {
  username: string;
  email: string;
  role: "admin" | "user";
  is_admin: boolean;
  projects: string[];
  allowed_projects: string[];
  access_mode: string;
};

function tokenFor(p: Principal) {
  return Buffer.from(JSON.stringify({ ...p, exp: Date.now() + 7 * 864e5 })).toString("base64url");
}

export function parseToken(header?: string | null): Principal | null {
  if (!header?.startsWith("Bearer ")) return null;
  try {
    const raw = JSON.parse(Buffer.from(header.slice(7), "base64url").toString("utf8"));
    if (!raw?.username || (raw.exp && raw.exp < Date.now())) return null;
    return raw as Principal;
  } catch {
    return null;
  }
}

function requireUser(p: Principal | null): Principal {
  if (!p) throw new HttpError(401, "unauthorized");
  return p;
}

function requireAdmin(p: Principal | null): Principal {
  const u = requireUser(p);
  if (!u.is_admin) throw new HttpError(403, "admin only");
  return u;
}

function qScope(sp: URLSearchParams): ScopeQ {
  return {
    project: sp.get("project") || undefined,
    platform: sp.get("platform") || undefined,
    service: sp.get("service") || undefined,
    time_range: sp.get("time_range") || "1h",
    start: sp.get("start") || undefined,
    end: sp.get("end") || undefined,
  };
}

function sessionFromUser(u: { username: string; role: string; allowed_projects: string[]; access_mode: string }): Principal {
  return {
    username: u.username,
    email: `${u.username}@local`,
    role: u.role as "admin" | "user",
    is_admin: u.role === "admin",
    projects: u.allowed_projects.length ? u.allowed_projects : [PROJECT],
    allowed_projects: u.allowed_projects,
    access_mode: u.access_mode,
  };
}

function roots(spans: GoldSpan[]) {
  return spans.filter((s) => !s.parent_span_id);
}

function aggTrace(rows: GoldSpan[]) {
  const root = rows.find((s) => !s.parent_span_id) ?? rows[0];
  const cost = rows.reduce((n, s) => n + (s.llm_cost_total_usd || 0), 0);
  const pin = rows.reduce((n, s) => n + (s.gen_ai_input_tokens || 0), 0);
  const pout = rows.reduce((n, s) => n + (s.gen_ai_output_tokens || 0), 0);
  return {
    trace_id: root.trace_id,
    service_name: root.service_name,
    project_id: root.project_id,
    source_platform: root.source_platform,
    agent_name: root.agent_name,
    start_time: rows.reduce((m, s) => (s.start_time < m ? s.start_time : m), root.start_time),
    root_span: root.span_name,
    duration_ms: root.duration_ms,
    status_code: root.status_code,
    conversation_id: root.conversation_id,
    cost_usd: Math.round(cost * 1e6) / 1e6,
    input_tokens: pin,
    output_tokens: pout,
    spans: rows.length,
    tokens: pin + pout,
  };
}

export async function handleDash(opts: {
  method: string;
  parts: string[];
  search: URLSearchParams;
  body: any;
  auth: string | null;
}): Promise<{ status: number; data: unknown }> {
  const { method, parts, search, body } = opts;
  const path = parts.join("/");
  const open =
    (method === "POST" && path === "login") ||
    (method === "POST" && path === "login/google") ||
    (method === "GET" && path === "config") ||
    (method === "GET" && path === "auth/iap");
  const principal = parseToken(opts.auth);
  if (!open) requireUser(principal);

  try {
    const data = await dispatch(method, parts, search, body, principal);
    return { status: 200, data };
  } catch (err) {
    if (err instanceof HttpError) return { status: err.status, data: { detail: err.message } };
    const status = (err as { status?: number }).status;
    if (status) return { status, data: { detail: (err as Error).message } };
    throw err;
  }
}

async function dispatch(
  method: string,
  parts: string[],
  sp: URLSearchParams,
  body: any,
  principal: Principal | null,
): Promise<unknown> {
  const path = parts.join("/");
  const gold = () => buildGold();
  const scoped = () => filterSpans(gold().spans, qScope(sp));

  if (method === "GET" && path === "config") {
    return { google_client_id: "", allowed_domain: "", google_oauth_scopes: "" };
  }
  if (method === "POST" && path === "login") {
    const u = findUser(String(body?.username || ""), String(body?.password || ""));
    if (!u) throw new HttpError(401, "invalid credentials");
    const p = sessionFromUser(u);
    return { token: tokenFor(p), user: p.username, role: p.role, allowed_projects: p.allowed_projects };
  }
  if (method === "POST" && path === "login/google") {
    throw new HttpError(501, "Google SSO is disabled in local mode");
  }
  if (method === "GET" && path === "auth/iap") {
    throw new HttpError(404, "IAP not available locally");
  }
  if (method === "GET" && path === "me") {
    const p = requireUser(principal);
    return p;
  }

  if (method === "GET" && path === "admin/users") {
    requireAdmin(principal);
    return listUsers();
  }
  if (method === "POST" && path === "admin/users") {
    requireAdmin(principal);
    return createUser({
      username: String(body.username || "").trim(),
      password: String(body.password || ""),
      role: body.role === "admin" ? "admin" : "user",
      allowed_projects: body.allowed_projects || [],
      access_mode: body.access_mode === "manual" ? "manual" : "auto",
    });
  }
  if (method === "PATCH" && parts[0] === "admin" && parts[1] === "users" && parts[2]) {
    const actor = requireAdmin(principal);
    return patchUser(parts[2], body || {}, actor.username);
  }
  if (method === "DELETE" && parts[0] === "admin" && parts[1] === "users" && parts[2]) {
    const actor = requireAdmin(principal);
    return deleteUser(parts[2], actor.username);
  }
  if (method === "GET" && path === "admin/projects") {
    requireAdmin(principal);
    return [{ project_id: PROJECT }];
  }

  if (method === "GET" && path === "config/pricing") return listPricing();
  if (method === "POST" && path === "config/pricing") {
    requireAdmin(principal);
    return addPricing({
      model_prefix: String(body.model_prefix || ""),
      input_cost: Number(body.input_cost),
      output_cost: Number(body.output_cost),
      active: body.active !== false,
      force: !!body.force,
    });
  }
  if (method === "PATCH" && parts[0] === "config" && parts[1] === "pricing" && parts[2]) {
    requireAdmin(principal);
    return patchPricing(parts[2], body || {});
  }

  if (method === "GET" && path === "filters/projects") {
    return [{ project_id: PROJECT }];
  }
  if (method === "GET" && path === "filters/platforms") {
    return [{ source_platform: PLATFORM }];
  }
  if (method === "GET" && path === "filters/services") {
    const { agents } = gold();
    return agents.map((a) => ({ service_name: a.slug }));
  }

  if (method === "GET" && path === "overview") {
    const spans = scoped();
    const root = roots(spans);
    const { start, end } = timeWindow(qScope(sp));
    const err = spans.filter((s) => s.status_code === "ERROR").length;
    const durs = root.map((s) => s.duration_ms);
    return {
      range: { start: start.toISOString(), end: end.toISOString() },
      kpis: {
        traces: new Set(spans.map((s) => s.trace_id)).size,
        spans: spans.length,
        cost_usd: round6(spans.reduce((n, s) => n + s.llm_cost_total_usd, 0)),
        input_tokens: spans.reduce((n, s) => n + s.gen_ai_input_tokens, 0),
        output_tokens: spans.reduce((n, s) => n + s.gen_ai_output_tokens, 0),
        services: new Set(spans.map((s) => s.service_name)).size,
        projects: new Set(spans.map((s) => s.project_id)).size,
        error_rate: spans.length ? round4(err / spans.length) : 0,
        p50_ms: Math.round(quantile(durs, 0.5) * 10) / 10,
        p95_ms: Math.round(quantile(durs, 0.95) * 10) / 10,
      },
    };
  }

  if (method === "GET" && path === "overview/timeseries") {
    const spans = scoped();
    const range = sp.get("time_range") || "1h";
    const buckets = groupBy(spans, (s) => truncBucket(s.start_time, range));
    return [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([bucket, rows]) => ({
        bucket,
        traces: new Set(rows.map((r) => r.trace_id)).size,
        cost_usd: round6(rows.reduce((n, r) => n + r.llm_cost_total_usd, 0)),
        input_tokens: rows.reduce((n, r) => n + r.gen_ai_input_tokens, 0),
        output_tokens: rows.reduce((n, r) => n + r.gen_ai_output_tokens, 0),
        errors: rows.filter((r) => r.status_code === "ERROR").length,
      }));
  }

  if (method === "GET" && path === "overview/finops") {
    const q = qScope(sp);
    const { start, end } = timeWindow(q);
    const spans = scoped();
    const byTrace = groupBy(spans, (s) => s.trace_id);
    let cost = 0,
      error_cost = 0,
      error_traces = 0;
    for (const rows of byTrace.values()) {
      const c = rows.reduce((n, r) => n + r.llm_cost_total_usd, 0);
      cost += c;
      if (rows.some((r) => r.status_code === "ERROR")) {
        error_cost += c;
        error_traces += 1;
      }
    }
    const dur = end.getTime() - start.getTime();
    const prevQ = { ...q, start: new Date(start.getTime() - dur).toISOString(), end: start.toISOString(), time_range: "custom" };
    const prevSpans = filterSpans(gold().spans, prevQ);
    const cost_prev = prevSpans.reduce((n, s) => n + s.llm_cost_total_usd, 0);
    const monthStart = new Date(end.getFullYear(), end.getMonth(), 1);
    const mtdSpans = filterSpans(gold().spans, {
      ...q,
      time_range: "custom",
      start: monthStart.toISOString(),
      end: end.toISOString(),
    });
    const days_elapsed = end.getDate();
    const days_in_month = new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate();
    return {
      cost: round6(cost),
      error_cost: round6(error_cost),
      error_traces,
      traces: byTrace.size,
      cost_prev: round6(cost_prev),
      mtd_cost: round6(mtdSpans.reduce((n, s) => n + s.llm_cost_total_usd, 0)),
      days_elapsed,
      days_in_month,
    };
  }

  if (method === "GET" && path === "traces") {
    const spans = scoped();
    const byTrace = [...groupBy(spans, (s) => s.trace_id).values()].map(aggTrace);
    byTrace.sort((a, b) => b.start_time.localeCompare(a.start_time));
    const page = Math.max(1, Number(sp.get("page") || 1));
    const pageSize = Math.max(1, Number(sp.get("page_size") || 50));
    const start = (page - 1) * pageSize;
    return { rows: byTrace.slice(start, start + pageSize), total: byTrace.length };
  }

  if (method === "GET" && parts[0] === "traces" && parts[1] && parts.length === 2) {
    const id = parts[1];
    const rows = gold().spans.filter((s) => s.trace_id === id);
    if (!rows.length) throw new HttpError(404, "not found");
    return rows;
  }

  if (method === "GET" && path === "logs") {
    const rows = filterLogs(gold().logs, { ...qScope(sp), severity: sp.get("severity") || undefined });
    rows.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    const page = Math.max(1, Number(sp.get("page") || 1));
    const pageSize = Math.max(1, Number(sp.get("page_size") || 50));
    const start = (page - 1) * pageSize;
    return { rows: rows.slice(start, start + pageSize), total: rows.length };
  }

  if (method === "GET" && path === "metrics/catalog") {
    const rows = filterMetrics(gold().metrics, qScope(sp));
    const uniq = (k: keyof (typeof rows)[0]) => [...new Set(rows.map((r) => r[k]).filter(Boolean))];
    return {
      categories: uniq("category"),
      metric_types: uniq("metric_type"),
      services: uniq("service_name"),
      states: uniq("state"),
      readiness: uniq("readiness_status"),
      response_classes: uniq("response_code_class"),
    };
  }

  if (method === "GET" && path === "metrics/summary") {
    const rows = filterMetrics(gold().metrics, {
      ...qScope(sp),
      state: sp.get("state") || undefined,
      readiness: sp.get("readiness") || undefined,
      rclass: sp.get("rclass") || undefined,
    });
    const req = rows.filter((r) => r.category === "requests");
    const lat = rows.filter((r) => r.category === "latency").map((r) => r.value);
    const inst = rows.filter((r) => (r.metric_type || "").includes("instance_count")).map((r) => r.value);
    const cpu = rows.filter((r) => (r.metric_type || "").includes("cpu/utilizations")).map((r) => r.value);
    const mem = rows.filter((r) => (r.metric_type || "").includes("memory/utilizations")).map((r) => r.value);
    const err = req.filter((r) => r.response_code_class === "4xx" || r.response_code_class === "5xx");
    return {
      total_requests: req.reduce((n, r) => n + r.value, 0),
      error_rate: req.length ? round4(err.reduce((n, r) => n + r.value, 0) / req.reduce((n, r) => n + r.value, 0)) : 0,
      mean_latency_ms: lat.length ? Math.round((lat.reduce((a, b) => a + b, 0) / lat.length) * 10) / 10 : 0,
      peak_instances: inst.length ? Math.max(...inst) : 0,
      peak_cpu_pct: cpu.length ? Math.round(Math.max(...cpu) * 1000) / 10 : 0,
      peak_mem_pct: mem.length ? Math.round(Math.max(...mem) * 1000) / 10 : 0,
      services: new Set(rows.map((r) => r.service_name)).size,
    };
  }

  if (method === "GET" && path === "metrics/timeseries") {
    const category = sp.get("category") || undefined;
    const group = sp.get("group") || "service_name";
    const agg = (sp.get("agg") || "").toLowerCase();
    const rows = filterMetrics(gold().metrics, {
      ...qScope(sp),
      category,
      metric_type: sp.get("metric_type") || undefined,
      state: sp.get("state") || undefined,
      readiness: sp.get("readiness") || undefined,
      rclass: sp.get("rclass") || undefined,
    });
    const range = sp.get("time_range") || "1h";
    const keyOf = (r: (typeof rows)[0]) => {
      if (group === "none") return "all";
      const rec = r as unknown as Record<string, unknown>;
      return String(rec[group] ?? "—");
    };
    const buckets = new Map<string, Map<string, number[]>>();
    for (const r of rows) {
      const b = truncBucket(r.timestamp, range);
      const k = keyOf(r);
      if (!buckets.has(b)) buckets.set(b, new Map());
      const inner = buckets.get(b)!;
      inner.set(k, [...(inner.get(k) || []), r.value]);
    }
    const out: { bucket: string; k: string; v: number }[] = [];
    for (const [bucket, inner] of [...buckets.entries()].sort()) {
      for (const [k, vals] of inner) {
        const v =
          agg === "avg"
            ? vals.reduce((a, b) => a + b, 0) / vals.length
            : agg === "max"
              ? Math.max(...vals)
              : vals.reduce((a, b) => a + b, 0);
        out.push({ bucket, k, v: Math.round(v * 10000) / 10000 });
      }
    }
    return out;
  }

  if (method === "GET" && path === "metrics") {
    const rows = filterMetrics(gold().metrics, {
      ...qScope(sp),
      category: sp.get("category") || undefined,
      metric_type: sp.get("metric_type") || undefined,
      state: sp.get("state") || undefined,
      readiness: sp.get("readiness") || undefined,
      rclass: sp.get("rclass") || undefined,
    });
    rows.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return rows.slice(0, Number(sp.get("limit") || 500));
  }

  if (method === "GET" && path === "cost") {
    const group_by = sp.get("group_by") || "service_name";
    const allowed = new Set(["service_name", "model", "project_id", "source_platform"]);
    if (!allowed.has(group_by)) throw new HttpError(400, "bad group_by");
    const spans = scoped().filter((s) => (s.llm_cost_total_usd || 0) > 0);
    const g = groupBy(spans, (s) => String((s as unknown as Record<string, unknown>)[group_by] ?? "—"));
    return [...g.entries()]
      .map(([key, rows]) => ({
        key,
        cost_usd: round6(rows.reduce((n, r) => n + r.llm_cost_total_usd, 0)),
        input_tokens: rows.reduce((n, r) => n + r.gen_ai_input_tokens, 0),
        output_tokens: rows.reduce((n, r) => n + r.gen_ai_output_tokens, 0),
        traces: new Set(rows.map((r) => r.trace_id)).size,
      }))
      .sort((a, b) => b.cost_usd - a.cost_usd)
      .slice(0, 50);
  }

  if (method === "GET" && path === "cost/agents") {
    const spans = scoped();
    const g = groupBy(spans, (s) => `${s.agent_name || s.service_name}|${s.project_id}`);
    return [...g.entries()]
      .map(([, rows]) => {
        const r0 = rows[0];
        const pin = rows.reduce((n, r) => n + r.gen_ai_input_tokens, 0);
        const pout = rows.reduce((n, r) => n + r.gen_ai_output_tokens, 0);
        return {
          agent: r0.agent_name || r0.service_name,
          service_name: r0.service_name,
          project_id: r0.project_id,
          platform: r0.source_platform,
          input_tokens: pin,
          output_tokens: pout,
          total_tokens: pin + pout,
          cost_usd: round6(rows.reduce((n, r) => n + r.llm_cost_total_usd, 0)),
          traces: new Set(rows.map((r) => r.trace_id)).size,
          tool_calls: rows.filter((r) => r.is_tool).length,
          models: [...new Set(rows.map((r) => r.model).filter(Boolean))].join(","),
          priced: true,
        };
      })
      .filter((r) => r.total_tokens > 0)
      .sort((a, b) => b.cost_usd - a.cost_usd)
      .slice(0, 200);
  }

  if (method === "GET" && path === "sessions") {
    const spans = scoped().filter((s) => s.conversation_id);
    const g = groupBy(spans, (s) => s.conversation_id);
    return [...g.entries()]
      .map(([conversation_id, rows]) => ({
        conversation_id,
        service_name: rows[0].service_name,
        turns: new Set(rows.map((r) => r.trace_id)).size,
        cost_usd: round6(rows.reduce((n, r) => n + r.llm_cost_total_usd, 0)),
        tokens: rows.reduce((n, r) => n + r.gen_ai_input_tokens + r.gen_ai_output_tokens, 0),
        first_seen: rows.reduce((m, r) => (r.start_time < m ? r.start_time : m), rows[0].start_time),
        last_seen: rows.reduce((m, r) => (r.end_time > m ? r.end_time : m), rows[0].end_time),
      }))
      .sort((a, b) => b.last_seen.localeCompare(a.last_seen))
      .slice(0, Number(sp.get("limit") || 200));
  }

  if (method === "GET" && parts[0] === "sessions" && parts[1]) {
    const cid = decodeURIComponent(parts[1]);
    const rows = gold().spans.filter((s) => s.conversation_id === cid);
    const g = groupBy(rows, (s) => s.trace_id);
    return [...g.values()].map(aggTrace).sort((a, b) => a.start_time.localeCompare(b.start_time));
  }

  if (method === "GET" && path === "tools") {
    const spans = scoped().filter((s) => s.is_tool || /tool/i.test(s.span_name));
    const g = groupBy(spans, (s) => {
      try {
        return JSON.parse(s.attributes_json)["gen_ai.tool.name"] || s.span_name;
      } catch {
        return s.span_name;
      }
    });
    return [...g.entries()]
      .map(([tool, rows]) => ({
        tool,
        service_name: rows[0].service_name,
        calls: rows.length,
        avg_ms: Math.round((rows.reduce((n, r) => n + r.duration_ms, 0) / rows.length) * 10) / 10,
        errors: rows.filter((r) => r.status_code === "ERROR").length,
      }))
      .sort((a, b) => b.calls - a.calls)
      .slice(0, 50);
  }

  if (method === "GET" && path === "search") {
    const q = (sp.get("q") || "").toLowerCase();
    if (q.length < 2) return {};
    const spans = gold().spans;
    const take = (vals: string[]) => [...new Set(vals.filter((v) => v.toLowerCase().includes(q)))].slice(0, 6);
    return {
      projects: take(spans.map((s) => s.project_id)),
      services: take(spans.map((s) => s.service_name)),
      models: take(spans.map((s) => s.model || "").filter(Boolean)),
      traces: take(spans.map((s) => s.trace_id).filter((id) => id.toLowerCase().startsWith(q))),
      conversations: take(spans.map((s) => s.conversation_id)),
    };
  }

  if (method === "GET" && path === "top/traces") {
    const by = sp.get("by") || "cost";
    const limit = Number(sp.get("limit") || 20);
    const rows = [...groupBy(scoped(), (s) => s.trace_id).values()].map(aggTrace);
    const order = by === "latency" ? "duration_ms" : by === "tokens" ? "tokens" : "cost_usd";
    rows.sort((a, b) => Number((b as any)[order] || 0) - Number((a as any)[order] || 0));
    return rows.slice(0, limit);
  }

  if (method === "GET" && path === "insights/flow") {
    const spans = scoped().filter((s) => s.llm_cost_total_usd && s.model);
    const g = groupBy(spans, (s) => `${s.project_id}|${s.service_name}|${s.model}`);
    return [...g.values()]
      .map((rows) => ({
        project_id: rows[0].project_id,
        service_name: rows[0].service_name,
        model: rows[0].model,
        cost: round6(rows.reduce((n, r) => n + r.llm_cost_total_usd, 0)),
        tokens: rows.reduce((n, r) => n + r.gen_ai_input_tokens + r.gen_ai_output_tokens, 0),
      }))
      .filter((r) => r.cost > 0)
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 500);
  }

  if (method === "GET" && path === "models") {
    const spans = scoped().filter((s) => s.model && !s.parent_span_id);
    const g = groupBy(spans, (s) => s.model || "—");
    return [...g.entries()]
      .map(([model, rows]) => ({
        model,
        calls: rows.length,
        traces: new Set(rows.map((r) => r.trace_id)).size,
        input_tokens: rows.reduce((n, r) => n + r.gen_ai_input_tokens, 0),
        output_tokens: rows.reduce((n, r) => n + r.gen_ai_output_tokens, 0),
        cost_usd: round6(rows.reduce((n, r) => n + r.llm_cost_total_usd, 0)),
      }))
      .sort((a, b) => b.cost_usd - a.cost_usd);
  }

  if (method === "GET" && path === "errors/by-service") {
    const spans = scoped();
    const g = groupBy(spans, (s) => s.service_name);
    return [...g.entries()]
      .map(([service_name, rows]) => {
        const errors = rows.filter((r) => r.status_code === "ERROR").length;
        return { service_name, spans: rows.length, errors, error_rate: round4(errors / rows.length) };
      })
      .filter((r) => r.errors > 0)
      .sort((a, b) => b.errors - a.errors);
  }

  if (method === "GET" && path === "errors/top") {
    const logs = filterLogs(gold().logs, qScope(sp)).filter((l) => l.severity === "ERROR" || l.severity === "FATAL");
    const g = groupBy(logs, (l) => l.message);
    return [...g.entries()]
      .map(([message, rows]) => ({
        message,
        service_name: rows[0].service_name,
        occurrences: rows.length,
        last_seen: rows.reduce((m, r) => (r.timestamp > m ? r.timestamp : m), rows[0].timestamp),
      }))
      .sort((a, b) => b.occurrences - a.occurrences)
      .slice(0, 50);
  }

  if (method === "GET" && path === "latency/timeseries") {
    const range = sp.get("time_range") || "1h";
    const root = roots(scoped());
    const buckets = groupBy(root, (s) => truncBucket(s.start_time, range));
    return [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([bucket, rows]) => {
        const d = rows.map((r) => r.duration_ms);
        return {
          bucket,
          p50_ms: Math.round(quantile(d, 0.5) * 10) / 10,
          p95_ms: Math.round(quantile(d, 0.95) * 10) / 10,
        };
      });
  }

  if (method === "GET" && path === "health") {
    const spans = gold().spans;
    const data_as_of = spans.reduce((m, s) => (s.start_time > m ? s.start_time : m), "");
    const last_ingest_at = spans.reduce((m, s) => (s.ingested_at > m ? s.ingested_at : m), "");
    const win = spans.filter((s) => Date.now() - new Date(s.start_time).getTime() < 48 * 3600_000);
    const g = groupBy(win, (s) => s.service_name);
    const dataAsOfMs = data_as_of ? new Date(data_as_of).getTime() : Date.now();
    return [...g.entries()].map(([service_name, rows]) => {
      const last_seen = rows.reduce((m, r) => (r.start_time > m ? r.start_time : m), rows[0].start_time);
      return {
        service_name,
        platform: rows[0].source_platform,
        project_id: rows[0].project_id,
        last_seen,
        traces_48h: new Set(rows.map((r) => r.trace_id)).size,
        cost_48h: round6(rows.reduce((n, r) => n + r.llm_cost_total_usd, 0)),
        error_rate: round4(rows.filter((r) => r.status_code === "ERROR").length / rows.length),
        minutes_since: Math.max(0, Math.round((dataAsOfMs - new Date(last_seen).getTime()) / 60000)),
        data_as_of,
        last_ingest_at,
        data_age_minutes: last_ingest_at ? Math.max(0, Math.round((Date.now() - new Date(last_ingest_at).getTime()) / 60000)) : 0,
      };
    });
  }

  if (method === "GET" && path === "platform/health") {
    const { traces, usages } = getStore();
    const last = traces[0]?.endedAt;
    const mins = last ? Math.max(0, Math.round((Date.now() - new Date(last).getTime()) / 60000)) : 0;
    return {
      ingest: [
        {
          project_id: PROJECT,
          signal: "traces",
          last_status: "OK",
          health: "OK",
          minutes_since_last_run: mins,
          failures_24h: 0,
          last_rows: traces.length,
          error_message: null,
        },
        {
          project_id: PROJECT,
          signal: "logs",
          last_status: "OK",
          health: "OK",
          minutes_since_last_run: mins,
          failures_24h: 0,
          last_rows: traces.reduce((n, t) => n + t.logs.length, 0),
          error_message: null,
        },
        {
          project_id: PROJECT,
          signal: "metrics",
          last_status: "OK",
          health: "OK",
          minutes_since_last_run: mins,
          failures_24h: 0,
          last_rows: usages.length,
          error_message: null,
        },
      ],
      logs: [
        {
          project_id: PROJECT,
          environment: "local",
          delivery: traces.some((t) => t.logs.length) ? "OK" : traces.length ? "NO_LOGS_BUT_TRACES" : "SILENT",
          log_rows_24h: traces.reduce((n, t) => n + t.logs.length, 0),
          trace_rows_24h: traces.length,
          metric_rows_24h: usages.length,
          minutes_since_log: mins,
        },
      ],
      transform: [
        { table_name: "local.spans", frontier_lag_min: mins, last_run_min_ago: mins, last_ingested_at: last || null },
        { table_name: "local.logs", frontier_lag_min: mins, last_run_min_ago: mins, last_ingested_at: last || null },
        { table_name: "local.metrics", frontier_lag_min: mins, last_run_min_ago: mins, last_ingested_at: last || null },
      ],
    };
  }

  if (method === "GET" && path === "platform/flow") {
    const { spans, logs, metrics } = gold();
    const days: Record<string, { traces: number; logs: number; metrics: number }> = {};
    const bump = (iso: string, k: "traces" | "logs" | "metrics") => {
      const day = iso.slice(0, 10);
      days[day] ??= { traces: 0, logs: 0, metrics: 0 };
      days[day][k] += 1;
    };
    for (const s of roots(spans)) bump(s.start_time, "traces");
    for (const l of logs) bump(l.timestamp, "logs");
    for (const m of metrics) bump(m.timestamp, "metrics");
    const out: any[] = [];
    for (const [day, c] of Object.entries(days)) {
      for (const layer of ["SDS", "SDDS", "CDS"]) {
        out.push({ project_id: PROJECT, signal: "traces", layer, day, row_count: c.traces });
        out.push({ project_id: PROJECT, signal: "logs", layer, day, row_count: c.logs });
        out.push({ project_id: PROJECT, signal: "metrics", layer, day, row_count: c.metrics });
      }
    }
    return out;
  }

  if (method === "GET" && path === "platform/pipeline") {
    const p = getPipeline();
    const health = await dispatch("GET", ["platform", "health"], sp, body, principal);
    const ingest = (health as any).ingest || [];
    const ingest_bad = ingest.filter((r: any) => !["OK", "CATCHING_UP"].includes(r.health)).length;
    return {
      running: p.state === "ACTIVE",
      status: p.state === "ACTIVE" ? "running" : ingest_bad ? "issue" : "idle",
      last_state: p.state,
      last_end: p.endedAt,
      ingest_bad,
      sink_bad: 0,
      max_lag_min: ingest[0]?.minutes_since_last_run || 0,
      schedule: "local JSON store (on demand)",
      history: p.history,
    };
  }

  if (method === "GET" && path === "meta/last-refresh") {
    const { traces } = getStore();
    const t = traces[0]?.endedAt || null;
    return { spans: t, logs: t, metrics: t };
  }

  if (method === "POST" && path === "refresh/pipeline") {
    requireAdmin(principal);
    return startPipeline();
  }
  if (method === "GET" && path === "refresh/status") {
    return pipelineStatus(sp.get("execution") || undefined);
  }

  if (method === "GET" && path === "ai/usage") {
    const q = qScope(sp);
    const { start, end } = timeWindow(q);
    const store = getStore();
    const asked = (store.audit || []).filter((a) => a.action === "copilot.asked");
    const rows = (store.usages || [])
      .filter((u) => {
        const t = new Date(u.ts).getTime();
        if (t < start.getTime() || t > end.getTime()) return false;
        return u.purpose === "copilot" || u.purpose === "analyst" || u.agentId === "agent_northstar";
      })
      .map((u) => {
        if (u.summary) return u;
        const ts = new Date(u.ts).getTime();
        const hit = asked.find((a) => Math.abs(new Date(a.ts).getTime() - ts) < 4000);
        return { ...u, summary: hit?.summary };
      });
    const tokens = rows.reduce((n, u) => n + u.promptTokens + u.completionTokens, 0);
    const lats = rows.map((u) => u.latencyMs).sort((a, b) => a - b);
    const p50 = lats.length ? lats[Math.floor(lats.length * 0.5)] : 0;
    const roll = (key: (u: (typeof rows)[0]) => string) => {
      const m: Record<string, { key: string; calls: number; tokens: number; fallbacks: number }> = {};
      for (const u of rows) {
        const k = key(u) || "—";
        m[k] = m[k] || { key: k, calls: 0, tokens: 0, fallbacks: 0 };
        m[k].calls += 1;
        m[k].tokens += u.promptTokens + u.completionTokens;
        if (u.fallback) m[k].fallbacks += 1;
      }
      return Object.values(m).sort((a, b) => b.calls - a.calls);
    };
    const byHour: Record<string, { bucket: string; calls: number; tokens: number; fallbacks: number }> = {};
    for (const u of rows) {
      const d = new Date(u.ts);
      d.setMinutes(0, 0, 0);
      const bucket = d.toISOString();
      byHour[bucket] = byHour[bucket] || { bucket, calls: 0, tokens: 0, fallbacks: 0 };
      byHour[bucket].calls += 1;
      byHour[bucket].tokens += u.promptTokens + u.completionTokens;
      if (u.fallback) byHour[bucket].fallbacks += 1;
    }
    return {
      usages: rows.slice(0, 500),
      totals: {
        calls: rows.length,
        tokens,
        fallbacks: rows.filter((u) => u.fallback).length,
        llm_calls: rows.filter((u) => !u.fallback).length,
        p50_ms: p50,
      },
      byPurpose: roll((u) => u.node?.startsWith("insight:") ? u.node : u.purpose),
      byModel: roll((u) => u.model),
      byProvider: roll((u) => u.provider),
      timeseries: Object.values(byHour).sort((a, b) => a.bucket.localeCompare(b.bucket)),
      transcript: (store.copilot || []).slice(-40),
    };
  }

  if (method === "POST" && path === "ai/insight") {
    const kind = body?.kind as "trace" | "fix" | "fleet";
    if (!["trace", "fix", "fleet"].includes(kind)) throw new HttpError(400, "kind must be trace, fix, or fleet");
    try {
      const out = await runAiInsight(kind, body?.traceId);
      return out;
    } catch (e) {
      throw new HttpError(400, e instanceof Error ? e.message : "insight failed");
    }
  }

  if (method === "POST" && path === "assistant/chat") {
    const question = String(body?.message || body?.question || "").trim();
    if (!question) throw new HttpError(400, "message required");
    const store = getStore();
    const dashboard = (body?.context || {}) as DashContext;
    const heuristic = answerCopilot(store, question, dashboard);
    const ctx = JSON.stringify({
      question,
      dashboard,
      agents: store.agents.map((a) => ({ id: a.id, name: a.name, slug: a.slug, status: a.status })),
      statsHint: store.traces.slice(0, 15).map((t) => ({
        id: t.id,
        agentId: t.agentId,
        status: t.status,
        accuracy: t.accuracy,
        trustScore: t.trustScore,
        error: t.error,
        request: t.request.slice(0, 160),
      })),
      heuristic,
    });
    const chartMode = Boolean(dashboard?.chart?.series?.length) || /explain.{0,80}(chart|trends)|this chart/i.test(question);
    const detailed = await llmAugmentDetailed(
      chartMode
        ? `Explain the dashboard chart the operator clicked. Use dashboard.chart series/axis numbers. Cover: (1) what the chart measures (2) what moved in this window (3) 2 concrete takeaways. Do not introduce yourself. Do not dump fleet onboarding stats. If a heuristic draft is present, tighten it — do not replace it with a generic copilot bio.\n\nTelemetry:\n${ctx}`
        : `Answer the operator's question directly. Use only provided telemetry. If the heuristic draft already answers it, refine that draft — do not replace it with a generic introduction.\nHeuristic draft:\n${heuristic}\n\nTelemetry:\n${ctx}`,
      heuristic,
    );
    const sessionId = body?.session_id || `local_${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const trace = ingestDashboardAi({
      request: question,
      response: detailed.text,
      model: detailed.model,
      promptTokens: detailed.promptTokens,
      completionTokens: detailed.completionTokens,
      latencyMs: detailed.latencyMs,
      fallback: detailed.fallback,
      provider: detailed.provider,
      purpose: "copilot",
      node: chartMode ? "insight:chart" : "assistant.chat",
      summary: question.slice(0, 240),
      threadId: sessionId,
    });
    addCopilotTurns(
      [
        { id: randomUUID(), role: "user", content: question, createdAt: now },
        { id: randomUUID(), role: "assistant", content: detailed.text, createdAt: now },
      ],
    );
    return { session_id: sessionId, reply: detailed.text, trace_id: trace.id };
  }

  if (path.startsWith("admin/agent-engines")) {
    requireAdmin(principal);
    return agentEngines(method, parts, body);
  }

  throw new HttpError(404, "not found");
}

function agentEngines(method: string, parts: string[], body: any) {
  const path = parts.slice(2).join("/");
  const { agents } = getStore();
  const scan = () => {
    const configured: any[] = [];
    const not_configured: any[] = [];
    for (const a of agents) {
      const flag = getEngineFlag(a.id);
      const info = {
        location: "local",
        display_name: a.name,
        engine_id: a.slug,
        create_time: a.createdAt,
        update_time: a.lastHeartbeatAt || a.createdAt,
        staging_bucket: "local://agents",
        framework: "langgraph",
        telemetry: flag.telemetry,
        status: flag.status,
      };
      if (flag.telemetry) configured.push(info);
      else not_configured.push(info);
    }
    return {
      scan_id: "local-scan",
      summary: {
        projects: 1,
        configured: configured.length,
        not_configured: not_configured.length,
        skipped: 0,
      },
      projects: [
        {
          project_id: PROJECT,
          project_number: "0",
          summary: {
            configured: configured.length,
            not_configured: not_configured.length,
            skipped: 0,
            total: agents.length,
          },
          configured,
          not_configured,
          skipped: [],
        },
      ],
    };
  };

  if (method === "GET" && path === "scans/latest") return scan();
  if (method === "POST" && path === "scans") return scan();
  if (method === "GET" && path === "scans/status") {
    return { running: false, completed_at: new Date().toISOString() };
  }
  if (method === "POST" && path === "telemetry") {
    const engine = agents.find((a) => a.slug === body?.engine_id || a.id === body?.engine_id);
    if (!engine) throw new HttpError(404, "engine not found");
    const flag = setEngineTelemetry(engine.id, true);
    return {
      location: "local",
      display_name: engine.name,
      engine_id: engine.slug,
      create_time: engine.createdAt,
      update_time: new Date().toISOString(),
      staging_bucket: "local://agents",
      framework: "langgraph",
      telemetry: flag.telemetry,
      status: flag.status,
    };
  }
  if (method === "GET" && path === "telemetry/status") {
    return { running: false, project_id: PROJECT, location: "local", engine_id: null };
  }
  throw new HttpError(404, "not found");
}

function round6(n: number) {
  return Math.round(n * 1e6) / 1e6;
}
function round4(n: number) {
  return Math.round(n * 1e4) / 1e4;
}
