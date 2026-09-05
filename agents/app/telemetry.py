from __future__ import annotations

import os
import time
from datetime import datetime, timezone
from typing import Any

import httpx

OBSERVABILITY_URL = os.getenv("OBSERVABILITY_URL", "http://127.0.0.1:43147").rstrip("/")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _post_with_retry(url: str, payload: dict[str, Any], *, attempts: int = 3, timeout: float = 10.0) -> httpx.Response:
    last_exc: Exception | None = None
    for i in range(attempts):
        try:
            res = httpx.post(url, json=payload, timeout=timeout)
            if res.status_code >= 500:
                raise httpx.HTTPStatusError("server error", request=res.request, response=res)
            return res
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            time.sleep(0.4 * (2**i))
    assert last_exc is not None
    raise last_exc


class Recorder:
    def __init__(self, slug: str, system_prompt: str, model: str, thread_id: str | None = None) -> None:
        self.slug = slug
        self.system_prompt = system_prompt
        self.model = model
        self.thread_id = thread_id
        self.logs: list[dict[str, Any]] = []
        self.started = time.time()
        self.started_at = _now()

    def log(self, message: str, *, node: str | None = None, level: str = "info", data: dict[str, Any] | None = None) -> None:
        self.logs.append(
            {
                "ts": _now(),
                "level": level,
                "node": node,
                "message": message,
                "data": data or {},
            }
        )

    def ingest(
        self,
        request: str,
        response: str,
        *,
        status: str = "ok",
        accuracy: float | None = None,
        confidence: float | None = None,
        error: str | None = None,
        degraded: bool = False,
    ) -> dict[str, Any]:
        ended = time.time()
        payload = {
            "slug": self.slug,
            "request": request,
            "response": response,
            "systemPrompt": self.system_prompt,
            "status": status,
            "accuracy": accuracy,
            "confidence": confidence,
            "error": error,
            "logs": self.logs,
            "startedAt": self.started_at,
            "endedAt": _now(),
            "latencyMs": int((ended - self.started) * 1000),
            "model": self.model,
            "threadId": self.thread_id,
            "degraded": degraded,
        }
        url = f"{OBSERVABILITY_URL}/api/ingest"
        try:
            res = _post_with_retry(url, payload)
            res.raise_for_status()
            return res.json().get("trace", payload)
        except Exception as exc:  # noqa: BLE001
            self.log(f"ingest failed: {exc}", level="warn")
            return payload


def register_agent(spec: dict[str, Any]) -> dict[str, Any] | None:
    url = f"{OBSERVABILITY_URL}/api/agents"
    try:
        res = _post_with_retry(url, spec)
        res.raise_for_status()
        return res.json().get("agent")
    except Exception:
        return None


def heartbeat(slug: str) -> None:
    try:
        httpx.post(f"{OBSERVABILITY_URL}/api/agents/{slug}", timeout=5.0)
    except Exception:
        return
