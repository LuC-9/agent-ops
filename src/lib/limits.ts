export const LIMITS = {
  maxRequestChars: 12_000,
  maxResponseChars: 32_000,
  maxLogs: 200,
  maxTraces: 500,
  maxCopilotTurns: 80,
  maxAudit: 800,
  maxUsages: 800,
  staleHeartbeatMs: 45_000,
} as const;
