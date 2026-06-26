import { PrismaClient } from "@prisma/client";
import pino, { type LoggerOptions } from "pino";

import { SchedulingService } from "./domain/scheduling.js";
import { createApp } from "./http/app.js";
import type { AppConfig, MessagingDeps } from "./http/deps.js";
import { startBroadcastDispatchJob } from "./jobs/broadcasts.js";
import { startNoShowSweepJob } from "./jobs/no-show.js";
import { createChannelFromEnv } from "./messaging/channel-factory.js";
import { BroadcastService } from "./messaging/broadcasts.js";
import { ConversationEngine } from "./messaging/engine.js";
import { PrismaConversationStore } from "./messaging/conversation-store.js";
import { QueueNotifier } from "./messaging/queue-notifier.js";
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

const broadcasts = new BroadcastService({
  repo,
  channel,
  onError: (err) => logger.error({ err }, "broadcast dispatch failed"),
});
const queueNotifier = new QueueNotifier({
  repo,
  channel,
  ...(Number.isFinite(Number(process.env.SLIP_MIN))
    ? { slipMin: Number(process.env.SLIP_MIN) }
    : {}),
  onError: (err) => logger.error({ err }, "queue notify failed"),
});
const engine = new ConversationEngine({
  repo,
  scheduling,
  channel,
  store: new PrismaConversationStore(prisma),
  notifier: queueNotifier,
});

const messaging: MessagingDeps = {
  engine,
  channel,
  ...(twilioAuthToken ? { twilioAuthToken } : {}),
  ...(process.env.PUBLIC_URL ? { publicUrl: process.env.PUBLIC_URL } : {}),
};

const app = createApp({
  repo,
  config,
  logger,
  messaging,
  broadcasts,
  queueNotifier,
});

const port = Number(process.env.PORT ?? 3000);

app.listen(port, () => {
  logger.info(`API listening on http://localhost:${port}`);
});

// Dispatch due scheduled broadcasts every minute (in-process for V1).
startBroadcastDispatchJob(broadcasts, {
  onDispatched: (count) => logger.info(`broadcasts dispatched: ${count}`),
  onError: (err) => logger.error({ err }, "broadcast dispatch pass failed"),
});

// Flip stale WAITING tokens to NO_SHOW after each session ends + a grace period.
startNoShowSweepJob(scheduling, {
  graceMin: Number(process.env.NO_SHOW_GRACE_MIN ?? 30),
  onSwept: (count) => logger.info(`no-shows swept: ${count}`),
  onError: (err) => logger.error({ err }, "no-show sweep failed"),
});
