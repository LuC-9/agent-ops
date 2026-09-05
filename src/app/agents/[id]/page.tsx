"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScorePill } from "@/components/app-shell";
import type { Agent, Improvement, Trace } from "@/lib/types";
import type { AgentStats } from "@/lib/types";

export default function AgentDetailPage() {
  const params = useParams<{ id: string }>();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [traces, setTraces] = useState<Trace[]>([]);
  const [improvements, setImprovements] = useState<Improvement[]>([]);
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/agents/${params.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else {
          setAgent(data.agent);
          setTraces(data.traces);
          setImprovements(data.improvements);
          setStats(data.stats);
        }
      })
      .catch(() => setError("Failed to load agent"));
  }, [params.id]);

  if (error) return <div className="p-8 text-rose-300">{error}</div>;
  if (!agent) return <div className="p-8 text-slate-400">Loading agent…</div>;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <div>
        <Link href="/" className="text-xs text-cyan-400 hover:underline">← Fleet</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-slate-50">{agent.name}</h1>
          <Badge>{agent.status}</Badge>
          <span className="font-mono text-xs text-slate-500">v{agent.version}</span>
        </div>
        <p className="mt-1 text-sm text-slate-400">{agent.description}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <ScorePill label="Accuracy" value={stats?.avgAccuracy ?? 0} />
        <ScorePill label="Confidence" value={stats?.avgConfidence ?? 0} />
        <ScorePill label="Trust" value={stats?.avgTrust ?? 0} />
        <div className="rounded-lg border border-white/10 px-3 py-2">
          <p className="text-[11px] tracking-wide text-slate-400 uppercase">Reliability</p>
          <p className="font-mono text-xl text-slate-100">
            {stats ? `${((1 - stats.errorRate) * 100).toFixed(0)}%` : "—"}
          </p>
        </div>
      </div>

      <Card className="border-white/10 bg-[#10202c]">
        <CardHeader>
          <CardTitle className="text-sm">System prompt</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="whitespace-pre-wrap rounded-md bg-black/30 p-3 font-mono text-xs text-cyan-100/90">
            {agent.systemPrompt}
          </pre>
          <p className="mt-3 text-xs text-slate-500">
            Graph: {agent.graph.nodes.join(" → ")}
          </p>
        </CardContent>
      </Card>

      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-300">Suggested improvements</h2>
        {improvements.length === 0 ? (
          <p className="text-sm text-slate-500">None yet. Generate them from the Improvements tab after errors land.</p>
        ) : (
          <ul className="space-y-2">
            {improvements.map((imp) => (
              <li key={imp.id} className="rounded-md border border-white/10 bg-[#10202c] p-3">
                <div className="flex items-center gap-2">
                  <Badge variant={imp.severity === "high" ? "destructive" : "secondary"}>{imp.severity}</Badge>
                  <span className="text-sm text-slate-100">{imp.title}</span>
                </div>
                <p className="mt-1 text-xs text-slate-400">{imp.suggestion}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-300">Requests & responses</h2>
        <div className="space-y-2">
          {traces.map((tr) => (
            <Link key={tr.id} href={`/traces/${tr.id}`} className="block rounded-md border border-white/10 p-3 hover:border-cyan-400/40">
              <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500">
                <span className={tr.status === "ok" ? "text-emerald-400" : "text-rose-400"}>{tr.status}</span>
                <span>acc {tr.accuracy.toFixed(0)} · conf {tr.confidence.toFixed(0)} · trust {tr.trustScore.toFixed(0)}</span>
              </div>
              <p className="mt-1 text-sm text-slate-200">{tr.request}</p>
              <p className="mt-1 line-clamp-2 text-xs text-slate-500">{tr.response || tr.error}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
