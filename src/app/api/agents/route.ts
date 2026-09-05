import { json, corsHeaders } from "@/lib/http";
import { getStore, registerAgent } from "@/lib/store";
import { validateRegister } from "@/lib/validate";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { headers: corsHeaders });
}

export function GET() {
  return json({ agents: getStore().agents });
}

export async function POST(req: Request) {
  const body = await req.json();
  const error = validateRegister(body);
  if (error) return json({ error }, 400);
  const agent = registerAgent(body);
  return json({ agent });
}
