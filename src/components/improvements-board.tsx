"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Agent, Improvement } from "@/lib/types";

export function ImprovementsBoard({
  initialItems,
  agents,
}: {
  initialItems: Improvement[];
  agents: Agent[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/improvements/generate", { method: "POST" });
      const data = await res.json();
      if (data.note) setNote(data.note);
      router.refresh();
    } catch {
      setNote("Analysis failed");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id: string, status: Improvement["status"]) {
    await fetch("/api/improvements", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-mono text-xs tracking-[0.25em] text-cyan-400/80">AGENTIC ANALYST</p>
          <h1 className="text-2xl font-semibold text-slate-50">Suggested improvements</h1>
          <p className="mt-1 text-sm text-slate-400">
            Reads error logs, low-accuracy traces, and system prompts, then proposes graph and prompt patches. Errors also auto-open a reliability card on ingest.
          </p>
        </div>
        <Button onClick={generate} disabled={busy}>
          {busy ? "Analyzing logs…" : "Analyze logs"}
        </Button>
      </header>
      {note && <p className="text-sm text-amber-300">{note}</p>}
      <div className="space-y-3">
        {initialItems.map((item) => {
          const agent = agents.find((a) => a.id === item.agentId);
          return (
            <article key={item.id} className="rounded-lg border border-white/10 bg-[#10202c]/90 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={item.severity === "high" ? "destructive" : "secondary"}>{item.severity}</Badge>
                <Badge variant="outline">{item.category}</Badge>
                <span className="text-xs text-slate-500">{agent?.name}</span>
                <span className="ml-auto text-xs text-slate-500">{item.status}</span>
              </div>
              <h2 className="mt-2 text-sm font-medium text-slate-100">{item.title}</h2>
              <p className="mt-1 text-sm text-slate-400">{item.rationale}</p>
              <pre className="mt-3 whitespace-pre-wrap rounded bg-black/30 p-3 font-mono text-xs text-cyan-100/90">
                {item.suggestion}
              </pre>
              {item.status === "open" && (
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={() => setStatus(item.id, "accepted")}>Accept</Button>
                  <Button size="sm" variant="outline" onClick={() => setStatus(item.id, "dismissed")}>Dismiss</Button>
                </div>
              )}
            </article>
          );
        })}
        {initialItems.length === 0 && (
          <p className="text-sm text-slate-500">No suggestions yet. Run Analyze logs after agents produce traces.</p>
        )}
      </div>
    </div>
  );
}
