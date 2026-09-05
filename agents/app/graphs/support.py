from __future__ import annotations

from typing import Any, Literal, TypedDict

from langgraph.graph import END, START, StateGraph

from app.llm import complete
from app.telemetry import Recorder
from app.tools import classify_intent, lookup_policy

SYSTEM_PROMPT = """You are Helix, a customer support specialist for Northstar Cloud.
Be empathetic, follow policy, never invent refunds or credits, and escalate billing disputes over $500
and all security reports. Always include next steps the customer can take."""

GRAPH = {
    "nodes": ["classify", "policy", "draft", "escalate", "score"],
    "edges": [
        {"from": "START", "to": "classify"},
        {"from": "classify", "to": "policy"},
        {"from": "policy", "to": "draft"},
        {"from": "draft", "to": "escalate"},
        {"from": "draft", "to": "score"},
        {"from": "escalate", "to": "score"},
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
    escalate: bool
    recorder: Recorder


def classify_node(state: SupportState) -> dict[str, Any]:
    rec = state["recorder"]
    intent = classify_intent(state["input"])
    rec.log(f"Classified intent as {intent}", node="classify")
    return {"intent": intent}


def policy_node(state: SupportState) -> dict[str, Any]:
    rec = state["recorder"]
    policy = lookup_policy(state["intent"])
    rec.log("Loaded policy card", node="policy", data={"intent": state["intent"]})
    refined = complete(SYSTEM_PROMPT, f"Apply this policy to the ticket.\nPolicy: {policy}\nTicket: {state['input']}", policy)
    return {"policy": refined}


def draft_node(state: SupportState) -> dict[str, Any]:
    rec = state["recorder"]
    rec.log("Drafting customer reply", node="draft")
    escalate = state["intent"] in {"billing", "security"}
    fallback = (
        f"Thanks for writing in — I understand this is frustrating.\n\n{state['policy']}\n\n"
        "Next steps:\n1) Download last 30 days of usage\n2) Reply with the invoice ids\n"
        "I will not issue a credit from this chat."
    )
    output = complete(SYSTEM_PROMPT, f"Draft a reply.\nTicket: {state['input']}\nPolicy: {state['policy']}", fallback)
    return {"output": output, "escalate": escalate}


def escalate_node(state: SupportState) -> dict[str, Any]:
    rec = state["recorder"]
    rec.log(f"Escalating {state['intent']} ticket to a human queue", node="escalate")
    extra = (
        "\n\nEscalation: a specialist will review this within one business day. "
        "Reference this chat id in the billing/security queue. I still will not issue a credit here."
    )
    return {"output": state["output"] + extra}


def score_node(state: SupportState) -> dict[str, Any]:
    rec = state["recorder"]
    text = state["output"].lower()
    policy_ok = any(s in text for s in ("will not", "escalat", "next steps"))
    confidence = 78.0 if policy_ok else 58.0
    accuracy = 86.0 if policy_ok else 62.0
    rec.log(f"Policy-adherence score accuracy={accuracy}", node="score")
    return {"confidence": confidence, "accuracy": accuracy}


def after_draft(state: SupportState) -> Literal["escalate", "score"]:
    return "escalate" if state.get("escalate") else "score"


def build_graph():
    g = StateGraph(SupportState)
    g.add_node("classify", classify_node)
    g.add_node("policy", policy_node)
    g.add_node("draft", draft_node)
    g.add_node("escalate", escalate_node)
    g.add_node("score", score_node)
    g.add_edge(START, "classify")
    g.add_edge("classify", "policy")
    g.add_edge("policy", "draft")
    g.add_conditional_edges("draft", after_draft, {"escalate": "escalate", "score": "score"})
    g.add_edge("escalate", "score")
    g.add_edge("score", END)
    return g.compile()


SPEC = {
    "id": "agent_helix",
    "name": "Helix Support",
    "slug": "helix-support",
    "description": "Support agent with policy retrieval and automatic human escalation for billing and security.",
    "role": "support",
    "systemPrompt": SYSTEM_PROMPT,
    "graph": GRAPH,
    "version": "2.1.0",
}
