import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default function UsagePage() {
  const store = getStore();
  const usages = store.usages.slice(0, 120);
  const tokens = usages.reduce((n, u) => n + u.promptTokens + u.completionTokens, 0);
  const byPurpose = new Map<string, { calls: number; tokens: number }>();
  for (const u of usages) {
    const cur = byPurpose.get(u.purpose) ?? { calls: 0, tokens: 0 };
    cur.calls += 1;
    cur.tokens += u.promptTokens + u.completionTokens;
    byPurpose.set(u.purpose, cur);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <div>
        <p className="font-mono text-xs tracking-[0.25em] text-cyan-400/80">AI USAGE</p>
        <h1 className="text-2xl font-semibold text-slate-50">Model calls, tokens, and fallbacks</h1>
        <p className="mt-1 text-sm text-slate-400">
          Every Gemini/OpenAI call from LangGraph nodes, copilot, and the suggestion analyst is recorded here.
        </p>
      </div>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
          <p className="text-[11px] text-slate-500 uppercase">Calls</p>
          <p className="font-mono text-xl text-cyan-200">{usages.length}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
          <p className="text-[11px] text-slate-500 uppercase">Tokens</p>
          <p className="font-mono text-xl text-cyan-200">{tokens.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
          <p className="text-[11px] text-slate-500 uppercase">Fallbacks</p>
          <p className="font-mono text-xl text-amber-200">{usages.filter((u) => u.fallback).length}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
          <p className="text-[11px] text-slate-500 uppercase">Purposes</p>
          <p className="font-mono text-sm text-slate-200">
            {[...byPurpose.entries()].map(([k, v]) => `${k} ${v.calls}`).join(" · ") || "—"}
          </p>
        </div>
      </section>
      <div className="overflow-x-auto rounded-lg border border-white/10 bg-black/20">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="bg-white/5 text-xs text-slate-400">
            <tr>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Purpose</th>
              <th className="px-3 py-2">Model</th>
              <th className="px-3 py-2">Node</th>
              <th className="px-3 py-2">Prompt</th>
              <th className="px-3 py-2">Completion</th>
              <th className="px-3 py-2">ms</th>
            </tr>
          </thead>
          <tbody>
            {usages.map((u) => (
              <tr key={u.id} className="border-t border-white/5">
                <td className="px-3 py-2 font-mono text-xs text-slate-500">{new Date(u.ts).toLocaleTimeString()}</td>
                <td className="px-3 py-2 text-slate-300">{u.purpose}</td>
                <td className="px-3 py-2 font-mono text-xs text-cyan-200">{u.model}</td>
                <td className="px-3 py-2 text-xs text-slate-500">{u.node ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-xs">{u.promptTokens}</td>
                <td className="px-3 py-2 font-mono text-xs">{u.completionTokens}</td>
                <td className="px-3 py-2 font-mono text-xs">{u.latencyMs}</td>
              </tr>
            ))}
            {usages.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-slate-500">
                  No AI usage yet. Invoke an agent or ask the copilot.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
