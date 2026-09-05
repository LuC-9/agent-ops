import { json, corsHeaders } from "@/lib/http";
import { LIMITS } from "@/lib/limits";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { headers: corsHeaders });
}

export async function POST(req: Request) {
  const body = await req.json();
  const input = String(body?.input ?? "");
  if (!body?.slug || !input.trim()) {
    return json({ error: "slug and input are required" }, 400);
  }
  if (input.length > LIMITS.maxRequestChars) {
    return json({ error: `input exceeds ${LIMITS.maxRequestChars} characters` }, 413);
  }
  const base = process.env.AGENTS_URL ?? "http://127.0.0.1:43148";
  try {
    const res = await fetch(`${base}/invoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: body.slug, input, thread_id: body.thread_id }),
      signal: AbortSignal.timeout(65_000),
    });
    const data = await res.json();
    return json(data, res.status);
  } catch {
    return json(
      {
        error: `Agent runtime is not reachable at ${base}. Start it with ./run-agents.sh`,
      },
      503,
    );
  }
}
