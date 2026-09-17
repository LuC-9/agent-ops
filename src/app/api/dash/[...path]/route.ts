import { corsHeaders, json } from "@/lib/http";
import { handleDash } from "@/lib/dash-handler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function partsFrom(ctx: { params: Promise<{ path: string[] }> }) {
  return ctx.params.then((p) => p.path || []);
}

async function run(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const url = new URL(req.url);
  let body: unknown = null;
  if (req.method !== "GET" && req.method !== "HEAD") {
    const text = await req.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = {};
      }
    }
  }
  const { status, data } = await handleDash({
    method: req.method,
    parts: await partsFrom(ctx),
    search: url.searchParams,
    body,
    auth: req.headers.get("authorization"),
  });
  return json(data, status);
}

export function OPTIONS() {
  return new Response(null, { headers: { ...corsHeaders, "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS" } });
}

export const GET = run;
export const POST = run;
export const PATCH = run;
export const DELETE = run;
