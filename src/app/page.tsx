"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScorePill } from "@/components/app-shell";
import type { Agent, Trace } from "@/lib/types";

type Stats = {
  agents: number;
  online: number;
  traces: number;
  errors: number;
  avgAccuracy: number;
  avgConfidence: number;
  avgTrust: number;
  openImprovements: number;
};

export default function HomePage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [traces, setTraces] = useState<Trace[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const [s, a, t] = await Promise.all([
        fetch("/api/stats").then((r) => r.json()),
        fetch("/api/agents").then((r) => r.json()),
        fetch("/api/traces").then((r) => r.json()),
      ]);
      setStats(s);
      setAgents(a.agents ?? []);
      setTraces(t.traces ?? []);
      setError(null);
    } catch {
      setError("Could not load telemetry. Is the observability platform running?");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  const byAgent = useMemo(() => {
    return agents.map((agent) => {
      const mine = traces.filter((tr) => tr.agentId === agent.id);
      const last = mine[0];
      const avg = (key: "accuracy" | "confidence" | "trustScore") =>
        mine.length ? mine.reduce((n, tr) => n + tr[key], 0) / mine.length : 0;
      return { agent, last, avgAccuracy: avg("accuracy"), avgConfidence: avg("confidence"), avgTrust: avg("trustScore"), count: mine.length };
    });
  }, [agents, traces]);

  if (loading) {
    return <div className="p-8 text-slate-400">Loading live telemetry…</div>;
  }
  if (error) {
    return (
      <div className="p-8">
        <p className="text-rose-300">{error}</p>
        <Button className="mt-4" onClick={load}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <header className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-mono text-xs tracking-[0.25em] text-cyan-400/80">LIVE FLEET</p>
          <h1 className="text-2xl font-semibold text-slate-50">System prompt, traces, and trust</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Four LangGraph agents report every request, response, log line, and self-score. Trust blends accuracy, confidence, and reliability.
          </p>
        </div>
        <Button variant="outline" onClick={load}>Refresh</Button>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <ScorePill label="Accuracy" value={stats?.avgAccuracy ?? 0} />
        <ScorePill label="Confidence" value={stats?.avgConfidence ?? 0} />
        <ScorePill label="Trust" value={stats?.avgTrust ?? 0} />
        <div className="rounded-lg border border-white/10 px-3 py-2">
          <p className="text-[11px] tracking-wide text-slate-400 uppercase">Fleet</p>
          <p className="font-mono text-xl text-cyan-200">
            {stats?.online}/{stats?.agents} online
          </p>
          <p className="text-xs text-slate-500">
            {stats?.traces} traces · {stats?.errors} errors · {stats?.openImprovements} open fixes
          </p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {byAgent.map(({ agent, last, avgAccuracy, avgConfidence, avgTrust, count }) => (
          <Link key={agent.id} href={`/agents/${agent.id}`}>
            <Card className="h-full border-white/10 bg-[#10202c] transition hover:border-cyan-400/40">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base text-slate-100">{agent.name}</CardTitle>
                    <p className="mt-1 text-xs text-slate-400">{agent.description}</p>
                  </div>
                  <Badge variant={agent.status === "online" ? "default" : agent.status === "degraded" ? "destructive" : "secondary"}>
                    {agent.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <ScorePill label="Accuracy" value={avgAccuracy} />
                  <ScorePill label="Confidence" value={avgConfidence} />
                  <ScorePill label="Trust" value={avgTrust} />
                </div>
                <p className="line-clamp-2 font-mono text-[11px] text-slate-500">{agent.systemPrompt}</p>
                <p className="text-xs text-slate-400">
                  {count} traces
                  {last ? ` · last: ${last.request.slice(0, 72)}${last.request.length > 72 ? "…" : ""}` : ""}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-slate-300">Latest requests</h2>
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-white/5 text-xs text-slate-400">
              <tr>
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Agent</th>
                <th className="px-3 py-2">Request</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Acc</th>
                <th className="px-3 py-2">Conf</th>
                <th className="px-3 py-2">Trust</th>
              </tr>
            </thead>
            <tbody>
              {traces.slice(0, 12).map((tr) => {
                const agent = agents.find((a) => a.id === tr.agentId);
                return (
                  <tr key={tr.id} className="border-t border-white/5 hover:bg-white/5">
                    <td className="px-3 py-2 font-mono text-xs text-slate-500">
                      {new Date(tr.startedAt).toLocaleTimeString()}
                    </td>
                    <td className="px-3 py-2 text-slate-300">{agent?.name ?? tr.agentId}</td>
                    <td className="px-3 py-2">
                      <Link href={`/traces/${tr.id}`} className="text-cyan-300 hover:underline">
                        {tr.request.slice(0, 80)}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <span className={tr.status === "ok" ? "text-emerald-400" : "text-rose-400"}>{tr.status}</span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{tr.accuracy.toFixed(0)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{tr.confidence.toFixed(0)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{tr.trustScore.toFixed(0)}</td>
                  </tr>
                );
              })}
              {traces.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                    No traces yet. Start agents with ./run-agents.sh and use Run agents.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
