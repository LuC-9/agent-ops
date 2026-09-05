from __future__ import annotations

import os
from langchain_core.messages import HumanMessage, SystemMessage


def complete(system: str, user: str, fallback: str) -> str:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return fallback
    from langchain_openai import ChatOpenAI

    model = ChatOpenAI(
        model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        temperature=0.2,
        api_key=api_key,
    )
    msg = model.invoke([SystemMessage(content=system), HumanMessage(content=user)])
    content = msg.content
    if isinstance(content, str):
        return content
    return str(content)
