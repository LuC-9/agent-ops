"use client";

import { useEffect, useRef, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import type { CopilotTurn } from "@/lib/types";
import { cn } from "@/lib/utils";

const prompts = [
  "Which agent has the weakest trust score and why?",
  "Summarize recent errors and the failing graph nodes.",
  "Show system prompts and what to change first.",
  "How should we fix Sentinel if live metrics time out?",
];

function apiError(data: unknown, fallback: string) {
  if (!data || typeof data !== "object") return fallback;
  const rec = data as { error?: unknown; detail?: unknown };
  if (typeof rec.error === "string" && rec.error) return rec.error;
  if (typeof rec.detail === "string" && rec.detail) return rec.detail;
  return fallback;
}

export function CopilotChat({ initial }: { initial: CopilotTurn[] }) {
  const [messages, setMessages] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const inFlight = useRef(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  async function send(raw: string) {
    const text = raw.trim();
    if (!text) {
      setError("Type a question, then press Send.");
      return;
    }
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    formRef.current?.reset();
    const pendingUser: CopilotTurn = {
      id: `local_u_${Date.now()}`,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    const pendingAssistant: CopilotTurn = {
      id: `local_a_${Date.now()}`,
      role: "assistant",
      content: "Thinking…",
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, pendingUser, pendingAssistant]);
    requestAnimationFrame(() => {
      boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight, behavior: "smooth" });
    });
    try {
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
        signal: AbortSignal.timeout(45_000),
      });
      const data = (await res.json()) as { messages?: CopilotTurn[]; error?: string; detail?: string };
      if (!res.ok) {
        setError(apiError(data, "Copilot failed"));
        setMessages((prev) => prev.filter((m) => m.id !== pendingUser.id && m.id !== pendingAssistant.id));
        if (formRef.current) {
          const area = formRef.current.elements.namedItem("question");
          if (area instanceof HTMLTextAreaElement) area.value = text;
        }
        return;
      }
      setMessages(Array.isArray(data.messages) && data.messages.length ? data.messages : [pendingUser, { ...pendingAssistant, content: "No reply returned." }]);
    } catch (err) {
      const timedOut = err instanceof DOMException && err.name === "TimeoutError";
      setError(timedOut ? "Copilot timed out. Try again." : "Copilot request failed");
      setMessages((prev) => prev.filter((m) => m.id !== pendingUser.id && m.id !== pendingAssistant.id));
      if (formRef.current) {
        const area = formRef.current.elements.namedItem("question");
        if (area instanceof HTMLTextAreaElement) area.value = text;
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 md:p-8">
      <div>
        <p className="font-mono text-xs tracking-[0.25em] text-cyan-400/80">OBSERVABILITY AGENT</p>
        <h1 className="text-2xl font-semibold text-slate-50">Ask the fleet</h1>
        <p className="mt-1 text-sm text-slate-400">
          Answers from traces, scores, and prompts. Press Send or Ctrl/⌘ + Enter.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {prompts.map((p) => (
          <button
            key={p}
            type="button"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-auto max-w-full cursor-pointer whitespace-normal py-1.5 text-left")}
            onClick={() => void send(p)}
            disabled={busy}
          >
            {p}
          </button>
        ))}
      </div>
      <div
        ref={boxRef}
        className="max-h-[50vh] min-h-[240px] space-y-3 overflow-y-auto rounded-lg border border-white/10 bg-[#10202c]/90 p-4"
      >
        {messages.length === 0 && (
          <p className="text-sm text-slate-500">No conversation yet. Ask about trust, errors, or prompts.</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "text-right" : ""}>
            <p className="text-[11px] text-slate-500">{m.role}</p>
            <pre
              className={`inline-block max-w-full whitespace-pre-wrap rounded-md px-3 py-2 text-sm ${m.role === "user" ? "bg-cyan-400/10 text-cyan-100" : "bg-black/30 text-slate-200"}`}
            >
              {m.content}
            </pre>
          </div>
        ))}
      </div>
      {error && <p className="text-sm text-rose-300">{error}</p>}
      <form
        ref={formRef}
        method="dialog"
        className="relative z-20 flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const text = String(new FormData(e.currentTarget).get("question") ?? "");
          void send(text);
        }}
      >
        <textarea
          name="question"
          rows={4}
          placeholder="Ask about a trace, agent, or score…"
          disabled={!ready || busy}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
              if (e.key === "Enter" && e.shiftKey) return;
              e.preventDefault();
              const text = e.currentTarget.value;
              void send(text);
            }
          }}
          className="min-h-24 w-full resize-y rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-slate-100 outline-none [field-sizing:fixed] placeholder:text-slate-500 focus-visible:border-cyan-400/40 focus-visible:ring-2 focus-visible:ring-cyan-400/20"
        />
        <button
          type="button"
          disabled={!ready || busy}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const form = formRef.current;
            const text = form ? String(new FormData(form).get("question") ?? "") : "";
            void send(text);
          }}
          className={cn(
            buttonVariants({ variant: "default", size: "lg" }),
            "relative z-20 h-11 w-full cursor-pointer disabled:cursor-wait sm:w-48",
          )}
        >
          {busy ? "Thinking…" : ready ? "Send" : "Loading…"}
        </button>
      </form>
    </div>
  );
}
