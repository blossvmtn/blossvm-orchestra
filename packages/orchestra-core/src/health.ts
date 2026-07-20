import { z } from "zod";

/**
 * Phase 3A — the system-health contract. Lives in core (like StateSnapshotSchema
 * / TrunkScanSchema) so the daemon and the cockpit share one definition; the
 * daemon keeps the actual I/O checks (`node:child_process`, DB reads) in
 * orchestra-daemon/src/system/health.ts, which can't be bundled into the webview.
 */
export const HealthStatusSchema = z.enum(["ok", "degraded", "unavailable"]);
export type HealthStatus = z.infer<typeof HealthStatusSchema>;

export const HealthCheckSchema = z.object({
  name: z.string(),
  status: HealthStatusSchema,
  detail: z.string().optional(),
});
export type HealthCheck = z.infer<typeof HealthCheckSchema>;

export const SystemHealthSchema = z.object({
  generatedAt: z.string(),
  checks: z.array(HealthCheckSchema),
});
export type SystemHealth = z.infer<typeof SystemHealthSchema>;
