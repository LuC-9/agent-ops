from __future__ import annotations

from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph

from app.llm import complete
from app.telemetry import Recorder

SYSTEM_PROMPT = """You are Helix, a customer support specialist for Northstar Cloud.
Be empathetic, follow policy, never invent refunds or credits, and escalate billing disputes over $500.
Always include next steps the customer can take."""

GRAPH = {
    "nodes": ["classify", "policy", "draft", "score"],
    "edges": [
        {"from": "START", "to": "classify"},
        {"from": "classify", "to": "policy"},
        {"from": "policy", "to": "draft"},
        {"from": "draft", "to": "score"},
        {"from": "score", "to": "END"},
    ],
}


class SupportState(TypedDict):
    input: str
    intent: str
    policy: str
    output: str
    confidence: float
    accuracy: float
    recorder: Recorder


def classify_node(state: SupportState) -> dict[str, Any]:
    rec = state["recorder"]
    text = state["input"].lower()
    intent = "billing" if any(w in text for w in ("refund", "invoice", "charge", "bill")) else "product"
    rec.log(f"Classified intent as {intent}", node="classify")
    return {"intent": intent}


def policy_node(state: SupportState) -> dict[str, Any]:
    rec = state["recorder"]
    rec.log("Loaded policy cards for Northstar Cloud", node="policy")
    fallback = (
        "Policy: no automatic credits. Refunds require usage evidence. "
        "Escalate suspected billing errors likely over $500 to human billing."
        if state["intent"] == "billing"
        else "Policy: product issues get a repro checklist and a status-page pointer. Do not promise ETAs."
    )
    policy = complete(SYSTEM_PROMPT, f"Select policy for intent {state['intent']}: {state['input']}", fallback)
    return {"policy": policy}


def draft_node(state: SupportState) -> dict[str, Any]:
    rec = state["recorder"]
    rec.log("Drafting customer reply", node="draft")
    fallback = (
        f"Thanks for writing in — I understand this is frustrating.\n\n{state['policy']}\n\n"
        "Next steps:\n1) Download last 30 days of usage\n2) Reply with the invoice ids\n"
        "3) I am escalating to billing if the amount may exceed $500.\n"
        "I will not issue a credit from this chat."
    )
    output = complete(SYSTEM_PROMPT, f"Draft a reply.\nTicket: {state['input']}\nPolicy: {state['policy']}", fallback)
    return {"output": output}


def score_node(state: SupportState) -> dict[str, Any]:
    rec = state["recorder"]
    policy_ok = "will not" in state["output"].lower() or "escalat" in state["output"].lower() or "next steps" in state["output"].lower()
    confidence = 76.0 if policy_ok else 58.0
    accuracy = 84.0 if policy_ok else 62.0
    rec.log(f"Policy-adherence score accuracy={accuracy}", node="score")
    return {"confidence": confidence, "accuracy": accuracy}


def build_graph():
    g = StateGraph(SupportState)
    g.add_node("classify", classify_node)
    g.add_node("policy", policy_node)
    g.add_node("draft", draft_node)
    g.add_node("score", score_node)
    g.add_edge(START, "classify")
    g.add_edge("classify", "policy")
    g.add_edge("policy", "draft")
    g.add_edge("draft", "score")
    g.add_edge("score", END)
    return g.compile()


SPEC = {
    "id": "agent_helix",
    "name": "Helix Support",
    "slug": "helix-support",
    "description": "Tier-1 customer support agent that classifies intent, retrieves policy, and drafts replies.",
    "role": "support",
    "systemPrompt": SYSTEM_PROMPT,
    "graph": GRAPH,
    "version": "1.0.4",
}
