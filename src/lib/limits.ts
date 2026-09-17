export const LIMITS = {
  maxRequestChars: 12_000,
  maxResponseChars: 32_000,
  maxLogs: 200,
  maxTraces: 800,
  maxCopilotTurns: 80,
  maxAudit: 2000,
  maxUsages: 2000,
  staleHeartbeatMs: 45_000,
} as const;
