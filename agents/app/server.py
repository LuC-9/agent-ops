from __future__ import annotations

import os
import threading
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.graphs import code_review, incident, research, support
from app.telemetry import Recorder, heartbeat, register_agent

MODULES = {
    research.SPEC["slug"]: research,
    support.SPEC["slug"]: support,
    code_review.SPEC["slug"]: code_review,
    incident.SPEC["slug"]: incident,
}

GRAPHS = {slug: mod.build_graph() for slug, mod in MODULES.items()}
MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini") if os.getenv("OPENAI_API_KEY") else "deterministic-pack"


class InvokeBody(BaseModel):
    slug: str
    input: str


def onboard_all() -> None:
    port = os.getenv("AGENTS_PORT", "43148")
    endpoint = f"http://127.0.0.1:{port}/invoke"
    for attempt in range(30):
        results = []
        for mod in MODULES.values():
            spec = {**mod.SPEC, "endpoint": endpoint}
            results.append(register_agent(spec))
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


app = FastAPI(title="Northstar Agent Runtime", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"ok": True, "agents": list(MODULES), "model": MODEL}


@app.get("/agents")
def list_agents():
    return {"agents": [mod.SPEC for mod in MODULES.values()]}


@app.post("/invoke")
def invoke(body: InvokeBody):
    mod = MODULES.get(body.slug)
    graph = GRAPHS.get(body.slug)
    if not mod or not graph:
        raise HTTPException(404, f"Unknown agent slug {body.slug}")
    rec = Recorder(body.slug, mod.SPEC["systemPrompt"], MODEL)
    rec.log("Graph compile cached; starting run")
    try:
        state = graph.invoke(
            {
                "input": body.input,
                "recorder": rec,
                "output": "",
                "confidence": 0.0,
                "accuracy": 0.0,
                "error": "",
                "fail": False,
            }
        )
    except Exception as exc:  # noqa: BLE001
        rec.log(str(exc), level="error")
        trace = rec.ingest(body.input, "", status="error", error=str(exc), accuracy=15, confidence=10)
        return {"trace": trace, "error": str(exc)}

    error = state.get("error") or None
    status = "error" if error else "ok"
    output = state.get("output") or ""
    trace = rec.ingest(
        body.input,
        output,
        status=status,
        accuracy=state.get("accuracy"),
        confidence=state.get("confidence"),
        error=error,
    )
    return {"trace": trace, "output": output, "status": status}
