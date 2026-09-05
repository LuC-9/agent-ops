"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScorePill } from "@/components/app-shell";
import type { Agent, Trace } from "@/lib/types";

export default function TracePage() {
  const params = useParams<{ id: string }>();
  const [trace, setTrace] = useState<Trace | null>(null);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/traces/${params.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else {
          setTrace(data.trace);
          setAgent(data.agent);
        }
      })
      .catch(() => setError("Failed to load trace"));
  }, [params.id]);

  if (error) return <div className="p-8 text-rose-300">{error}</div>;
  if (!trace) return <div className="p-8 text-slate-400">Loading trace…</div>;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
      <Link href={agent ? `/agents/${agent.id}` : "/"} className="text-xs text-cyan-400 hover:underline">
        ← {agent?.name ?? "Fleet"}
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-mono text-lg text-slate-100">{trace.id}</h1>
        <Badge variant={trace.status === "ok" ? "default" : "destructive"}>{trace.status}</Badge>
        <span className="text-xs text-slate-500">{trace.latencyMs} ms · {trace.model ?? "unknown model"}</span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <ScorePill label="Accuracy" value={trace.accuracy} />
        <ScorePill label="Confidence" value={trace.confidence} />
        <ScorePill label="Trust" value={trace.trustScore} />
      </div>

      <Card className="border-white/10 bg-[#10202c]">
        <CardHeader><CardTitle className="text-sm">Request</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-slate-200">{trace.request}</p></CardContent>
      </Card>

      <Card className="border-white/10 bg-[#10202c]">
        <CardHeader><CardTitle className="text-sm">Response</CardTitle></CardHeader>
        <CardContent>
          {trace.error && <p className="mb-2 text-sm text-rose-300">{trace.error}</p>}
          <pre className="whitespace-pre-wrap font-mono text-xs text-slate-200">{trace.response || "(empty)"}</pre>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-[#10202c]">
        <CardHeader><CardTitle className="text-sm">System prompt snapshot</CardTitle></CardHeader>
        <CardContent>
          <pre className="whitespace-pre-wrap font-mono text-xs text-cyan-100/80">{trace.systemPrompt}</pre>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-[#10202c]">
        <CardHeader><CardTitle className="text-sm">Agent logs</CardTitle></CardHeader>
        <CardContent>
          {trace.logs.length === 0 ? (
            <p className="text-sm text-slate-500">No structured logs on this trace.</p>
          ) : (
            <ol className="space-y-2">
              {trace.logs.map((log, i) => (
                <li key={`${log.ts}-${i}`} className="flex gap-3 font-mono text-xs">
                  <span className="w-20 shrink-0 text-slate-500">{new Date(log.ts).toLocaleTimeString()}</span>
                  <span className={log.level === "error" ? "text-rose-400" : log.level === "warn" ? "text-amber-300" : "text-slate-400"}>
                    {log.level}
                  </span>
                  <span className="text-cyan-400/80">{log.node}</span>
                  <span className="text-slate-200">{log.message}</span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
