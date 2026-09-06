import { json, corsHeaders } from "@/lib/http";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { headers: corsHeaders });
}

export async function GET() {
  const base = process.env.AGENTS_URL ?? "http://127.0.0.1:43148";
  try {
    const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(2500), cache: "no-store" });
    const data = await res.json();
    return json({ ...data, ok: Boolean(data?.ok) }, res.ok ? 200 : 503);
  } catch {
    return json({ ok: false, error: `Agent runtime is not reachable at ${base}. Start it with ./run-agents.sh` }, 503);
  }
}
