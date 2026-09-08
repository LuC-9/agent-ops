# Interview brief — Northstar Agent Observability

Use this document to walk an interviewer through the project in about five minutes, then go deeper on any box they point at.

## 30-second pitch

I built a **local observability control room for LangGraph agents**. Two processes: a Next.js platform that stores traces and scores them, and a FastAPI runtime that runs four LangGraph agents. Every invoke records the **system prompt, request, response, node logs, accuracy, confidence, and a trust score**. A platform copilot and a log analyst turn failures into **suggested prompt/graph patches**, and every agent use, suggestion, and model call is **audited** with token usage.

No database and no API key are required to demo. Gemini or OpenAI is optional.

## Problem I was solving

Teams ship agents and then cannot answer:

- What prompt was actually in production for this run?
- Which graph node failed, and did we degrade or fail closed?
- Is the agent calibrated (confident but wrong)?
- What did we change after the last incident, and who applied it?
- How much did Gemini cost per node?

This repo is a **closed loop**: run → observe → score → suggest → apply → audit.

## Architecture (say this out loud)

```
Browser  →  Observability platform (Next.js :43147)
                │  JSON store: agents, traces, suggestions, audit, usage
                │  scoring, copilot, suggestion analyst
                ▼
            Agent runtime (FastAPI + LangGraph :43148)
                │  four compiled graphs
                │  Recorder per invoke → POST /api/ingest
                └── optional Gemini / OpenAI
```

**Why two processes?** Agents should look like an external fleet. The dashboard does not import Python graphs. Registration, heartbeat, and ingest are HTTP contracts. That is how you would attach a second language or a remote worker later.

**Why JSON on disk?** Interview-friendly local-first: inspect `data/observability.json`, delete it to reset, no Docker. Production swap is Postgres for traces plus object storage for prompt snapshots; the ingest schema stays the same.

## Data flow for one run

1. Runtime **registers** each agent (`slug`, system prompt, graph nodes/edges, version).
2. Heartbeat every 20s → UI shows online / degraded / offline.
3. Operator hits **Run agents** (or `POST /api/invoke`). Platform **proxies** to `:43148/invoke`.
4. LangGraph nodes call `Recorder.log` and `complete(..., node=...)`.
5. `complete` uses Gemini if keyed, else OpenAI, else a deterministic fallback. Tokens go into a contextvar bucket.
6. Runtime **ingests** the trace. Platform derives accuracy/confidence if missing, blends **trust**, writes **audit** (`agent.invoke`) and **usage** rows (including per-node).
7. On hard errors, the store **auto-opens a reliability suggestion**.

## Scoring (they will ask)

```
trust = 0.40 * accuracy + 0.30 * confidence + 0.30 * reliability
```

| Signal | Meaning |
| --- | --- |
| Accuracy | Score node first; else structure/length heuristics; errors collapse |
| Confidence | Self-reported calibration; errors collapse |
| Reliability | Success rate of last 25 traces for that agent; a failed run multiplies this term by 0.35 |

Trust is designed so an agent that is **sure but often wrong** cannot look healthy. The UI also shows **calibration gap** (`confidence − accuracy`).

## Four agents (onboarded graphs)

| Agent | Graph | Interview hook |
| --- | --- | --- |
| Atlas Research | plan → gather → **regather** → synthesize → score | Citation retriever; thin answers loop gather again |
| Helix Support | classify → policy → draft → **escalate** → score | Policy cards; no invented refunds; escalate large billing |
| Forge Code Review | parse → analyze → rank → score | CWE-89 style SQL interpolation is high residual risk |
| Sentinel Incident | triage → correlate → **fallback** → runbook → score | Timeout phrases use SLO snapshot (**degraded OK**). `abort-runbook` **fails closed** so suggestions fire |

Graphs are compiled once at process start. No checkpointer: each invoke is a fresh thread. State carries a `Recorder` that is not checkpointed.

## Platform-side “agentic” features

The dashboard is not a log viewer only.

- **Copilot** — keyword heuristic over the store (trust, errors, prompts, suggestions, usage), then Gemini/OpenAI refine with “do not invent metrics”. Falls back locally in 20s.
- **Analyze logs** — clusters error rate, low accuracy, missing citations, short answers → improvement cards (prompt / graph / tooling / evaluation / reliability).
- **Suggestions** — accept, **apply prompt patch** onto the agent system prompt, or dismiss. Duplicate titles are skipped.
- **Audit** — immutable trail: register, invoke, suggestion lifecycle, copilot, analyst.
- **AI usage** — purpose (`agent` / `copilot` / `analyst`), model, node, prompt/completion tokens, latency, fallbacks.

## Persistence and limits

`src/lib/store.ts` writes atomically (`*.tmp` + rename). Caps: traces 500, audit 800, usages 800. First read seeds four agents so the UI is useful before the runtime boots. Registration upserts the same slugs.

## Tradeoffs I would defend

| Choice | Why | What I would change in production |
| --- | --- | --- |
| File JSON | Zero ops, demoable | Postgres + retention jobs |
| CORS `*` | Local Python origin | AuthN + agent API keys |
| Heuristic + LLM | Never block on a key | Online eval worker, human review queue |
| Trust weights 40/30/30 | Simple, explainable | Fit weights from labeled traces |
| No OpenTelemetry | One ingest contract | OTLP exporter beside ingest |
| Next.js App Router + FastAPI | Clear UI vs graph split | Same split, add a queue between invoke and graph |

## Demo path (if they want a screen)

1. Open control room → fleet accuracy / confidence / trust.
2. Run **Forge** on interpolated SQL → high-risk finding + usage rows on `analyze` / `rank`.
3. Run Sentinel with `abort-runbook` → error trace + auto suggestion.
4. Copilot: “Which agent has the weakest trust and why?”
5. Suggestions → Apply to prompt → Audit shows `suggestion.applied`.
6. AI usage → token totals and fallbacks.

## Files to mention if they ask “where is the code?”

| Concern | File |
| --- | --- |
| Trust formula | `src/lib/scoring.ts` |
| Store, ingest, apply patch | `src/lib/store.ts` |
| Copilot / log analyst | `src/lib/observability-agent.ts` |
| HTTP contract | `src/app/api/*` |
| Graph runtime | `agents/app/server.py` |
| LLM + token bucket | `agents/app/llm.py` |
| Ingest client | `agents/app/telemetry.py` |
| Tools (retriever, CWE, SLO) | `agents/app/tools.py` |

## Questions I expect, with short answers

**Why LangGraph instead of a single LLM call?**  
Each node is a unit of observation. Fallback and escalate are edges, not prompt instructions. Traces name the failing node.

**What if Gemini is down?**  
`complete` times out (~25s) and uses the authored fallback. Copilot times out (~20s) and answers from heuristics. Usage records `fallback: true`.

**How do you stop prompt injection in Helix?**  
Policy is a tool card, not free-form memory. Graph can escalate. Observability still cannot replace a dedicated policy engine.

**How would you test this?**  
Contract tests on ingest/scoring; graph tests with `timeout` / `abort-runbook` / SQL `f"` fixtures; UI flow: invoke → audit event → usage row.

**What is explicitly out of scope?**  
Multi-tenant auth, durable queues, OTEL, online eval workers. The ingest payload is the extension point.

## One closing line

This is an **agent control plane**: registry, traces, scores, suggestions, and an audit/usage ledger, with four real LangGraph agents that onboard themselves over HTTP.
