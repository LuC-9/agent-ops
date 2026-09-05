from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class Evidence:
    title: str
    source_id: str
    snippet: str


KNOWLEDGE: list[Evidence] = [
    Evidence(
        "LangGraph checkpointer",
        "lg-persist-1",
        "A checkpointer saves graph state per thread_id so a run can resume. It is not a document store.",
    ),
    Evidence(
        "LangGraph store",
        "lg-persist-2",
        "The store API holds long-lived memories across threads. Use it for user facts, not step checkpoints.",
    ),
    Evidence(
        "Trust scoring",
        "obs-trust-1",
        "Operational trust blends task accuracy, calibration (confidence vs correctness), and historical reliability.",
    ),
    Evidence(
        "LLM-as-judge caveats",
        "obs-eval-1",
        "Judges correlate poorly on open-ended work unless the rubric is tight and citations are required.",
    ),
]


POLICIES = {
    "billing": (
        "No automatic credits. Refunds require usage evidence. "
        "Escalate suspected billing errors likely over $500 to human billing. Never invent a credit."
    ),
    "product": (
        "Product issues get a repro checklist and a status-page pointer. Do not promise ETAs."
    ),
    "security": (
        "Account takeover reports freeze sessions and require identity verification. Do not reset passwords in chat."
    ),
}


SLO_SNAPSHOT = {
    "payments-api": {"p99_ms": 2400, "error_rate": 0.024, "slo_p99_ms": 300},
    "checkout": {"p99_ms": 3100, "error_rate": 0.018, "slo_p99_ms": 400},
}


def retrieve_evidence(query: str, k: int = 3) -> list[Evidence]:
    q = query.lower()
    ranked: list[tuple[int, Evidence]] = []
    for item in KNOWLEDGE:
        hay = f"{item.title} {item.snippet}".lower()
        score = sum(1 for token in re.findall(r"[a-z0-9]+", q) if token in hay)
        ranked.append((score, item))
    ranked.sort(key=lambda pair: pair[0], reverse=True)
    picked = [item for score, item in ranked if score > 0][:k]
    return picked or KNOWLEDGE[:k]


def lookup_policy(intent: str) -> str:
    return POLICIES.get(intent, POLICIES["product"])


def classify_intent(text: str) -> str:
    t = text.lower()
    if any(w in t for w in ("refund", "invoice", "charge", "bill", "credit")):
        return "billing"
    if any(w in t for w in ("hack", "phishing", "takeover", "password")):
        return "security"
    return "product"


def metrics_snapshot(query: str) -> dict[str, dict[str, float]]:
    t = query.lower()
    if "payment" in t:
        return {"payments-api": SLO_SNAPSHOT["payments-api"]}
    if "checkout" in t:
        return {"checkout": SLO_SNAPSHOT["checkout"]}
    return SLO_SNAPSHOT


def scan_code(snippet: str) -> list[dict[str, str]]:
    findings: list[dict[str, str]] = []
    upper = snippet.upper()
    interpolated = any(tok in snippet for tok in ('f"', "f'", "+")) or ".FORMAT(" in upper
    if "SELECT" in upper and interpolated:
        findings.append(
            {
                "cwe": "CWE-89",
                "severity": "high",
                "title": "SQL injection via string interpolation",
                "fix": "Use bound parameters / a query builder.",
            }
        )
    if "EVAL(" in upper or "EXEC(" in upper:
        findings.append(
            {
                "cwe": "CWE-95",
                "severity": "high",
                "title": "Dynamic execution of untrusted code",
                "fix": "Remove eval/exec; parse input explicitly.",
            }
        )
    if "VERIFY=FALSE" in upper or "SSL" in upper and "FALSE" in upper:
        findings.append(
            {
                "cwe": "CWE-295",
                "severity": "medium",
                "title": "TLS verification disabled",
                "fix": "Keep certificate verification enabled.",
            }
        )
    if not findings:
        findings.append(
            {
                "cwe": "CWE-703",
                "severity": "low",
                "title": "No high-risk pattern matched",
                "fix": "Still review error handling, authz, and tests.",
            }
        )
    return findings
