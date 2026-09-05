from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout
from langchain_core.messages import HumanMessage, SystemMessage

_LLM_TIMEOUT_S = float(os.getenv("LLM_TIMEOUT_S", "25"))
_EXECUTOR = ThreadPoolExecutor(max_workers=4)


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


def complete(system: str, user: str, fallback: str) -> str:
    if not os.getenv("GEMINI_API_KEY") and not os.getenv("OPENAI_API_KEY"):
        return fallback
    try:
        future = _EXECUTOR.submit(_invoke, system, user)
        return future.result(timeout=_LLM_TIMEOUT_S)
    except (FuturesTimeout, Exception):
        return fallback
