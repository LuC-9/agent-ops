"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Agent, Trace } from "@/lib/types";

const samples: Record<string, string> = {
  "atlas-research": "Compare checkpointers vs stores in LangGraph and when to use each.",
  "helix-support": "I was charged twice for workspace seats this month. Can I get a refund?",
  "forge-code-review": "Review: def get_user(id): return db.execute(f\"SELECT * FROM users WHERE id={id}\")",
  "sentinel-incident": "Checkout p99 is 3.1s after deploy 19:12. Error rate 2.4% on payments-api.",
};

export default function PlaygroundPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [slug, setSlug] = useState("atlas-research");
  const [input, setInput] = useState(samples["atlas-research"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trace, setTrace] = useState<Trace | null>(null);

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((d) => setAgents(d.agents ?? []));
  }, []);

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
      else setTrace(data.trace ?? (data.id ? data : null));
    } catch {
      setError("Could not reach the agent runtime");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <div>
        <p className="font-mono text-xs tracking-[0.25em] text-cyan-400/80">INVOKE</p>
        <h1 className="text-2xl font-semibold text-slate-50">Run an onboarded agent</h1>
        <p className="mt-1 text-sm text-slate-400">
          Requires ./run-agents.sh. Each run compiles a LangGraph, emits node logs, scores the answer, and ingests a trace here.
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
      <Textarea value={input} onChange={(e) => setInput(e.target.value)} className="min-h-28" />
      <Button onClick={run} disabled={busy || !input.trim()}>
        {busy ? "Running graph…" : "Run"}
      </Button>
      {error && (
        <p className="text-sm text-rose-300">{error}</p>
      )}
      {trace && "request" in (trace as object) && (
        <div className="space-y-2 rounded-lg border border-white/10 bg-[#10202c] p-4">
          <p className="text-xs text-slate-500">
            acc {(trace as Trace).accuracy} · conf {(trace as Trace).confidence} · trust {(trace as Trace).trustScore}
          </p>
          <pre className="whitespace-pre-wrap font-mono text-xs text-slate-200">{(trace as Trace).response || (trace as Trace).error}</pre>
        </div>
      )}
    </div>
  );
}
