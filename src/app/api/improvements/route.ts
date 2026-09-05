import { json, corsHeaders } from "@/lib/http";
import { getStore, updateImprovement } from "@/lib/store";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { headers: corsHeaders });
}

export function GET() {
  return json({ improvements: getStore().improvements });
}

export async function PATCH(req: Request) {
  const body = await req.json();
  if (!body?.id || !body?.status) return json({ error: "id and status required" }, 400);
  const item = updateImprovement(body.id, body.status);
  if (!item) return json({ error: "not found" }, 404);
  return json({ improvement: item });
}
