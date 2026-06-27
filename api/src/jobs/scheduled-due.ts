// Scheduled-activation tick. A scheduled token activating (crossing into its
// lead window) is a TIME event, not a queue change, so a periodic pass re-runs
// the QueueNotifier for each doctor's today queue. The "head to the clinic now"
// nudge is consent-gated and idempotent (Notification ledger), so re-running is
// safe. V1 runs node-cron in-process.

import cron, { type ScheduledTask } from "node-cron";

import { toQueueDate } from "../domain/scheduling.js";
import type { Repository } from "../repository/repository.js";
import type { QueueNotifier } from "../messaging/queue-notifier.js";

export const DEFAULT_SCHEDULED_DUE_CRON = "*/5 * * * *"; // every 5 minutes

export interface ScheduledDueOptions {
  cronExpression?: string;
  onError?: (err: unknown) => void;
}

/** Schedule the scheduled-due nudge pass. Returns the task so callers can stop(). */
export function startScheduledDueJob(
  repo: Repository,
  notifier: QueueNotifier,
  options: ScheduledDueOptions = {},
): ScheduledTask {
  return cron.schedule(
    options.cronExpression ?? DEFAULT_SCHEDULED_DUE_CRON,
    async () => {
      try {
        const today = toQueueDate(new Date());
        const doctors = await repo.listDoctors();
        for (const doctor of doctors) {
          await notifier.notifyFront(doctor.id, today);
        }
      } catch (err) {
        options.onError?.(err);
      }
    },
    { noOverlap: true },
  );
}
