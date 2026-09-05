import { json, corsHeaders } from "@/lib/http";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { headers: corsHeaders });
}

export async function POST(req: Request) {
  const body = await req.json();
  const base = process.env.AGENTS_URL ?? "http://127.0.0.1:43148";
  try {
    const res = await fetch(`${base}/invoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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
