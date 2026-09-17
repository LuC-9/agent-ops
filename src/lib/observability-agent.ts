import { summarizeAgent } from "./scoring";
import type { Agent, Improvement, StoreData, Trace } from "./types";

function recentErrors(traces: Trace[]) {
  return traces.filter((t) => t.status === "error" || t.accuracy < 60).slice(0, 12);
}

function promptIssues(agent: Agent, traces: Trace[]) {
  const vague = traces.filter((t) => t.response.length < 80 && t.status === "ok");
  const uncited = traces.filter(
    (t) => agent.role === "research" && t.status === "ok" && !/http|source|citation/i.test(t.response),
  );
  return { vague, uncited };
}

export function analyzeStore(store: StoreData): Omit<Improvement, "id" | "createdAt">[] {
  const ideas: Omit<Improvement, "id" | "createdAt">[] = [];
  const existingTitles = new Set(store.improvements.filter((i) => i.status === "open").map((i) => i.title));

  for (const agent of store.agents) {
    if (agent.role === "observability") continue;
    const traces = store.traces.filter((t) => t.agentId === agent.id);
    const stats = summarizeAgent(agent, store.traces);
    const errors = recentErrors(traces);
    const { vague, uncited } = promptIssues(agent, traces);

    if (errors.length >= 1 && stats.errorRate >= 0.15) {
      const title = `Harden ${agent.name} against ${errors[0].error?.split(" ").slice(0, 6).join(" ") ?? "tool failures"}`;
      if (!existingTitles.has(title)) {
        ideas.push({
          agentId: agent.id,
          title,
          rationale: `${Math.round(stats.errorRate * 100)}% of recent runs failed. Latest error: ${errors[0].error ?? "low accuracy"}. The graph (${agent.graph.nodes.join(" → ")}) has no recovery path.`,
          suggestion: `Add a retry + fallback node after the failing step. Emit a degraded-but-useful response instead of an empty error. Cap tool timeouts and persist partial state. Related logs: ${errors
            .flatMap((e) => e.logs.filter((l) => l.level === "error").map((l) => l.message))
            .slice(0, 3)
            .join("; ")}`,
          category: "reliability",
          severity: stats.errorRate > 0.3 ? "high" : "medium",
          relatedTraceIds: errors.map((e) => e.id).slice(0, 5),
          status: "open",
          source: "analyst",
        });
      }
    }

    if (stats.calibrationGap > 12 && traces.length >= 2) {
      const title = `Recalibrate ${agent.name} confidence`;
      if (!existingTitles.has(title)) {
        ideas.push({
          agentId: agent.id,
          title,
          rationale: `Calibration gap is ${stats.calibrationGap.toFixed(1)} points. The score node is reporting more certainty than judged accuracy.`,
          suggestion:
            "In the score node, cap confidence at accuracy + 8. If the last 5 traces have gap > 12, ask a clarifying question instead of answering.",
          category: "evaluation",
          severity: "medium",
          relatedTraceIds: traces.slice(0, 4).map((t) => t.id),
          status: "open",
          source: "analyst",
        });
      }
    }

    if (stats.avgAccuracy && stats.avgAccuracy < 75 && traces.length >= 2) {
      const title = `Tighten evaluation rubric for ${agent.name}`;
      if (!existingTitles.has(title)) {
        ideas.push({
          agentId: agent.id,
          title,
          rationale: `Average accuracy is ${stats.avgAccuracy.toFixed(1)}. Confidence is ${stats.avgConfidence.toFixed(1)}, so the agent is over-confident relative to judged quality.`,
          suggestion:
            "Add an explicit score node rubric: groundedness, completeness, policy adherence. If confidence - accuracy > 15, down-rank the answer and ask a clarifying question.",
          category: "evaluation",
          severity: "medium",
          relatedTraceIds: traces.slice(0, 4).map((t) => t.id),
          status: "open",
          source: "analyst",
        });
      }
    }

    if (uncited.length) {
      const title = `Require citations in ${agent.name} synthesize step`;
      if (!existingTitles.has(title)) {
        ideas.push({
          agentId: agent.id,
          title,
          rationale: `${uncited.length} research answers lacked citations, which lowers trust even when prose looks complete.`,
          suggestion: `Update system prompt:\n${agent.systemPrompt}\n\nADD: Every factual claim must include a source_id. The score node fails closed if citations == 0.`,
          category: "prompt",
          severity: "medium",
          relatedTraceIds: uncited.map((t) => t.id).slice(0, 4),
          status: "open",
          source: "analyst",
        });
      }
    }

    if (vague.length >= 2) {
      const title = `Expand tool coverage for short ${agent.name} answers`;
      if (!existingTitles.has(title)) {
        ideas.push({
          agentId: agent.id,
          title,
          rationale: "Multiple successful traces returned unusually short answers, often a sign the retrieve/act node under-fetched.",
          suggestion:
            "Log retrieved chunk counts. If evidence tokens < 200, loop gather once more before synthesize. Add a 'insufficient evidence' branch instead of a thin answer.",
          category: "tooling",
          severity: "low",
          relatedTraceIds: vague.map((t) => t.id).slice(0, 4),
          status: "open",
          source: "analyst",
        });
      }
    }
  }

  return ideas.slice(0, 6);
}

export type DashContext = {
  tab?: string;
  time_range?: string;
  project?: string;
  service?: string;
  platform?: string;
  chart?: {
    chart?: string;
    axis?: unknown[];
    series?: { name?: string; type?: string; sample?: unknown[]; n?: number }[];
  };
};

function numPoint(p: unknown): number | null {
  if (typeof p === "number" && Number.isFinite(p)) return p;
  if (typeof p === "string" && p.trim() && Number.isFinite(Number(p))) return Number(p);
  if (p && typeof p === "object") {
    const o = p as { value?: unknown; name?: unknown };
    if (typeof o.value === "number") return o.value;
    if (Array.isArray(o.value) && typeof o.value[0] === "number") return o.value[0];
  }
  if (Array.isArray(p) && typeof p[1] === "number") return p[1];
  return null;
}

function fmtVal(name: string, n: number) {
  const k = name.toLowerCase();
  if (/cost|usd|\$/.test(k)) return n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(6)}`;
  if (/p50|p95|latency|ms/.test(k)) return `${Math.round(n)} ms`;
  if (/rate|pct|%/.test(k)) return `${(n <= 1 ? n * 100 : n).toFixed(2)}%`;
  if (Number.isInteger(n) || Math.abs(n) >= 20) return Math.round(n).toLocaleString();
  return n.toFixed(2);
}

function seriesStats(name: string, sample: unknown[], axis: string[]) {
  const vals = sample.map(numPoint);
  const pts = vals
    .map((v, i) => ({ i, v, label: String(axis[i] ?? i) }))
    .filter((p): p is { i: number; v: number; label: string } => p.v != null);
  if (!pts.length) return null;
  const first = pts[0];
  const last = pts[pts.length - 1];
  let max = first;
  let min = first;
  let sum = 0;
  for (const p of pts) {
    sum += p.v;
    if (p.v > max.v) max = p;
    if (p.v < min.v) min = p;
  }
  const delta = last.v - first.v;
  const dir = Math.abs(delta) < Math.max(1e-9, Math.abs(first.v) * 0.02) ? "flat" : delta > 0 ? "up" : "down";
  return { name, first, last, max, min, sum, n: pts.length, dir, delta };
}

function explainFromPayload(dashboard: DashContext): string | null {
  const payload = dashboard.chart;
  const series = payload?.series;
  if (!series?.length) return null;
  const title = String(payload?.chart || "this chart");
  const axis = (payload?.axis || []).map((x) => String(x));
  const window = dashboard.time_range ? ` (${dashboard.time_range} window)` : "";
  const stats = series
    .map((s) => seriesStats(s.name || s.type || "series", s.sample || [], axis))
    .filter(Boolean) as NonNullable<ReturnType<typeof seriesStats>>[];
  if (!stats.length) return null;

  const named = (re: RegExp) => stats.find((s) => re.test(s.name.toLowerCase()));
  const cost = named(/cost|usd/);
  const traces = named(/^traces$|requests|volume/);
  const errs = named(/error/);
  const p50 = named(/p50/);
  const p95 = named(/p95/);
  const inn = named(/input/);
  const out = named(/output/);

  const lines: string[] = [];
  const t = title.toLowerCase();

  if (t === "trends" || /trend/.test(t)) {
    if (cost || errs) {
      lines.push(
        `**Trends**${window} is a time series of fleet load: **Cost (USD)** on the left axis, **Traces** and **Errors** on the count axis.`,
      );
      if (cost) {
        lines.push(
          `Spend moved ${cost.dir} from ${fmtVal(cost.name, cost.first.v)} (${cost.first.label}) to ${fmtVal(cost.name, cost.last.v)} (${cost.last.label}). Peak cost was ${fmtVal(cost.name, cost.max.v)} at ${cost.max.label}.`,
        );
      }
      if (traces) {
        lines.push(
          `Trace volume ${traces.dir === "flat" ? "stayed roughly level" : `trended ${traces.dir}`} (last bucket ${fmtVal(traces.name, traces.last.v)}).`,
        );
      }
      if (errs) {
        lines.push(
          errs.max.v > 0
            ? `Errors peaked at ${fmtVal(errs.name, errs.max.v)} in ${errs.max.label}. Last bucket: ${fmtVal(errs.name, errs.last.v)}.`
            : `No error counts in the sampled buckets — reliability looks clean in this slice.`,
        );
      }
      const take: string[] = [];
      if (errs && traces && traces.sum > 0 && errs.sum / traces.sum > 0.08) {
        take.push("Error rate vs volume is high enough to investigate failing nodes (often Sentinel timeouts) before chasing cost.");
      } else if (cost && cost.dir === "up" && (!errs || errs.dir !== "up")) {
        take.push("Cost is rising without a matching error spike — check model mix and token-heavy agents, not just failures.");
      } else if (errs && errs.max.v > 0) {
        take.push(`Start with the ${errs.max.label} bucket: open Traces filtered to errors around that time.`);
      } else {
        take.push("Volume and cost are the story here; use the Cost / Latency / Tokens segments on this card if you need a different cut.");
      }
      lines.push(`**Takeaway:** ${take.join(" ")}`);
    } else if (p50 || p95) {
      lines.push(`**Trends → latency**${window} plots P50 and P95 response time over time.`);
      if (p50) lines.push(`P50 ${p50.dir} to ${fmtVal("p50", p50.last.v)} (peak ${fmtVal("p50", p50.max.v)} at ${p50.max.label}).`);
      if (p95) lines.push(`P95 ${p95.dir} to ${fmtVal("p95", p95.last.v)} (peak ${fmtVal("p95", p95.max.v)} at ${p95.max.label}).`);
      lines.push(
        `**Takeaway:** ${
          p95 && p50 && p95.last.v > p50.last.v * 2.5
            ? "The tail is much slower than the median — a few traces (or one agent) are dragging P95. Open the slowest traces."
            : "Latency is relatively tight; watch P95 if it keeps climbing while P50 is flat."
        }`,
      );
    } else if (inn || out) {
      lines.push(`**Trends → tokens**${window} stacks input vs output tokens over time.`);
      if (inn) lines.push(`Input last bucket ${fmtVal("tokens", inn.last.v)}; peak ${fmtVal("tokens", inn.max.v)} at ${inn.max.label}.`);
      if (out) lines.push(`Output last bucket ${fmtVal("tokens", out.last.v)}; peak ${fmtVal("tokens", out.max.v)} at ${out.max.label}.`);
      lines.push("**Takeaway:** Token spikes usually mean longer prompts or verbose agents — that is the cost driver even when trace count is flat.");
    } else if (traces) {
      lines.push(`**Trends → requests**${window} is trace volume over time. Last bucket ${fmtVal(traces.name, traces.last.v)}, peak ${fmtVal(traces.name, traces.max.v)} at ${traces.max.label}.`);
      lines.push("**Takeaway:** Use this to see load shape (weekday vs weekend). Pair with the Cost & Errors view if a busy bucket also got expensive.");
    }
  }

  if (!lines.length && /cost/.test(t)) {
    const ranked = [...stats].sort((a, b) => b.max.v - a.max.v);
    const pieish = series.some((s) => s.type === "pie") || series.some((s) => (s.sample || []).some((p) => p && typeof p === "object" && "name" in (p as object)));
    if (pieish) {
      const slices = (series[0].sample || [])
        .map((p) => {
          if (p && typeof p === "object" && "name" in (p as object)) {
            const o = p as { name?: string; value?: number };
            return { name: String(o.name || "—"), v: Number(o.value || 0) };
          }
          return null;
        })
        .filter(Boolean) as { name: string; v: number }[];
      const total = slices.reduce((n, s) => n + s.v, 0) || 1;
      const top = [...slices].sort((a, b) => b.v - a.v).slice(0, 3);
      lines.push(`**${title}**${window} is a cost share breakdown.`);
      lines.push(top.map((s) => `${s.name}: ${fmtVal("cost", s.v)} (${Math.round((s.v / total) * 100)}%)`).join("; ") + ".");
      lines.push(`**Takeaway:** ${top[0] ? `${top[0].name} dominates spend — filter the dashboard to it before looking at cheaper slices.` : "No cost slices in this window."}`);
    } else {
      lines.push(`**${title}**${window} ranks spend.`);
      lines.push(
        ranked
          .slice(0, 5)
          .map((s) => `${s.name}: last ${fmtVal(s.name, s.last.v)} (peak ${fmtVal(s.name, s.max.v)})`)
          .join("; ") + ".",
      );
      lines.push(`**Takeaway:** Start cost work on the top bar; the rest is noise until that one moves.`);
    }
  }

  if (!lines.length) {
    lines.push(`**${title}**${window} plots ${stats.map((s) => s.name).join(", ")}.`);
    for (const s of stats.slice(0, 4)) {
      lines.push(
        `${s.name}: ${s.dir} from ${fmtVal(s.name, s.first.v)} (${s.first.label}) to ${fmtVal(s.name, s.last.v)} (${s.last.label}); peak ${fmtVal(s.name, s.max.v)} at ${s.max.label}.`,
      );
    }
    const hottest = [...stats].sort((a, b) => b.max.v - a.max.v)[0];
    lines.push(`**Takeaway:** The standout is ${hottest.name} at ${hottest.max.label}. Use that bucket as the time filter when you open Traces.`);
  }

  return lines.join("\n");
}

function explainTrendsFromStore(store: StoreData, timeRange?: string): string {
  const cutoff = (() => {
    const ms: Record<string, number> = { "1h": 3600_000, "24h": 86_400_000, "7d": 7 * 86_400_000, "30d": 30 * 86_400_000 };
    const span = ms[timeRange || ""] ?? 7 * 86_400_000;
    return new Date(Date.now() - span).toISOString();
  })();
  const traces = timeRange ? store.traces.filter((t) => t.startedAt >= cutoff) : store.traces;
  const byDay = new Map<string, { n: number; err: number; lat: number }>();
  for (const t of traces) {
    const d = (t.startedAt || "").slice(0, 10) || "unknown";
    const row = byDay.get(d) || { n: 0, err: 0, lat: 0 };
    row.n += 1;
    if (t.status === "error") row.err += 1;
    row.lat += t.latencyMs || 0;
    byDay.set(d, row);
  }
  const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const last = days.slice(-7);
  const peakErr = [...days].sort((a, b) => b[1].err - a[1].err)[0];
  const window = timeRange ? ` (${timeRange})` : "";
  const errN = traces.filter((t) => t.status === "error").length;
  return [
    `**Trends**${window} (Overview) is not a single KPI - the segmented card switches between Cost & Errors, Latency P50/P95, Tokens, and Requests. Default view overlays **LLM cost**, **trace count**, and **errors** over time.`,
    `In store: ${traces.length} traces, ${errN} errors (${traces.length ? Math.round((errN / traces.length) * 100) : 0}%).`,
    last.length
      ? `Recent days: ${last.map(([d, r]) => `${d}: ${r.n} traces / ${r.err} errors`).join("; ")}.`
      : "No daily buckets yet.",
    peakErr && peakErr[1].err
      ? `**Takeaway:** Worst error day was ${peakErr[0]} (${peakErr[1].err} failures). Open Traces for that date, then use Summarize / Suggest a fix on a failing run.`
      : "**Takeaway:** Error counts are low; switch the Trends segment to Latency or Tokens if you are hunting spend or slowness rather than failures.",
  ].join("\n");
}

function wantsChart(q: string, dashboard?: DashContext) {
  if (dashboard?.chart?.series?.length) return true;
  return /explain.{0,80}(chart|trends)|what does .{0,80}show|take away|this chart/.test(q);
}

export function answerCopilot(store: StoreData, question: string, dashboard?: DashContext): string {
  const q = question.toLowerCase();
  if (wantsChart(q, dashboard)) {
    const fromUi = explainFromPayload(dashboard || {});
    if (fromUi) return fromUi;
    if (/trend/.test(q) || dashboard?.chart?.chart?.toLowerCase() === "trends") {
      return explainTrendsFromStore(store, dashboard?.time_range);
    }
  }

  const stats = store.agents.filter((a) => a.role !== "observability").map((a) => ({ agent: a, stats: summarizeAgent(a, store.traces) }));
  const worst = [...stats].sort((a, b) => a.stats.avgTrust - b.stats.avgTrust)[0];
  const errors = store.traces.filter((t) => t.status === "error");
  const open = store.improvements.filter((i) => i.status === "open");

  if (/trust|confidence|accuracy/.test(q)) {
    return stats
      .map(
        ({ agent, stats: s }) =>
          `${agent.name}: accuracy ${s.avgAccuracy.toFixed(1)}, confidence ${s.avgConfidence.toFixed(1)}, trust ${s.avgTrust.toFixed(1)} across ${s.traces} traces (error rate ${(s.errorRate * 100).toFixed(0)}%).`,
      )
      .join("\n") +
      `\n\nTrust is a weighted blend of accuracy (40%), confidence (30%), and historical reliability (30%). ${worst.agent.name} is the weakest on trust right now.`;
  }

  if (/error|fail|timeout|log/.test(q)) {
    if (errors.length === 0) {
      return "No error traces in the current window. I would still watch Sentinel's correlate node — it has a prior timeout in seed history.";
    }
    return `Found ${errors.length} error trace(s).\n` +
      errors
        .slice(0, 5)
        .map((t) => {
          const agent = store.agents.find((a) => a.id === t.agentId)?.name ?? t.agentId;
          const errLogs = t.logs.filter((l) => l.level === "error");
          return `- ${agent} ${t.id}: ${t.error ?? errLogs[0]?.message ?? "unknown"} (request: ${t.request.slice(0, 80)})`;
        })
        .join("\n") +
      `\n\nSuggested next action: generate improvements so the graph grows a fallback edge around the failing node.`;
  }

  if (/prompt|system/.test(q)) {
    return store.agents
      .map((a) => `## ${a.name}\n${a.systemPrompt}`)
      .join("\n\n");
  }

  if (/audit|usage|token/.test(q)) {
    const usages = store.usages ?? [];
    const tokens = usages.reduce((n, u) => n + u.promptTokens + u.completionTokens, 0);
    return `AI usages recorded: ${usages.length}. Estimated tokens: ${tokens}. Audit events: ${(store.audit ?? []).length}. Latest audit: ${store.audit?.[0]?.summary ?? "none"}.`;
  }

  if (/improve|suggest|fix/.test(q)) {
    if (open.length === 0) {
      return "No open improvements yet. Ask me to analyze logs and I will propose prompt, graph, and reliability changes.";
    }
    return open
      .map((i) => {
        const name = store.agents.find((a) => a.id === i.agentId)?.name ?? i.agentId;
        return `• [${i.severity}] ${name}: ${i.title}\n  ${i.suggestion}`;
      })
      .join("\n\n");
  }

  const online = store.agents.filter((a) => a.role !== "observability" && a.status === "online").length;
  return `I am the observability copilot for ${store.agents.filter((a) => a.role !== "observability").length} onboarded agents (${online} currently heartbeating).
Traces stored: ${store.traces.length}. Open improvements: ${open.length}.

Ask me about accuracy/confidence/trust, error logs, system prompts, or request a new analysis pass.

Weakest agent by trust: ${worst.agent.name} (${worst.stats.avgTrust.toFixed(1)}).`;
}

const SYSTEM =
  "You are an observability engineer for LangGraph agents. Be specific. Cite trace ids and node names when present. Do not invent metrics.";

type LlmCall = {
  text: string;
  promptTokens: number;
  completionTokens: number;
  model: string;
  provider: "gemini" | "openai" | "local";
};

async function callGemini(prompt: string): Promise<LlmCall | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2 },
      }),
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (!res.ok) return null;
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
  if (!text) return null;
  return {
    text,
    promptTokens: json.usageMetadata?.promptTokenCount ?? Math.ceil(prompt.length / 4),
    completionTokens: json.usageMetadata?.candidatesTokenCount ?? Math.ceil(text.length / 4),
    model,
    provider: "gemini" as const,
  };
}

async function callOpenAI(prompt: string): Promise<LlmCall | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const text = json.choices?.[0]?.message?.content?.trim();
  if (!text) return null;
  return {
    text,
    promptTokens: json.usage?.prompt_tokens ?? Math.ceil(prompt.length / 4),
    completionTokens: json.usage?.completion_tokens ?? Math.ceil(text.length / 4),
    model,
    provider: "openai",
  };
}

export async function llmAugment(prompt: string, fallback: string): Promise<string> {
  const detailed = await llmAugmentDetailed(prompt, fallback);
  return detailed.text;
}

export async function llmAugmentDetailed(prompt: string, fallback: string): Promise<LlmCall & { fallback: boolean; latencyMs: number }> {
  const started = Date.now();
  try {
    const call = (await callGemini(prompt)) || (await callOpenAI(prompt));
    if (call) return { ...call, fallback: false, latencyMs: Date.now() - started };
  } catch {
    /* local fallback */
  }
  return {
    text: fallback,
    promptTokens: Math.ceil(prompt.length / 4),
    completionTokens: Math.ceil(fallback.length / 4),
    model: "local-analyst",
    provider: "local",
    fallback: true,
    latencyMs: Date.now() - started,
  };
}
