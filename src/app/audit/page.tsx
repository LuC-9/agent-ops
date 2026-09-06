import Link from "next/link";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default function AuditPage() {
  const store = getStore();
  const audit = store.audit.slice(0, 120);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <div>
        <p className="font-mono text-xs tracking-[0.25em] text-cyan-400/80">AUDIT</p>
        <h1 className="text-2xl font-semibold text-slate-50">Agent uses and operator actions</h1>
        <p className="mt-1 text-sm text-slate-400">
          Immutable trail of invokes, suggestion lifecycle, copilot questions, and analyst runs.
        </p>
      </div>
      <ol className="space-y-2">
        {audit.map((ev) => {
          const agent = store.agents.find((a) => a.id === ev.agentId);
          return (
            <li key={ev.id} className="rounded-lg border border-white/10 bg-black/25 p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="font-mono text-cyan-300/90">{ev.action}</span>
                <span>{agent?.name}</span>
                <span className="ml-auto font-mono">{new Date(ev.ts).toLocaleString()}</span>
              </div>
              <p className="mt-1 text-sm text-slate-200">{ev.summary}</p>
              <p className="mt-1 text-[11px] text-slate-500">actor {ev.actor}</p>
              {ev.traceId && (
                <Link href={`/traces/${ev.traceId}`} className="text-xs text-cyan-400 hover:underline">
                  Open trace
                </Link>
              )}
            </li>
          );
        })}
        {audit.length === 0 && <p className="text-sm text-slate-500">No audit events yet. Run an agent to record a use.</p>}
      </ol>
    </div>
  );
}
