// No-show sweep cron. After a doctor's session ends + a grace period, any token
// still WAITING is flipped to NO_SHOW (idempotent; ARRIVED/DONE/etc. are skipped,
// and each flip writes an AppointmentEvent). V1 runs node-cron in-process.

import cron, { type ScheduledTask } from "node-cron";

import type { SchedulingService } from "../domain/scheduling.js";

export const DEFAULT_NO_SHOW_CRON = "*/5 * * * *"; // every 5 minutes
export const DEFAULT_GRACE_MIN = 30;

export interface NoShowSweepOptions {
  cronExpression?: string;
  graceMin?: number;
  onSwept?: (count: number) => void;
  onError?: (err: unknown) => void;
}

/** Schedule the no-show sweep. Returns the task so callers can stop() it. */
export function startNoShowSweepJob(
  scheduling: SchedulingService,
  options: NoShowSweepOptions = {},
): ScheduledTask {
  const grace = options.graceMin ?? DEFAULT_GRACE_MIN;
  return cron.schedule(
    options.cronExpression ?? DEFAULT_NO_SHOW_CRON,
    async () => {
      try {
        const { swept } = await scheduling.sweepNoShows(grace);
        if (swept > 0) options.onSwept?.(swept);
      } catch (err) {
        options.onError?.(err);
      }
    },
    { noOverlap: true },
  );
}
