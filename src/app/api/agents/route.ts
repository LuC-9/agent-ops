import { json, corsHeaders } from "@/lib/http";
import { getStore, registerAgent } from "@/lib/store";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { headers: corsHeaders });
}

export function GET() {
  return json({ agents: getStore().agents });
}

export async function POST(req: Request) {
  const body = await req.json();
  if (!body?.name || !body?.slug || !body?.systemPrompt || !body?.graph) {
    return json({ error: "name, slug, systemPrompt, and graph are required" }, 400);
  }
  const agent = registerAgent(body);
  return json({ agent });
}
