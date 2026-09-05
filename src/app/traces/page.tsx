import Link from "next/link";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function TracesPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string; status?: string }>;
}) {
  const { agent, status } = await searchParams;
  const store = getStore();
  let traces = store.traces;
  if (agent) traces = traces.filter((t) => t.agentId === agent || store.agents.find((a) => a.slug === agent)?.id === t.agentId);
  if (status === "ok" || status === "error") traces = traces.filter((t) => t.status === status);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <div>
        <p className="font-mono text-xs tracking-[0.25em] text-cyan-400/80">TRACE INDEX</p>
        <h1 className="text-2xl font-semibold text-slate-50">Every request and score</h1>
        <p className="mt-1 text-sm text-slate-400">Filter by agent or status. Open a row for the prompt snapshot and node logs.</p>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        <Link href="/traces" className="rounded-md border border-white/15 px-2 py-1 text-slate-300">All</Link>
        {store.agents.map((a) => (
          <Link key={a.id} href={`/traces?agent=${a.id}`} className="rounded-md border border-white/15 px-2 py-1 text-slate-400 hover:text-cyan-200">
            {a.name}
          </Link>
        ))}
        <Link href="/traces?status=error" className="rounded-md border border-rose-500/30 px-2 py-1 text-rose-300">
          Errors
        </Link>
      </div>
      <div className="overflow-x-auto rounded-lg border border-white/10 bg-black/20">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-white/5 text-xs text-slate-400">
            <tr>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Agent</th>
              <th className="px-3 py-2">Request</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Model</th>
              <th className="px-3 py-2">Trust</th>
            </tr>
          </thead>
          <tbody>
            {traces.map((tr) => {
              const ag = store.agents.find((a) => a.id === tr.agentId);
              return (
                <tr key={tr.id} className="border-t border-white/5">
                  <td className="px-3 py-2 font-mono text-xs text-slate-500">{new Date(tr.startedAt).toLocaleString()}</td>
                  <td className="px-3 py-2 text-slate-300">{ag?.name ?? tr.agentId}</td>
                  <td className="px-3 py-2">
                    <Link href={`/traces/${tr.id}`} className="text-cyan-300 hover:underline">
                      {tr.request.slice(0, 90)}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <span className={tr.status === "ok" ? "text-emerald-400" : "text-rose-400"}>{tr.status}</span>
                    {tr.degraded && <span className="ml-1 text-amber-300">degraded</span>}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-500">{tr.model ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs">{tr.trustScore.toFixed(0)}</td>
                </tr>
              );
            })}
            {traces.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-slate-500">
                  No traces match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
