// BroadcastService: create and dispatch one-to-many broadcasts to all consented
// patients through the active ChannelAdapter. Sending is consent-gated (only
// patients with consentAt set are messaged) and phone numbers are never logged.
//
// Immediate broadcasts are stored with scheduledAt=null and dispatched in the
// same call. Scheduled ones keep a future scheduledAt and are picked up by the
// dispatch cron (runDue). At scale, move dispatch to a BullMQ worker with
// per-recipient jobs and rate limiting.

import type { Clock } from "../domain/scheduling.js";
import type {
  Broadcast,
  BroadcastCategory,
  BroadcastPriority,
} from "../domain/types.js";
import { BroadcastStatus } from "../domain/types.js";
import type { Repository } from "../repository/repository.js";
import type { ChannelAdapter } from "./channel.js";

const systemClock: Clock = { now: () => new Date() };

export interface CreateBroadcastRequest {
  title: string;
  body: string;
  category: BroadcastCategory;
  priority: BroadcastPriority;
  /** When to send; null (or a past time) means send immediately. */
  scheduledAt: Date | null;
}

export interface BroadcastSender {
  id: string;
  name: string;
}

export interface BroadcastServiceDeps {
  repo: Repository;
  channel: ChannelAdapter;
  clock?: Clock;
  /** Optional error sink. Never pass patient identifiers to it. */
  onError?: (err: unknown) => void;
}

export class BroadcastService {
  private readonly repo: Repository;
  private readonly channel: ChannelAdapter;
  private readonly clock: Clock;
  private readonly onError: ((err: unknown) => void) | undefined;

  constructor(deps: BroadcastServiceDeps) {
    this.repo = deps.repo;
    this.channel = deps.channel;
    this.clock = deps.clock ?? systemClock;
    this.onError = deps.onError;
  }

  /**
   * Create a broadcast. Immediate ones (no future scheduledAt) are dispatched
   * now and returned as SENT; future ones are stored SCHEDULED for the cron.
   */
  async create(
    req: CreateBroadcastRequest,
    sender: BroadcastSender,
  ): Promise<Broadcast> {
    const now = this.clock.now();
    const immediate =
      req.scheduledAt === null || req.scheduledAt.getTime() <= now.getTime();

    const created = await this.repo.createBroadcast({
      title: req.title,
      body: req.body,
      category: req.category,
      priority: req.priority,
      status: BroadcastStatus.SCHEDULED,
      // Immediate sends keep scheduledAt null so the cron never double-dispatches.
      scheduledAt: immediate ? null : req.scheduledAt,
      sentAt: null,
      recipientCount: 0,
      createdById: sender.id,
      createdByName: sender.name,
    });

    return immediate ? this.dispatch(created) : created;
  }

  /** Send a broadcast to every consented patient and mark it SENT. */
  async dispatch(broadcast: Broadcast): Promise<Broadcast> {
    const patients = await this.repo.listPatients();
    const message = formatMessage(broadcast);

    let reached = 0;
    for (const patient of patients) {
      if (!patient.consentAt || !patient.phone) continue; // consent-gated
      try {
        await this.channel.sendText(patient.phone, message);
        reached++;
      } catch (err) {
        this.onError?.(err); // never include the phone number
      }
    }

    return this.repo.updateBroadcast(broadcast.id, {
      status: BroadcastStatus.SENT,
      sentAt: this.clock.now(),
      recipientCount: reached,
    });
  }

  /**
   * Dispatch every scheduled broadcast that is now due. Idempotent: each is
   * re-checked as still SCHEDULED before sending, and SENT ones are skipped by
   * listDueBroadcasts. Returns how many were dispatched.
   */
  async runDue(): Promise<{ dispatched: number }> {
    const due = await this.repo.listDueBroadcasts(this.clock.now());
    let dispatched = 0;
    for (const broadcast of due) {
      const fresh = await this.repo.getBroadcast(broadcast.id);
      if (!fresh || fresh.status !== BroadcastStatus.SCHEDULED) continue;
      await this.dispatch(fresh);
      dispatched++;
    }
    return { dispatched };
  }
}

/** Render the outbound text. WhatsApp renders *asterisks* as bold for the title. */
function formatMessage(broadcast: Broadcast): string {
  return `*${broadcast.title}*\n\n${broadcast.body}`;
}
