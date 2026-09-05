#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

PORT="${PORT:-43147}"

if [[ ! -d node_modules ]]; then
  echo "Installing observability platform dependencies..."
  npm install
fi

echo "Northstar observability platform → http://127.0.0.1:${PORT}"
exec npx next dev --hostname 0.0.0.0 --port "${PORT}"
