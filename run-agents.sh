#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT/agents"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

export OBSERVABILITY_URL="${OBSERVABILITY_URL:-http://127.0.0.1:43147}"
export AGENTS_PORT="${AGENTS_PORT:-43148}"

if [[ ! -d .venv ]]; then
  echo "Creating Python virtualenv for LangGraph agents..."
  python3 -m venv .venv
fi

# shellcheck disable=SC1091
source .venv/bin/activate
pip install -q -r requirements.txt

echo "LangGraph agents → http://127.0.0.1:${AGENTS_PORT}"
echo "Registering with observability at ${OBSERVABILITY_URL}"
echo "Start the dashboard first with ./run-observability.sh if you have not already."
exec uvicorn app.server:app --host 0.0.0.0 --port "${AGENTS_PORT}"
