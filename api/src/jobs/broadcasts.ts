// Scheduled-broadcast dispatch cron. V1 runs node-cron in-process every minute;
// at scale, move to a BullMQ + Redis worker so dispatch survives restarts and
// can fan out per-recipient with rate limiting. The logic lives in
// BroadcastService.runDue() — this file only schedules it.

import cron, { type ScheduledTask } from "node-cron";

import type { BroadcastService } from "../messaging/broadcasts.js";

// Every minute: scheduled times are minute-granular in the UI, so this is enough.
export const DEFAULT_BROADCAST_CRON = "* * * * *";

export interface BroadcastJobOptions {
  cronExpression?: string;
  onDispatched?: (count: number) => void;
  onError?: (err: unknown) => void;
}

/** Schedule the due-broadcast dispatch pass. Returns the task to stop() it. */
export function startBroadcastDispatchJob(
  broadcasts: BroadcastService,
  options: BroadcastJobOptions = {},
): ScheduledTask {
  return cron.schedule(
    options.cronExpression ?? DEFAULT_BROADCAST_CRON,
    async () => {
      try {
        const { dispatched } = await broadcasts.runDue();
        if (dispatched > 0) options.onDispatched?.(dispatched);
      } catch (err) {
        options.onError?.(err);
      }
    },
    { noOverlap: true },
  );
}
