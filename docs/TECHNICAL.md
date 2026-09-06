# Technical documentation — Northstar Agent Observability

## Repository layout

```
.
├── run-observability.sh     # dashboard + ingest APIs
├── run-agents.sh            # LangGraph runtime
├── src/                     # Next.js app (App Router)
│   ├── app/api/             # HTTP contract
│   ├── app/                 # control room pages
│   ├── components/          # shell + shadcn/ui
│   └── lib/                 # store, scoring, observability agent
├── agents/
│   ├── requirements.txt
│   └── app/
│       ├── server.py
│       ├── llm.py
│       ├── telemetry.py
│       └── graphs/          # four LangGraph compilations
└── data/                    # created at runtime
```

## HTTP contract (platform)

Base URL: `http://127.0.0.1:43147`

| Method | Path | Body / query | Result |
| --- | --- | --- | --- |
| GET | `/api/health` | | Store + process health |
| GET/POST | `/api/agents` | register spec | List / upsert agent |
| GET/POST | `/api/agents/:id` | | Detail + traces; POST = heartbeat |
| POST | `/api/ingest` | `IngestPayload` | Scored `Trace` |
| GET | `/api/traces` | `agentId`, `status` | Trace list |
| GET | `/api/traces/:id` | | Trace + agent |
| GET/PATCH | `/api/improvements` | `{ id, status }` | Cards / accept, apply, dismiss |
| POST | `/api/improvements/generate` | | Analyze logs |
| GET | `/api/audit` | | Agent uses and operator actions |
| GET | `/api/usage` | | Model calls and tokens |
| GET/POST | `/api/copilot` | `{ question }` | Observability agent chat |
| POST | `/api/invoke` | `{ slug, input }` | Proxy to agent runtime |

CORS is open (`*`) on these routes so the Python runtime can ingest from another origin.

### Register payload

```json
{
  "id": "agent_atlas",
  "name": "Atlas Research",
  "slug": "atlas-research",
  "description": "...",
  "role": "research",
  "systemPrompt": "...",
  "graph": { "nodes": ["plan", "gather", "synthesize", "score"], "edges": [] },
  "version": "1.2.0",
  "endpoint": "http://127.0.0.1:43148/invoke"
}
```

Upsert is by `slug` or `id`. Re-running `./run-agents.sh` refreshes the live system prompt and marks the agent **online**.

### Ingest payload

Required: `request`, `response`, and `slug` or `agentId`.

Optional: `systemPrompt`, `status`, `accuracy`, `confidence`, `trustScore`, `error`, `logs[]`, timestamps, `model`, `tokens`.

`logs[]` items:

```json
{ "ts": "ISO-8601", "level": "info|warn|error|debug", "node": "gather", "message": "...", "data": {} }
```

## Scoring implementation

See `src/lib/scoring.ts`.

1. `deriveAccuracy` — uses reported score if present; errors sit near 20; otherwise length + structure − hedge penalties.
2. `deriveConfidence` — uses reported score; errors sit near 22.
3. `reliabilityFromHistory` — success ratio of the last 25 traces for that agent (default 80 if none).
4. `computeTrustScore` — weighted sum; a failed trace multiplies reliability by 0.35.

The UI shows per-trace numbers on the inspector and averages on the fleet and agent pages.

## Observability agent

`src/lib/observability-agent.ts` is a deterministic analyst:

- Error rate ≥ 15% → reliability improvement (fallback edges, timeouts).
- Average accuracy < 75 with ≥ 2 traces → evaluation rubric.
- Research answers without citations → prompt patch.
- Multiple tiny successful answers → tooling / retrieve loop.

`llmAugment` optionally calls OpenAI chat completions to rewrite rationale/suggestion text. Failures fall back to the heuristic draft so the product never blocks on a key.

Copilot routing is keyword-based (`trust`, `error`, `prompt`, `improve`) over the JSON store, then optionally LLM-refined with a “do not invent metrics” system prompt.

## Agent runtime

FastAPI app: `agents/app/server.py`.

- Lifespan: retry register for ~60s, then heartbeat every 20s.
- `POST /invoke` `{ "slug", "input" }` compiles-once LangGraph and returns `{ trace, output, status }`.
- Graphs live under `agents/app/graphs/`. Each node calls `Recorder.log` and `complete(system, user, fallback, node=...)`.
- `complete` records prompt/completion tokens into a contextvar bucket; ingest copies them onto the trace and into `store.usages`.

`complete` (`agents/app/llm.py`) uses Gemini when `GEMINI_API_KEY` is set, else OpenAI, else the authored fallback. Calls are bounded by `LLM_TIMEOUT_S` (default 25s). Graphs use tools (`app/tools.py`): a citation retriever, policy cards, CWE scanner, and cached SLO snapshots. Sentinel routes `metrics_timeout` through a **fallback** node instead of failing closed. Ingest retries three times. The JSON store writes atomically (`*.tmp` + rename) and caps traces, audit events, and usages.

### Graphs

**Atlas** — research brief with citation-aware scoring.  
**Helix** — support policy; refuses invented refunds; escalation language boosts accuracy.  
**Forge** — code review; SQL interpolation is treated as high residual risk.  
**Sentinel** — incident runbook. If the user text contains `timeout` or `18:10`, `correlate` takes the fallback SLO snapshot and the run is **degraded ok**. `abort-runbook` fails closed.

LangGraph state includes a `Recorder` instance (not checkpointed). There is no checkpointer in this slice; each invoke is a fresh thread.

## Persistence

`src/lib/store.ts` reads/writes `data/observability.json`. First read seeds four agents, five traces, and two improvements so the UI is useful before the runtime starts. Empty audit/usage collections are backfilled from those traces. Registration overwrites seed agents in place (same ids/slugs).

## Environment

| Variable | Default | Used by |
| --- | --- | --- |
| `PORT` | `43147` | dashboard |
| `AGENTS_PORT` | `43148` | runtime |
| `OBSERVABILITY_URL` | `http://127.0.0.1:43147` | runtime ingest |
| `AGENTS_URL` | `http://127.0.0.1:43148` | dashboard invoke proxy |
| `GEMINI_API_KEY` | empty | both LLM paths (preferred) |
| `GEMINI_MODEL` | `gemini-2.5-flash` | both LLM paths |
| `OPENAI_API_KEY` | empty | fallback LLM |
| `OPENAI_MODEL` | `gpt-4o-mini` | fallback LLM |

Scripts source `.env` from the repo root if present.

## UI routes

| Route | Surface |
| --- | --- |
| `/` | Fleet accuracy / confidence / trust, agent cards, latest requests |
| `/agents/[id]` | System prompt, graph, scores, improvements, traces |
| `/traces/[id]` | Request, response, prompt snapshot, log stream, scores |
| `/suggestions` | Generate from logs; accept / apply prompt patch / dismiss |
| `/audit` | Immutable trail of invokes, suggestions, copilot, analyst |
| `/usage` | Model calls, tokens, node, fallbacks |
| `/copilot` | Observability agent chat |
| `/playground` | Invoke live graphs |

Pages poll stats/traces every 5s on the control room.

## Local operations

```bash
./run-observability.sh
./run-agents.sh
```

Health: `curl -s http://127.0.0.1:43148/health`

Manual invoke:

```bash
curl -s http://127.0.0.1:43147/api/invoke \
  -H 'content-type: application/json' \
  -d '{"slug":"forge-code-review","input":"def get(id): db.execute(f\"SELECT * FROM t WHERE id={id}\")"}'
```

Force an error for Sentinel:

```bash
curl -s http://127.0.0.1:43147/api/invoke \
  -H 'content-type: application/json' \
  -d '{"slug":"sentinel-incident","input":"p99 timeout after the 18:10 deploy"}'
```

Then POST `/api/improvements/generate`.

## Extending

1. Add `agents/app/graphs/my_agent.py` with `SYSTEM_PROMPT`, `GRAPH`, `SPEC`, `build_graph()`.
2. Register the module in `MODULES` inside `server.py`.
3. Restart `./run-agents.sh`. The platform upserts the new slug; no dashboard code change is required beyond optional playground samples.

To persist at scale, replace `getStore`/`writeStore` with a database implementing the same TypeScript types in `src/lib/types.ts`.
