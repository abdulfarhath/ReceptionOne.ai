import type { Logger } from "pino";

import type { Repository } from "../repository/repository.js";
import type { StaffRepository } from "../repository/staff-repository.js";
import type { BroadcastService } from "../messaging/broadcasts.js";
import type { ChannelAdapter } from "../messaging/channel.js";
import type { ConversationEngine } from "../messaging/engine.js";
import type { QueueNotifier } from "../messaging/queue-notifier.js";

/** A single adapter providing both scheduling and staff persistence. */
export type AppRepository = Repository & StaffRepository;

export interface AppConfig {
  jwtSecret: string;
  jwtExpiresInSeconds: number;
  cookieName: string;
  /** Set the Secure flag on the auth cookie (true in production/HTTPS). */
  cookieSecure: boolean;
}

export interface MessagingDeps {
  engine: ConversationEngine;
  channel: ChannelAdapter;
  twilioAuthToken?: string;
  publicUrl?: string;
}

export interface AppDeps {
  repo: AppRepository;
  config: AppConfig;
  logger: Logger;
  /** When present, mounts POST /webhook for inbound WhatsApp messages. */
  messaging?: MessagingDeps;
  /** When present, mounts /api/broadcasts for one-to-many patient messaging. */
  broadcasts?: BroadcastService;
  /** When present, sends "you're next" after queue changes. */
  queueNotifier?: QueueNotifier;
}
