# Northstar Agent Observability

Local control room for LangGraph agents. The dashboard shows **system prompts**, **requests**, **responses**, **accuracy**, **confidence**, **trust**, structured **logs**, and **suggested improvements**. A platform copilot answers questions about the fleet.

Four agents ship in this repo and onboard themselves when the runtime starts:

| Slug | Agent | Graph |
| --- | --- | --- |
| `atlas-research` | Atlas Research | plan → gather → regather → synthesize → score |
| `helix-support` | Helix Support | classify → policy → draft → escalate → score |
| `forge-code-review` | Forge Code Review | parse → analyze → rank → score |
| `sentinel-incident` | Sentinel Incident | triage → correlate → fallback → runbook → score |

Sentinel uses a **cached SLO snapshot** (degraded OK) when the prompt contains `timeout` or `18:10`. Use `abort-runbook` to fail closed and auto-open a reliability suggestion.

Each invoke writes an **audit event** and **AI usage** rows (per LangGraph node when Gemini/OpenAI is used). Open **Suggestions**, **Audit**, and **AI usage** in the nav.

## Run locally

Full clone → install → demo: **[docs/LOCAL_RUN.md](docs/LOCAL_RUN.md)**.

Two terminals (macOS / Linux / WSL):

```bash
chmod +x run-observability.sh run-agents.sh
./run-observability.sh
```

```bash
./run-agents.sh
```

Windows PowerShell:

```powershell
.\run-observability.ps1
```

```powershell
.\run-agents.ps1
```

- Dashboard: [http://127.0.0.1:43147](http://127.0.0.1:43147)
- Agent runtime: [http://127.0.0.1:43148/health](http://127.0.0.1:43148/health)

Copy `.env.example` to `.env` to change ports or attach a Gemini (preferred) or OpenAI key. Both scripts source `.env` automatically. **No API key is required** — agents and the copilot fall back to a deterministic analyst. Never commit `.env`.

Then open **Run agents** in the UI and invoke a prompt. Traces land in the control room within seconds.

## What the scores mean

- **Accuracy** — agent self-score plus platform heuristics (structure, citations, errors).
- **Confidence** — self-reported calibration from the score node.
- **Trust** — `0.4 * accuracy + 0.3 * confidence + 0.3 * historical reliability`.

## Docs

- [Run on a laptop](docs/LOCAL_RUN.md) — prerequisites, two processes, health checks, curl demo, troubleshooting
- [Interview Q&A Guide](docs/INTERVIEW_QA_GUIDE.md) — pitch, architecture, AI usage, guardrails, code map, 20+ Q&As
- [AI Suggestions, Fixes & Copilot Architecture](docs/AI_SUGGESTIONS_FIXES_COPILOT.md) — mechanics of analyst rules, system prompt patching, and chatbot engine
- [High-level design](docs/HLD.md)
- [Technical documentation](docs/TECHNICAL.md)

## Stack

- Observability platform: Next.js, TypeScript, Tailwind, shadcn/ui, file-backed JSON store
- Agents: Python, FastAPI, LangGraph, LangChain
