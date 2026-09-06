from __future__ import annotations

import os
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.graphs import code_review, incident, research, support
from app.llm import bind_usage_bucket, take_usage
from app.telemetry import Recorder, heartbeat, register_agent

MODULES = {
    research.SPEC["slug"]: research,
    support.SPEC["slug"]: support,
    code_review.SPEC["slug"]: code_review,
    incident.SPEC["slug"]: incident,
}

GRAPHS = {slug: mod.build_graph() for slug, mod in MODULES.items()}
if os.getenv("GEMINI_API_KEY"):
    MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
elif os.getenv("OPENAI_API_KEY"):
    MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
else:
    MODEL = "deterministic-pack"

MAX_INPUT = 8000
INVOKE_TIMEOUT_S = float(os.getenv("INVOKE_TIMEOUT_S", "60"))
_EXECUTOR = ThreadPoolExecutor(max_workers=8)


class InvokeBody(BaseModel):
    slug: str = Field(min_length=1, max_length=80)
    input: str = Field(min_length=1, max_length=MAX_INPUT)
    thread_id: str | None = None


def onboard_all() -> None:
    port = os.getenv("AGENTS_PORT", "43148")
    endpoint = f"http://127.0.0.1:{port}/invoke"
    for _attempt in range(30):
        results = [register_agent({**mod.SPEC, "endpoint": endpoint}) for mod in MODULES.values()]
        if all(results):
            return
        time.sleep(2)


def heartbeat_loop() -> None:
    while True:
        for slug in MODULES:
            heartbeat(slug)
        time.sleep(20)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    onboard_all()
    t = threading.Thread(target=heartbeat_loop, daemon=True)
    t.start()
    yield


app = FastAPI(title="Northstar Agent Runtime", version="2.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"ok": True, "agents": list(MODULES), "model": MODEL, "timeout_s": INVOKE_TIMEOUT_S}


@app.get("/agents")
def list_agents():
    return {"agents": [mod.SPEC for mod in MODULES.values()]}


def _run_graph(slug: str, body: InvokeBody) -> dict:
    mod = MODULES[slug]
    graph = GRAPHS[slug]
    rec = Recorder(slug, mod.SPEC["systemPrompt"], MODEL, thread_id=body.thread_id or str(uuid.uuid4()))
    rec.log("Graph compile cached; starting run")
    bind_usage_bucket()
    state = graph.invoke(
        {
            "input": body.input,
            "recorder": rec,
            "output": "",
            "confidence": 0.0,
            "accuracy": 0.0,
            "error": "",
            "fail": False,
            "abort": False,
            "degraded": False,
            "cited": False,
            "escalate": False,
            "plan": "",
            "evidence": "",
            "intent": "",
            "policy": "",
            "parsed": "",
            "findings": "",
            "severity": "",
            "correlated": "",
        },
        {"recursion_limit": 12},
    )
    rec.usages = take_usage()
    abort_error = state.get("abort") and state.get("error")
    error = (state.get("error") if abort_error else None) or None
    status = "error" if error else "ok"
    output = state.get("output") or ""
    trace = rec.ingest(
        body.input,
        output,
        status=status,
        accuracy=state.get("accuracy"),
        confidence=state.get("confidence"),
        error=error,
        degraded=bool(state.get("degraded")),
    )
    return {"trace": trace, "output": output, "status": status, "degraded": bool(state.get("degraded"))}


@app.post("/invoke")
def invoke(body: InvokeBody):
    if body.slug not in MODULES:
        raise HTTPException(404, f"Unknown agent slug {body.slug}")
    try:
        future = _EXECUTOR.submit(_run_graph, body.slug, body)
        return future.result(timeout=INVOKE_TIMEOUT_S)
    except FuturesTimeout:
        raise HTTPException(504, "Agent graph timed out") from None
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        rec = Recorder(body.slug, MODULES[body.slug].SPEC["systemPrompt"], MODEL)
        rec.log(str(exc), level="error")
        trace = rec.ingest(body.input, "", status="error", error=str(exc), accuracy=15, confidence=10)
        return {"trace": trace, "error": str(exc), "status": "error"}
