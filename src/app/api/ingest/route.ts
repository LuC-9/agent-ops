import { json, corsHeaders } from "@/lib/http";
import { ingestTrace } from "@/lib/store";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { headers: corsHeaders });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body?.request || body.response === undefined) {
      return json({ error: "request and response are required" }, 400);
    }
    const trace = ingestTrace(body);
    return json({ trace });
  } catch (err) {
    const message = err instanceof Error ? err.message : "ingest failed";
    return json({ error: message }, 400);
  }
}
