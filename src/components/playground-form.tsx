"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { ScorePill } from "@/components/app-shell";
import type { Agent, Trace } from "@/lib/types";
import { cn } from "@/lib/utils";

const samples: Record<string, string> = {
  "atlas-research": "Compare checkpointers vs stores in LangGraph and when to use each.",
  "helix-support": "I was charged twice for workspace seats this month. Can I get a refund?",
  "forge-code-review": 'Review: def get_user(id): return db.execute(f"SELECT * FROM users WHERE id={id}")',
  "sentinel-incident": "Checkout p99 timeout after the 18:10 deploy. Error rate 2.4% on payments-api.",
};

function apiError(data: unknown, fallback: string) {
  if (!data || typeof data !== "object") return fallback;
  const rec = data as { error?: unknown; detail?: unknown };
  if (typeof rec.error === "string" && rec.error) return rec.error;
  if (typeof rec.detail === "string" && rec.detail) return rec.detail;
  return fallback;
}

export function PlaygroundForm({
  agents,
  runtimeOk = false,
  runtimeModel = "",
}: {
  agents: Agent[];
  runtimeOk?: boolean;
  runtimeModel?: string;
}) {
  const [slug, setSlug] = useState(agents[0]?.slug ?? "atlas-research");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trace, setTrace] = useState<Trace | null>(null);
  const [output, setOutput] = useState<string | null>(null);
  const [alive, setAlive] = useState(runtimeOk);

  useEffect(() => {
    let cancelled = false;
    const ping = () =>
      fetch("/api/runtime", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          if (!cancelled) setAlive(Boolean(d?.ok));
        })
        .catch(() => {
          if (!cancelled) setAlive(false);
        });
    ping();
    const id = setInterval(ping, 10_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  async function run(raw: string) {
    const text = raw.trim();
    if (!text) {
      setError("Enter a prompt, then press Run.");
      return;
    }
    if (busy) return;
    setBusy(true);
    setError(null);
    setTrace(null);
    setOutput(null);
    try {
      const res = await fetch("/api/invoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, input: text }),
        signal: AbortSignal.timeout(70_000),
      });
      const data = (await res.json()) as {
        trace?: Trace;
        output?: string;
        error?: string;
        detail?: string;
        status?: string;
      };
      if (!res.ok) {
        setError(apiError(data, "Invoke failed"));
        return;
      }
      setTrace(data.trace ?? null);
      setOutput(data.output ?? data.trace?.response ?? null);
      if (!data.trace && !data.output) setError("Agent returned an empty result");
    } catch (err) {
      const timedOut = err instanceof DOMException && err.name === "TimeoutError";
      setError(timedOut ? "Agent run timed out." : "Could not reach the agent runtime. Start it with ./run-agents.sh");
    } finally {
      setBusy(false);
    }
  }

  const selected = agents.find((a) => a.slug === slug);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <div>
        <p className="font-mono text-xs tracking-[0.25em] text-cyan-400/80">INVOKE</p>
        <h1 className="text-2xl font-semibold text-slate-50">Run an onboarded agent</h1>
        <p className="mt-1 text-sm text-slate-400">
          Executes a live LangGraph, then ingest a scored trace. Runtime is {alive ? "online" : "offline"}
          {runtimeModel ? ` · ${runtimeModel}` : ""}.
        </p>
      </div>
      {!alive && (
        <p className="rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
          Agent runtime is not reachable. In another terminal run <code className="font-mono">./run-agents.sh</code>.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {agents.map((a) => (
          <button
            key={a.slug}
            type="button"
            className={cn(buttonVariants({ variant: slug === a.slug ? "default" : "outline", size: "sm" }), "cursor-pointer")}
            onClick={() => setSlug(a.slug)}
          >
            {a.name}
          </button>
        ))}
      </div>
      {selected && (
        <p className="text-xs text-slate-500">
          {selected.description} · graph {selected.graph.nodes.join(" → ")}
        </p>
      )}
      <form
        method="dialog"
        className="relative z-20 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const text = String(new FormData(e.currentTarget).get("input") ?? "");
          void run(text);
        }}
      >
        <textarea
          name="input"
          defaultValue={samples[slug] ?? ""}
          key={slug}
          rows={6}
          disabled={busy}
          className="min-h-28 w-full resize-y rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-slate-100 outline-none [field-sizing:fixed] placeholder:text-slate-500 focus-visible:border-cyan-400/40 focus-visible:ring-2 focus-visible:ring-cyan-400/20"
        />
        <button
          type="button"
          disabled={busy}
          onClick={(e) => {
            e.preventDefault();
            const form = (e.currentTarget as HTMLButtonElement).form;
            const text = form ? String(new FormData(form).get("input") ?? "") : "";
            void run(text);
          }}
          className={cn(buttonVariants({ variant: "default", size: "lg" }), "relative z-20 h-11 w-full cursor-pointer sm:w-48")}
        >
          {busy ? "Running graph…" : "Run"}
        </button>
      </form>
      {error && <p className="text-sm text-rose-300">{error}</p>}
      {(trace || output) && (
        <div className="space-y-3 rounded-lg border border-white/10 bg-[#10202c]/90 p-4">
          {trace && (
            <div className="grid grid-cols-3 gap-2">
              <ScorePill label="Accuracy" value={trace.accuracy} />
              <ScorePill label="Confidence" value={trace.confidence} />
              <ScorePill label="Trust" value={trace.trustScore} />
            </div>
          )}
          <p className="text-xs text-slate-500">
            {trace?.status ?? "ok"}
            {trace?.degraded ? " · degraded" : ""} · {trace?.model} · {trace?.latencyMs} ms
          </p>
          <pre className="whitespace-pre-wrap font-mono text-xs text-slate-200">{output || trace?.response || trace?.error}</pre>
          {trace?.id && (
            <Link href={`/traces/${trace.id}`} className="text-xs text-cyan-400 hover:underline">
              Open full trace
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
