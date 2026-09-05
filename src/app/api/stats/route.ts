import { json, corsHeaders } from "@/lib/http";
import { summarizeAgent } from "@/lib/scoring";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { headers: corsHeaders });
}

export function GET() {
  const store = getStore();
  const stats = store.agents.map((a) => summarizeAgent(a, store.traces));
  const traces = store.traces;
  const avg = (key: "accuracy" | "confidence" | "trustScore") =>
    traces.length ? traces.reduce((s, t) => s + t[key], 0) / traces.length : 0;
  return json({
    agents: store.agents.length,
    online: store.agents.filter((a) => a.status === "online").length,
    traces: traces.length,
    errors: traces.filter((t) => t.status === "error").length,
    avgAccuracy: avg("accuracy"),
    avgConfidence: avg("confidence"),
    avgTrust: avg("trustScore"),
    openImprovements: store.improvements.filter((i) => i.status === "open").length,
    perAgent: stats,
  });
}
