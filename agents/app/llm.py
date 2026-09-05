from __future__ import annotations

import os
from langchain_core.messages import HumanMessage, SystemMessage


def complete(system: str, user: str, fallback: str) -> str:
    gemini_key = os.getenv("GEMINI_API_KEY")
    openai_key = os.getenv("OPENAI_API_KEY")
    try:
        if gemini_key:
            from langchain_google_genai import ChatGoogleGenerativeAI

            model = ChatGoogleGenerativeAI(
                model=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
                temperature=0.2,
                google_api_key=gemini_key,
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
            )
            msg = model.invoke([SystemMessage(content=system), HumanMessage(content=user)])
            content = msg.content
            return content if isinstance(content, str) else str(content)
    except Exception:
        return fallback
    return fallback
