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
        });
      }
    }
  }

  return ideas.slice(0, 6);
}

export function answerCopilot(store: StoreData, question: string): string {
  const q = question.toLowerCase();
  const stats = store.agents.map((a) => ({ agent: a, stats: summarizeAgent(a, store.traces) }));
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

  const online = store.agents.filter((a) => a.status === "online").length;
  return `I am the observability copilot for ${store.agents.length} onboarded agents (${online} currently heartbeating).
Traces stored: ${store.traces.length}. Open improvements: ${open.length}.

Ask me about accuracy/confidence/trust, error logs, system prompts, or request a new analysis pass.

Weakest agent by trust: ${worst.agent.name} (${worst.stats.avgTrust.toFixed(1)}).`;
}

const SYSTEM =
  "You are an observability engineer for LangGraph agents. Be specific. Cite trace ids and node names when present. Do not invent metrics.";

async function callGemini(prompt: string): Promise<string | null> {
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
    },
  );
  if (!res.ok) return null;
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
  return text || null;
}

async function callOpenAI(prompt: string): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return json.choices?.[0]?.message?.content?.trim() || null;
}

export async function llmAugment(prompt: string, fallback: string): Promise<string> {
  try {
    return (await callGemini(prompt)) || (await callOpenAI(prompt)) || fallback;
  } catch {
    return fallback;
  }
}
