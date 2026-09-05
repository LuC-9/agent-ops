"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScorePill } from "@/components/app-shell";
import type { Agent, Trace } from "@/lib/types";

const samples: Record<string, string> = {
  "atlas-research": "Compare checkpointers vs stores in LangGraph and when to use each.",
  "helix-support": "I was charged twice for workspace seats this month. Can I get a refund?",
  "forge-code-review": "Review: def get_user(id): return db.execute(f\"SELECT * FROM users WHERE id={id}\")",
  "sentinel-incident": "Checkout p99 timeout after the 18:10 deploy. Error rate 2.4% on payments-api.",
};

export function PlaygroundForm({ agents }: { agents: Agent[] }) {
  const [slug, setSlug] = useState(agents[0]?.slug ?? "atlas-research");
  const [input, setInput] = useState(samples[agents[0]?.slug ?? "atlas-research"] ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trace, setTrace] = useState<Trace | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setTrace(null);
    try {
      const res = await fetch("/api/invoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, input }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Invoke failed");
      else setTrace(data.trace ?? null);
    } catch {
      setError("Could not reach the agent runtime");
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
          Each run executes a LangGraph with tools, retries, and fallbacks, then ingests a scored trace. Requires ./run-agents.sh.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {agents.map((a) => (
          <Button
            key={a.slug}
            variant={slug === a.slug ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setSlug(a.slug);
              setInput(samples[a.slug] ?? "");
            }}
          >
            {a.name}
          </Button>
        ))}
      </div>
      {selected && (
        <p className="text-xs text-slate-500">
          {selected.description} · graph {selected.graph.nodes.join(" → ")}
        </p>
      )}
      <Textarea value={input} onChange={(e) => setInput(e.target.value)} className="min-h-28" />
      <Button onClick={run} disabled={busy || !input.trim()}>
        {busy ? "Running graph…" : "Run"}
      </Button>
      {error && <p className="text-sm text-rose-300">{error}</p>}
      {trace && (
        <div className="space-y-3 rounded-lg border border-white/10 bg-[#10202c]/90 p-4">
          <div className="grid grid-cols-3 gap-2">
            <ScorePill label="Accuracy" value={trace.accuracy} />
            <ScorePill label="Confidence" value={trace.confidence} />
            <ScorePill label="Trust" value={trace.trustScore} />
          </div>
          <p className="text-xs text-slate-500">
            {trace.status}
            {trace.degraded ? " · degraded" : ""} · {trace.model} · {trace.latencyMs} ms
          </p>
          <pre className="whitespace-pre-wrap font-mono text-xs text-slate-200">{trace.response || trace.error}</pre>
          {trace.id && (
            <Link href={`/traces/${trace.id}`} className="text-xs text-cyan-400 hover:underline">
              Open full trace
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
