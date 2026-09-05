import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScorePill } from "@/components/app-shell";
import { getStore, getTrace } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function TracePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trace = getTrace(id);
  if (!trace) notFound();
  const agent = getStore().agents.find((a) => a.id === trace.agentId) ?? null;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
      <Link href={agent ? `/agents/${agent.id}` : "/"} className="text-xs text-cyan-400 hover:underline">
        ← {agent?.name ?? "Fleet"}
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-mono text-lg text-slate-100">{trace.id}</h1>
        <Badge variant={trace.status === "ok" ? "default" : "destructive"}>{trace.status}</Badge>
        {trace.degraded && <Badge variant="secondary">degraded</Badge>}
        <span className="text-xs text-slate-500">
          {trace.latencyMs} ms · {trace.model ?? "unknown model"}
          {trace.threadId ? ` · thread ${trace.threadId.slice(0, 8)}` : ""}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <ScorePill label="Accuracy" value={trace.accuracy} />
        <ScorePill label="Confidence" value={trace.confidence} />
        <ScorePill label="Trust" value={trace.trustScore} />
      </div>
      {typeof trace.calibrationGap === "number" && (
        <p className="font-mono text-xs text-slate-500">
          Calibration gap (confidence − accuracy): {trace.calibrationGap.toFixed(1)}
        </p>
      )}

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
