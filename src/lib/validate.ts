import { LIMITS } from "./limits";
import type { IngestPayload, RegisterAgentPayload } from "./types";

export function clip(text: string, max: number) {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…[truncated]`;
}

export function validateRegister(body: RegisterAgentPayload): string | null {
  if (!body.name?.trim()) return "name is required";
  if (!body.slug?.trim() || !/^[a-z0-9-]+$/.test(body.slug)) return "slug must be lowercase kebab-case";
  if (!body.systemPrompt?.trim()) return "systemPrompt is required";
  if (!body.graph?.nodes?.length) return "graph.nodes is required";
  return null;
}

export function sanitizeIngest(body: IngestPayload): IngestPayload {
  return {
    ...body,
    request: clip(String(body.request ?? ""), LIMITS.maxRequestChars),
    response: clip(String(body.response ?? ""), LIMITS.maxResponseChars),
    error: body.error ? clip(String(body.error), 2000) : body.error,
    logs: (body.logs ?? []).slice(0, LIMITS.maxLogs),
    usages: (body.usages ?? []).slice(0, 40),
  };
}
