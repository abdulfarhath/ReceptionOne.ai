// Reminder cron job. V1 runs node-cron in-process; at scale, move this to a
// BullMQ + Redis worker so reminders survive restarts and run on a dedicated
// process. The actual logic lives in NotificationService.runReminders() — this
// file only schedules it and provides a standalone entrypoint.

import { fileURLToPath } from "node:url";

import cron, { type ScheduledTask } from "node-cron";
import { PrismaClient } from "@prisma/client";
import pino from "pino";

import { NotificationService } from "../messaging/notifications.js";
import { createChannelFromEnv } from "../messaging/channel-factory.js";
import { PrismaRepository } from "../repository/prisma.js";

// Every 2 minutes by default; the 2–24h reminder windows are far wider than the
// interval, so a tick is never "missed".
export const DEFAULT_REMINDER_CRON = "*/2 * * * *";

export interface ReminderJobOptions {
  cronExpression?: string;
  onSent?: (count: number) => void;
  onError?: (err: unknown) => void;
}

/** Schedule the reminder pass. Returns the task so callers can stop() it. */
export function startReminderJob(
  notifications: NotificationService,
  options: ReminderJobOptions = {},
): ScheduledTask {
  return cron.schedule(
    options.cronExpression ?? DEFAULT_REMINDER_CRON,
    async () => {
      try {
        const { sent } = await notifications.runReminders();
        if (sent > 0) options.onSent?.(sent);
      } catch (err) {
        options.onError?.(err);
      }
    },
    { noOverlap: true },
  );
}

// --- standalone worker: `npm run reminders` -------------------------------
async function main(): Promise<void> {
  const logger = pino(
    process.env.NODE_ENV === "production"
      ? {}
      : { transport: { target: "pino-pretty" } },
  );
  const prisma = new PrismaClient();
  const repo = new PrismaRepository(prisma);
  const { channel, usingTwilio } = createChannelFromEnv((line) =>
    logger.debug(line),
  );
  const notifications = new NotificationService({ repo, channel });

  const cronExpression = process.env.REMINDER_CRON ?? DEFAULT_REMINDER_CRON;
  startReminderJob(notifications, {
    cronExpression,
    onSent: (count) => logger.info(`reminders sent: ${count}`),
    onError: (err) => logger.error({ err }, "reminder pass failed"),
  });
  logger.info(
    `Reminder worker started (${cronExpression}, channel=${usingTwilio ? "twilio" : "mock"})`,
  );
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  void main();
}
