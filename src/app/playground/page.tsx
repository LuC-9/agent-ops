import { PlaygroundForm } from "@/components/playground-form";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

async function runtimeStatus() {
  const base = process.env.AGENTS_URL ?? "http://127.0.0.1:43148";
  try {
    const res = await fetch(`${base}/health`, { cache: "no-store", signal: AbortSignal.timeout(2500) });
    const data = (await res.json()) as { ok?: boolean; model?: string };
    return { ok: Boolean(data.ok), model: data.model ?? "" };
  } catch {
    return { ok: false, model: "" };
  }
}

export default async function PlaygroundPage() {
  const runtime = await runtimeStatus();
  return <PlaygroundForm agents={getStore().agents} runtimeOk={runtime.ok} runtimeModel={runtime.model} />;
}
