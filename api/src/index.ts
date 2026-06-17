import { PrismaClient } from "@prisma/client";
import pino, { type LoggerOptions } from "pino";

import { SchedulingService } from "./domain/scheduling.js";
import { createApp } from "./http/app.js";
import type { AppConfig, MessagingDeps } from "./http/deps.js";
import { startReminderJob } from "./jobs/reminders.js";
import { createChannelFromEnv } from "./messaging/channel-factory.js";
import { ConversationEngine } from "./messaging/engine.js";
import { PrismaConversationStore } from "./messaging/conversation-store.js";
import { NotificationService } from "./messaging/notifications.js";
import { PrismaRepository } from "./repository/prisma.js";

const loggerOptions: LoggerOptions =
  process.env.NODE_ENV === "production"
    ? {}
    : { transport: { target: "pino-pretty" } };

const logger = pino(loggerOptions);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    logger.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

const config: AppConfig = {
  jwtSecret: requireEnv("JWT_SECRET"),
  jwtExpiresInSeconds: Number(process.env.JWT_EXPIRES_SECONDS ?? 3600),
  cookieName: process.env.AUTH_COOKIE_NAME ?? "session",
  cookieSecure: process.env.NODE_ENV === "production",
};

const prisma = new PrismaClient();
const repo = new PrismaRepository(prisma);
const scheduling = new SchedulingService(repo);

// Select the WhatsApp channel by env; fall back to the Mock when Twilio is unset.
const { channel, usingTwilio, twilioAuthToken } = createChannelFromEnv((line) =>
  logger.debug(line),
);
logger.info(`WhatsApp channel: ${usingTwilio ? "Twilio" : "Mock"}`);

const notifications = new NotificationService({ repo, channel });
const engine = new ConversationEngine({
  repo,
  scheduling,
  channel,
  store: new PrismaConversationStore(prisma),
});

const messaging: MessagingDeps = {
  engine,
  channel,
  ...(twilioAuthToken ? { twilioAuthToken } : {}),
  ...(process.env.PUBLIC_URL ? { publicUrl: process.env.PUBLIC_URL } : {}),
};

const app = createApp({ repo, config, logger, messaging, notifications });

const port = Number(process.env.PORT ?? 3000);

app.listen(port, () => {
  logger.info(`API listening on http://localhost:${port}`);
});

// Run reminders in-process when enabled (or run the standalone worker separately).
if (process.env.ENABLE_REMINDERS === "true") {
  startReminderJob(notifications, {
    ...(process.env.REMINDER_CRON
      ? { cronExpression: process.env.REMINDER_CRON }
      : {}),
    onSent: (count) => logger.info(`reminders sent: ${count}`),
    onError: (err) => logger.error({ err }, "reminder pass failed"),
  });
  logger.info("Reminder job enabled");
}
