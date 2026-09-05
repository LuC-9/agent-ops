"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { CopilotTurn } from "@/lib/types";

const prompts = [
  "Which agent has the weakest trust score and why?",
  "Summarize recent errors and the failing graph nodes.",
  "Show system prompts and what to change first.",
  "How should we fix Sentinel if live metrics time out?",
];

export function CopilotChat({ initial }: { initial: CopilotTurn[] }) {
  const [messages, setMessages] = useState(initial);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(q = question) {
    const text = q.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    setQuestion("");
    try {
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Copilot failed");
      else setMessages(data.messages ?? []);
    } catch {
      setError("Copilot request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 md:p-8">
      <div>
        <p className="font-mono text-xs tracking-[0.25em] text-cyan-400/80">OBSERVABILITY AGENT</p>
        <h1 className="text-2xl font-semibold text-slate-50">Ask the fleet</h1>
        <p className="mt-1 text-sm text-slate-400">
          Answers from traces, scores, and prompts. Gemini is preferred when GEMINI_API_KEY is set; otherwise a local analyst still works.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {prompts.map((p) => (
          <Button key={p} size="sm" variant="outline" onClick={() => send(p)} disabled={busy}>
            {p}
          </Button>
        ))}
      </div>
      <div className="min-h-[320px] space-y-3 rounded-lg border border-white/10 bg-[#10202c]/90 p-4">
        {messages.length === 0 && (
          <p className="text-sm text-slate-500">No conversation yet. Ask about trust, errors, or prompts.</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "text-right" : ""}>
            <p className="text-[11px] text-slate-500">{m.role}</p>
            <pre className={`inline-block max-w-full whitespace-pre-wrap rounded-md px-3 py-2 text-sm ${m.role === "user" ? "bg-cyan-400/10 text-cyan-100" : "bg-black/30 text-slate-200"}`}>
              {m.content}
            </pre>
          </div>
        ))}
      </div>
      {error && <p className="text-sm text-rose-300">{error}</p>}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about a trace, agent, or score…"
          className="min-h-20"
        />
        <Button onClick={() => send()} disabled={busy || !question.trim()}>
          {busy ? "Thinking…" : "Send"}
        </Button>
      </div>
    </div>
  );
}
