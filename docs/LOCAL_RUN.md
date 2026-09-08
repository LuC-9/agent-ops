# Run Northstar locally

This is the full laptop path: clone, install, start both processes, verify, and demo. No Docker, no cloud account, no API key required.

## What you get

| Process | Script | URL |
| --- | --- | --- |
| Observability dashboard + APIs | `./run-observability.sh` | http://127.0.0.1:43147 |
| LangGraph agent runtime | `./run-agents.sh` | http://127.0.0.1:43148/health |

Keep **two terminals** open. Start the dashboard first (or within ~60s of the agents — the runtime retries registration).

## Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| Git | any recent | Clone this repo |
| Node.js | 20+ (22 is fine) | Includes `npm` |
| Python | 3.11 or 3.12 | `python3` on PATH |
| pip | for that Python | Needed if `python3 -m venv` has no ensurepip |

### macOS

```bash
brew install git node python@3.12
```

### Ubuntu / Debian / WSL

```bash
sudo apt update
sudo apt install -y git curl python3 python3-pip python3-venv
# Node 20 via NodeSource or nvm, then:
node -v   # v20+
npm -v
```

If `python3 -m venv` fails with ensurepip, the agent script falls back to `virtualenv` automatically.

### Windows

Use **WSL2 (Ubuntu)** and follow the Ubuntu steps inside WSL. Git Bash can work if `python3` and `node` are on PATH, but WSL is the supported path.

Confirm:

```bash
git --version
node -v
npm -v
python3 --version
```

## 1. Get the code

```bash
git clone <this-repo-url>
cd <repo-directory>
```

If you already have the repo:

```bash
git pull
```

## 2. Environment file (optional)

```bash
cp .env.example .env
```

`.env` is gitignored. Both run scripts `source` it.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `43147` | Dashboard |
| `AGENTS_PORT` | `43148` | Agent runtime |
| `OBSERVABILITY_URL` | `http://127.0.0.1:43147` | Where agents register and ingest |
| `AGENTS_URL` | `http://127.0.0.1:43148` | Where the dashboard proxies invoke |
| `GEMINI_API_KEY` | empty | Preferred LLM for graphs + copilot |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Gemini model id |
| `OPENAI_API_KEY` | empty | Fallback LLM |
| `OPENAI_MODEL` | `gpt-4o-mini` | OpenAI model id |
| `LLM_TIMEOUT_S` | `25` | Agent-side LLM timeout |
| `INVOKE_TIMEOUT_S` | `60` | Whole graph timeout |

Leave keys empty to run the **deterministic pack** (still full traces and scores). Never commit `.env`.

## 3. Start the dashboard

Terminal 1:

```bash
chmod +x run-observability.sh run-agents.sh
./run-observability.sh
```

First run runs `npm install`, then Next.js. Wait until you see the local URL.

Check:

```bash
curl -s http://127.0.0.1:43147/api/health
```

Expect `"ok": true`. Open http://127.0.0.1:43147 — you should see seeded agents even before the runtime starts.

## 4. Start the agents

Terminal 2:

```bash
./run-agents.sh
```

This creates `agents/.venv`, installs `agents/requirements.txt`, binds `:43148`, registers four slugs, and heartbeats every 20s.

Check:

```bash
curl -s http://127.0.0.1:43148/health
```

Expect `"ok": true` and slugs `atlas-research`, `helix-support`, `forge-code-review`, `sentinel-incident`.

Control room sidebar should show agents **online**.

## 5. First demo in the UI

1. **Control room** (`/`) — accuracy, confidence, trust, fleet.
2. **Run agents** (`/playground`) — pick Forge, keep the SQL sample, click **Run**. Open the trace link.
3. **Copilot** (`/copilot`) — type a question, click **Send** (or Enter). You should see **Thinking…** then an answer from telemetry.
4. **Suggestions** — **Analyze logs**, or apply a prompt patch.
5. **Audit** — `agent.invoke`, `copilot.asked`, `suggestion.*`.
6. **AI usage** — model, node, tokens, fallbacks.

## 6. Same demo from the shell

Invoke Forge (SQL injection sample):

```bash
curl -s http://127.0.0.1:43147/api/invoke \
  -H 'content-type: application/json' \
  -d '{"slug":"forge-code-review","input":"def get(id): db.execute(f\"SELECT * FROM t WHERE id={id}\")"}'
```

Helix (escalation / refund):

```bash
curl -s http://127.0.0.1:43147/api/invoke \
  -H 'content-type: application/json' \
  -d '{"slug":"helix-support","input":"My invoice is $620 and I want a refund for downtime."}'
```

Sentinel **degraded** path (cached SLO snapshot, status still ok):

```bash
curl -s http://127.0.0.1:43147/api/invoke \
  -H 'content-type: application/json' \
  -d '{"slug":"sentinel-incident","input":"p99 timeout after the 18:10 deploy"}'
```

Sentinel **fail closed** (auto-opens a suggestion):

```bash
curl -s http://127.0.0.1:43147/api/invoke \
  -H 'content-type: application/json' \
  -d '{"slug":"sentinel-incident","input":"abort-runbook for payments-api"}'
```

Copilot:

```bash
curl -s http://127.0.0.1:43147/api/copilot \
  -H 'content-type: application/json' \
  -d '{"question":"Which agent has the weakest trust score and why?"}'
```

Analyze logs:

```bash
curl -s -X POST http://127.0.0.1:43147/api/improvements/generate
```

Ledgers:

```bash
curl -s http://127.0.0.1:43147/api/audit | head
curl -s http://127.0.0.1:43147/api/usage | head
curl -s http://127.0.0.1:43147/api/runtime
```

## Ports

If 43147 or 43148 are taken, set them in `.env` and keep the two URLs consistent (`PORT` ↔ `OBSERVABILITY_URL`, `AGENTS_PORT` ↔ `AGENTS_URL`).

## Reset local telemetry

```bash
rm -f data/observability.json
```

Restart the dashboard (or trigger any API). The store reseeds. `agents/.venv` and `node_modules` can stay.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Dashboard never starts | `node -v` must be 20+. Delete `node_modules` and rerun `./run-observability.sh`. |
| `The application path is not writable` from create-next-app | You are not using that path at runtime; ignore unless you re-scaffold. |
| Agents: `ensurepip` / venv fails | Script uses `virtualenv`. Or: `python3 -m pip install --user virtualenv`. |
| `Agent runtime is not reachable` | Start `./run-agents.sh`. Check `curl :43148/health`. Confirm `AGENTS_URL`. |
| Agents stay **offline** | Dashboard must be up so register/heartbeat succeed. Wait 60s or restart agents. |
| Copilot Send reloads `?question=` | Hard-refresh `/copilot`. Send sits **under** the box; wait for **Send** (not Loading…). |
| Gemini errors / empty LLM | Remove the key to use fallback, or check `GEMINI_MODEL`. |
| Stale UI | Restart `./run-observability.sh`. Delete `.next` only if HMR is stuck: `rm -rf .next`. |
| Port already allocated | `lsof -i :43147` / `:43148` and stop the old process, or change `.env`. |

## Layout reminder

```
./run-observability.sh    # Next.js  — src/
./run-agents.sh           # Python   — agents/
data/observability.json   # created at runtime
.env                      # local secrets, not committed
```

Interview architecture and design talk track: [INTERVIEW.md](./INTERVIEW.md). API and scoring internals: [TECHNICAL.md](./TECHNICAL.md). Diagrams: [HLD.md](./HLD.md).
