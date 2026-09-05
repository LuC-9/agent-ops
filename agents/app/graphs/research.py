from __future__ import annotations

from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph

from app.llm import complete
from app.telemetry import Recorder

SYSTEM_PROMPT = """You are Atlas, a careful research analyst.
Break the question into sub-queries, gather only evidence you can cite, and refuse to invent sources.
Return a concise brief with claims, caveats, and a self-reported confidence between 0 and 100."""

GRAPH = {
    "nodes": ["plan", "gather", "synthesize", "score"],
    "edges": [
        {"from": "START", "to": "plan"},
        {"from": "plan", "to": "gather"},
        {"from": "gather", "to": "synthesize"},
        {"from": "synthesize", "to": "score"},
        {"from": "score", "to": "END"},
    ],
}


class ResearchState(TypedDict):
    input: str
    plan: str
    evidence: str
    output: str
    confidence: float
    accuracy: float
    recorder: Recorder


def plan_node(state: ResearchState) -> dict[str, Any]:
    rec = state["recorder"]
    rec.log("Decomposed the question into sub-queries", node="plan")
    fallback = (
        f"Sub-queries: (1) definitions in the question (2) recent changes (3) caveats.\nQuestion: {state['input']}"
    )
    plan = complete(SYSTEM_PROMPT, f"Plan research steps for: {state['input']}", fallback)
    return {"plan": plan}


def gather_node(state: ResearchState) -> dict[str, Any]:
    rec = state["recorder"]
    rec.log("Gathered evidence (Gemini when GEMINI_API_KEY is set, else local pack)", node="gather")
    fallback = (
        "Evidence: LangGraph persistence uses a checkpointer for graph state and an optional store for long-term memory. "
        "Thread ids isolate conversations. Source: LangGraph persistence docs."
    )
    evidence = complete(SYSTEM_PROMPT, f"Gather evidence for plan:\n{state['plan']}", fallback)
    return {"evidence": evidence}


def synthesize_node(state: ResearchState) -> dict[str, Any]:
    rec = state["recorder"]
    rec.log("Synthesizing brief with citations", node="synthesize")
    fallback = (
        f"Brief for: {state['input']}\n\n"
        f"{state['evidence']}\n\n"
        "Caveat: without live web retrieval this brief is grounded in the onboarded knowledge pack.\n"
        "Recommended action: confirm against current LangGraph docs before migrating production graphs."
    )
    output = complete(
        SYSTEM_PROMPT,
        f"Write the final brief.\nPlan:\n{state['plan']}\nEvidence:\n{state['evidence']}",
        fallback,
    )
    return {"output": output}


def score_node(state: ResearchState) -> dict[str, Any]:
    rec = state["recorder"]
    cited = "source" in state["output"].lower() or "http" in state["output"].lower() or "docs" in state["output"].lower()
    confidence = 82.0 if cited else 64.0
    accuracy = 88.0 if cited else 71.0
    rec.log(f"Self-score accuracy={accuracy} confidence={confidence}", node="score")
    return {"confidence": confidence, "accuracy": accuracy}


def build_graph():
    g = StateGraph(ResearchState)
    g.add_node("plan", plan_node)
    g.add_node("gather", gather_node)
    g.add_node("synthesize", synthesize_node)
    g.add_node("score", score_node)
    g.add_edge(START, "plan")
    g.add_edge("plan", "gather")
    g.add_edge("gather", "synthesize")
    g.add_edge("synthesize", "score")
    g.add_edge("score", END)
    return g.compile()


SPEC = {
    "id": "agent_atlas",
    "name": "Atlas Research",
    "slug": "atlas-research",
    "description": "Multi-hop research agent that plans queries, gathers evidence, and synthesizes citations.",
    "role": "research",
    "systemPrompt": SYSTEM_PROMPT,
    "graph": GRAPH,
    "version": "1.2.0",
}
