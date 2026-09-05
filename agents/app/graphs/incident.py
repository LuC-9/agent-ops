from __future__ import annotations

from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph

from app.llm import complete
from app.telemetry import Recorder

SYSTEM_PROMPT = """You are Sentinel, an incident commander assistant.
Classify severity, estimate blast radius, and propose the smallest safe mitigation.
Never recommend deleting production data. Log uncertainty explicitly."""

GRAPH = {
    "nodes": ["triage", "correlate", "runbook", "score"],
    "edges": [
        {"from": "START", "to": "triage"},
        {"from": "triage", "to": "correlate"},
        {"from": "correlate", "to": "runbook"},
        {"from": "runbook", "to": "score"},
        {"from": "score", "to": "END"},
    ],
}


class IncidentState(TypedDict):
    input: str
    severity: str
    correlated: str
    output: str
    confidence: float
    accuracy: float
    fail: bool
    error: str
    recorder: Recorder


def triage_node(state: IncidentState) -> dict[str, Any]:
    rec = state["recorder"]
    text = state["input"].lower()
    severity = "sev1" if any(w in text for w in ("p99", "outage", "5xx", "error rate")) else "sev3"
    rec.log(f"Triaged as {severity}", node="triage")
    fail = "timeout" in text or "18:10" in text
    return {"severity": severity, "fail": fail, "error": ""}


def correlate_node(state: IncidentState) -> dict[str, Any]:
    rec = state["recorder"]
    if state.get("fail"):
        rec.log("Tool node correlate timed out while fetching service metrics", node="correlate", level="error")
        return {
            "correlated": "",
            "error": "Tool node correlate timed out while fetching service metrics",
            "output": "",
            "confidence": 18.0,
            "accuracy": 20.0,
        }
    rec.log("Correlated deploy window with latency jump", node="correlate")
    fallback = (
        "Correlation: latency regression aligns with the latest deploy. "
        "Suspect: missing index or a downstream dependency timeout. Blast radius: checkout + payments."
    )
    correlated = complete(SYSTEM_PROMPT, f"Correlate this incident: {state['input']}", fallback)
    return {"correlated": correlated}


def runbook_node(state: IncidentState) -> dict[str, Any]:
    rec = state["recorder"]
    if state.get("error"):
        rec.log("Skipping runbook because correlate failed", node="runbook", level="warn")
        return {}
    rec.log("Drafting smallest safe mitigation", node="runbook")
    fallback = (
        f"Severity {state['severity']}. {state['correlated']}\n\n"
        "Mitigation: freeze further deploys, roll back the 19:12 release if error budget is burning, "
        "and add a 2s timeout with retry on payments-api. Do not drop tables or flush caches blindly."
    )
    output = complete(SYSTEM_PROMPT, f"Write a runbook.\n{state['input']}\n{state['correlated']}", fallback)
    return {"output": output}


def score_node(state: IncidentState) -> dict[str, Any]:
    rec = state["recorder"]
    if state.get("error"):
        rec.log("Score node received a failed graph", node="score", level="error")
        return {"confidence": 18.0, "accuracy": 20.0}
    confidence = 73.0
    accuracy = 80.0
    rec.log(f"Incident quality score accuracy={accuracy}", node="score")
    return {"confidence": confidence, "accuracy": accuracy}


def build_graph():
    g = StateGraph(IncidentState)
    g.add_node("triage", triage_node)
    g.add_node("correlate", correlate_node)
    g.add_node("runbook", runbook_node)
    g.add_node("score", score_node)
    g.add_edge(START, "triage")
    g.add_edge("triage", "correlate")
    g.add_edge("correlate", "runbook")
    g.add_edge("runbook", "score")
    g.add_edge("score", END)
    return g.compile()


SPEC = {
    "id": "agent_sentinel",
    "name": "Sentinel Incident",
    "slug": "sentinel-incident",
    "description": "On-call incident agent that correlates symptoms, proposes blast-radius, and drafts runbooks.",
    "role": "incident",
    "systemPrompt": SYSTEM_PROMPT,
    "graph": GRAPH,
    "version": "2.0.0",
}
