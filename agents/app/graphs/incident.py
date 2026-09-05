from __future__ import annotations

from typing import Any, Literal, TypedDict

from langgraph.graph import END, START, StateGraph

from app.llm import complete
from app.telemetry import Recorder
from app.tools import metrics_snapshot

SYSTEM_PROMPT = """You are Sentinel, an incident commander assistant.
Classify severity, estimate blast radius, and propose the smallest safe mitigation.
Never recommend deleting production data. Log uncertainty explicitly.
If live metrics time out, use the last SLO snapshot and mark the answer degraded."""

GRAPH = {
    "nodes": ["triage", "correlate", "fallback", "runbook", "score"],
    "edges": [
        {"from": "START", "to": "triage"},
        {"from": "triage", "to": "correlate"},
        {"from": "correlate", "to": "fallback"},
        {"from": "correlate", "to": "runbook"},
        {"from": "fallback", "to": "runbook"},
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
    abort: bool
    error: str
    degraded: bool
    recorder: Recorder


def triage_node(state: IncidentState) -> dict[str, Any]:
    rec = state["recorder"]
    text = state["input"].lower()
    severity = "sev1" if any(w in text for w in ("p99", "outage", "5xx", "error rate")) else "sev3"
    rec.log(f"Triaged as {severity}", node="triage")
    fail = "timeout" in text or "18:10" in text
    abort = "abort-runbook" in text
    return {"severity": severity, "fail": fail, "abort": abort, "error": "", "degraded": False}


def correlate_node(state: IncidentState) -> dict[str, Any]:
    rec = state["recorder"]
    if state.get("abort"):
        rec.log("Operator requested abort", node="correlate", level="error")
        return {"error": "Operator aborted the incident graph", "output": "", "confidence": 10.0, "accuracy": 12.0}
    if state.get("fail"):
        rec.log("Live metrics timed out", node="correlate", level="warn")
        return {"error": "metrics_timeout"}
    rec.log("Correlated deploy window with latency jump", node="correlate")
    snap = metrics_snapshot(state["input"])
    fallback = f"Correlation using live path. Snapshot={snap}. Suspect: downstream timeout. Blast radius: checkout + payments."
    correlated = complete(SYSTEM_PROMPT, f"Correlate this incident: {state['input']}\nMetrics: {snap}", fallback)
    return {"correlated": correlated, "error": ""}


def fallback_node(state: IncidentState) -> dict[str, Any]:
    rec = state["recorder"]
    snap = metrics_snapshot(state["input"])
    rec.log("Using cached SLO snapshot after metrics timeout", node="fallback", data=snap)
    correlated = (
        f"Degraded correlation from last-known SLO snapshot: {snap}. "
        "Treat p99 regression as real until live metrics return. Do not page a delete-production runbook."
    )
    return {"correlated": correlated, "error": "", "degraded": True}


def runbook_node(state: IncidentState) -> dict[str, Any]:
    rec = state["recorder"]
    if state.get("abort") and state.get("error"):
        rec.log("Skipping runbook because the graph aborted", node="runbook", level="error")
        return {}
    rec.log("Drafting smallest safe mitigation", node="runbook")
    fallback = (
        f"Severity {state['severity']}. {state['correlated']}\n\n"
        "Mitigation: freeze further deploys, roll back the latest release if error budget is burning, "
        "and add a 2s timeout with retry on payments-api. Do not drop tables or flush caches blindly."
    )
    output = complete(SYSTEM_PROMPT, f"Write a runbook.\n{state['input']}\n{state['correlated']}", fallback)
    if state.get("degraded"):
        output = "[DEGRADED: cached metrics]\n" + output
    return {"output": output}


def score_node(state: IncidentState) -> dict[str, Any]:
    rec = state["recorder"]
    if state.get("abort") and state.get("error"):
        rec.log("Score node received an aborted graph", node="score", level="error")
        return {"confidence": 12.0, "accuracy": 15.0}
    if state.get("degraded"):
        rec.log("Degraded but useful runbook", node="score", level="warn")
        return {"confidence": 58.0, "accuracy": 64.0, "error": ""}
    rec.log("Incident quality score accuracy=82", node="score")
    return {"confidence": 76.0, "accuracy": 82.0}


def after_correlate(state: IncidentState) -> Literal["fallback", "runbook"]:
    if state.get("abort"):
        return "runbook"
    if state.get("error") == "metrics_timeout":
        return "fallback"
    return "runbook"


def build_graph():
    g = StateGraph(IncidentState)
    g.add_node("triage", triage_node)
    g.add_node("correlate", correlate_node)
    g.add_node("fallback", fallback_node)
    g.add_node("runbook", runbook_node)
    g.add_node("score", score_node)
    g.add_edge(START, "triage")
    g.add_edge("triage", "correlate")
    g.add_conditional_edges("correlate", after_correlate, {"fallback": "fallback", "runbook": "runbook"})
    g.add_edge("fallback", "runbook")
    g.add_edge("runbook", "score")
    g.add_edge("score", END)
    return g.compile()


SPEC = {
    "id": "agent_sentinel",
    "name": "Sentinel Incident",
    "slug": "sentinel-incident",
    "description": "Incident agent with a metrics-timeout fallback that still drafts a degraded runbook from SLO snapshots.",
    "role": "incident",
    "systemPrompt": SYSTEM_PROMPT,
    "graph": GRAPH,
    "version": "2.1.0",
}
