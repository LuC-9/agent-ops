# Northstar Agent Observability

Local control room for LangGraph agents. The dashboard shows **system prompts**, **requests**, **responses**, **accuracy**, **confidence**, **trust**, structured **logs**, and **suggested improvements**. A platform copilot answers questions about the fleet.

Four agents ship in this repo and onboard themselves when the runtime starts:

| Slug | Agent | Graph |
| --- | --- | --- |
| `atlas-research` | Atlas Research | plan → gather → synthesize → score |
| `helix-support` | Helix Support | classify → policy → draft → score |
| `forge-code-review` | Forge Code Review | parse → analyze → rank → score |
| `sentinel-incident` | Sentinel Incident | triage → correlate → runbook → score |

Sentinel will **fail on purpose** when the prompt contains `timeout` or `18:10`, so you can watch error logs and generated improvements.

## Run locally

Use two terminals.

```bash
chmod +x run-observability.sh run-agents.sh
./run-observability.sh
```

```bash
./run-agents.sh
```

- Dashboard: [http://127.0.0.1:43147](http://127.0.0.1:43147)
- Agent runtime: [http://127.0.0.1:43148/health](http://127.0.0.1:43148/health)

Copy `.env.example` to `.env` if you want to change ports or attach an OpenAI key. Both scripts source `.env` automatically. **No API key is required** — agents and the copilot fall back to a deterministic analyst.

Then open **Run agents** in the UI and invoke a prompt. Traces land in the control room within seconds.

## What the scores mean

- **Accuracy** — agent self-score plus platform heuristics (structure, citations, errors).
- **Confidence** — self-reported calibration from the score node.
- **Trust** — `0.4 * accuracy + 0.3 * confidence + 0.3 * historical reliability`.

## Docs

- [High-level design](docs/HLD.md)
- [Technical documentation](docs/TECHNICAL.md)

## Stack

- Observability platform: Next.js, TypeScript, Tailwind, shadcn/ui, file-backed JSON store
- Agents: Python, FastAPI, LangGraph, LangChain
