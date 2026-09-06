from __future__ import annotations

import os
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout
from contextvars import ContextVar
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

_LLM_TIMEOUT_S = float(os.getenv("LLM_TIMEOUT_S", "25"))
_EXECUTOR = ThreadPoolExecutor(max_workers=4)
_USAGE: ContextVar[list[dict[str, Any]] | None] = ContextVar("llm_usage", default=None)


def bind_usage_bucket() -> list[dict[str, Any]]:
    bucket: list[dict[str, Any]] = []
    _USAGE.set(bucket)
    return bucket


def take_usage() -> list[dict[str, Any]]:
    return list(_USAGE.get() or [])


def _tokens(text: str) -> int:
    return max(1, (len(text) + 3) // 4)


def _invoke(system: str, user: str) -> str:
    gemini_key = os.getenv("GEMINI_API_KEY")
    openai_key = os.getenv("OPENAI_API_KEY")
    if gemini_key:
        from langchain_google_genai import ChatGoogleGenerativeAI

        model = ChatGoogleGenerativeAI(
            model=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
            temperature=0.2,
            google_api_key=gemini_key,
            timeout=_LLM_TIMEOUT_S,
        )
        msg = model.invoke([SystemMessage(content=system), HumanMessage(content=user)])
        content = msg.content
        return content if isinstance(content, str) else str(content)
    if openai_key:
        from langchain_openai import ChatOpenAI

        model = ChatOpenAI(
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            temperature=0.2,
            api_key=openai_key,
            timeout=_LLM_TIMEOUT_S,
        )
        msg = model.invoke([SystemMessage(content=system), HumanMessage(content=user)])
        content = msg.content
        return content if isinstance(content, str) else str(content)
    raise RuntimeError("no_llm")


def complete(system: str, user: str, fallback: str, *, node: str | None = None) -> str:
    started = time.time()
    model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash") if os.getenv("GEMINI_API_KEY") else (
        os.getenv("OPENAI_MODEL", "gpt-4o-mini") if os.getenv("OPENAI_API_KEY") else "deterministic-pack"
    )
    provider = "gemini" if os.getenv("GEMINI_API_KEY") else "openai" if os.getenv("OPENAI_API_KEY") else "local"
    used_fallback = False
    text = fallback
    if os.getenv("GEMINI_API_KEY") or os.getenv("OPENAI_API_KEY"):
        try:
            future = _EXECUTOR.submit(_invoke, system, user)
            text = future.result(timeout=_LLM_TIMEOUT_S)
        except (FuturesTimeout, Exception):
            used_fallback = True
            text = fallback
    else:
        used_fallback = True
    bucket = _USAGE.get()
    if bucket is not None:
        bucket.append(
            {
                "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "purpose": "agent",
                "model": model,
                "node": node,
                "promptTokens": _tokens(system + user),
                "completionTokens": _tokens(text),
                "latencyMs": int((time.time() - started) * 1000),
                "fallback": used_fallback,
                "provider": provider if not used_fallback else "local",
            }
        )
    return text
