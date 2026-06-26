// QueueNotifier: the post-change recompute hook for a doctor's queue. Called
// after any change that can move the front (join, check-in, start, complete,
// cancel, no-show, reinstate). It does two consent-gated, idempotent things:
//   1. "You're next" — once per booking, to the next present patient.
//   2. Slip re-notify — when a waiting patient's max wait grows past a threshold
//      vs what they were last told ("running a little behind").
// Never throws — queue operations must not fail because a notification did.

import { activeOrder, estimateRange, positionOf } from "../domain/queue.js";
import { AppointmentStatus } from "../domain/types.js";
import type { Repository } from "../repository/repository.js";
import type { ChannelAdapter } from "./channel.js";
import type { Language } from "./conversation.js";
import { t } from "./i18n.js";

const YOURE_NEXT = "YOURE_NEXT";
const DEFAULT_SLIP_MIN = 20;

const ACTIVE_WAITING: ReadonlySet<AppointmentStatus> = new Set([
  AppointmentStatus.WAITING,
  AppointmentStatus.ARRIVED,
]);

export interface QueueNotifierDeps {
  repo: Repository;
  channel: ChannelAdapter;
  /** Re-notify once a patient's max wait grows by more than this vs last told. */
  slipMin?: number;
  onError?: (err: unknown) => void;
}

export class QueueNotifier {
  private readonly repo: Repository;
  private readonly channel: ChannelAdapter;
  private readonly slipMin: number;
  private readonly onError: ((err: unknown) => void) | undefined;

  constructor(deps: QueueNotifierDeps) {
    this.repo = deps.repo;
    this.channel = deps.channel;
    this.slipMin = deps.slipMin ?? DEFAULT_SLIP_MIN;
    this.onError = deps.onError;
  }

  /** Recompute the queue and fire any due "you're next" / slip notifications. */
  async notifyFront(doctorId: string, queueDate: Date): Promise<void> {
    try {
      const doctor = await this.repo.getDoctor(doctorId);
      const avg = doctor?.avgConsultMinutes ?? 15;
      const doctorName = doctor?.name ?? "the doctor";
      const order = activeOrder(
        await this.repo.listQueueEntries(doctorId, queueDate),
      );

      // 1) "You're next" — the next person up (ignoring whoever is being seen).
      const next = order.find((e) => ACTIVE_WAITING.has(e.status));
      if (next) {
        const patient = await this.repo.getPatient(next.patientId);
        if (patient?.consentAt) {
          // Consent first (don't burn the one-shot on a non-consenter), then claim.
          if (await this.repo.claimNotification(next.id, YOURE_NEXT)) {
            await this.channel.sendText(
              patient.phone,
              t("queue_youre_next", langOf(patient), { doctor: doctorName }),
            );
          }
        }
      }

      // 2) Slip re-notify — anyone whose max wait grew past the threshold.
      for (const entry of order) {
        if (!ACTIVE_WAITING.has(entry.status)) continue;
        if (entry.lastNotifiedMaxMinutes === null) continue;

        const peopleAhead = Math.max(0, positionOf(entry, order) - 1);
        const range = estimateRange(peopleAhead, avg);
        if (range.maxMinutes - entry.lastNotifiedMaxMinutes <= this.slipMin) {
          continue;
        }

        const patient = await this.repo.getPatient(entry.patientId);
        if (!patient?.consentAt) continue;

        await this.channel.sendText(
          patient.phone,
          t("queue_slip", langOf(patient), {
            doctor: doctorName,
            min: String(range.minMinutes),
            max: String(range.maxMinutes),
          }),
        );
        // Update the baseline so we don't re-send until it slips again.
        await this.repo.updateAppointment(entry.id, {
          lastNotifiedMaxMinutes: range.maxMinutes,
        });
      }
    } catch (err) {
      this.onError?.(err);
    }
  }
}

function langOf(patient: { language?: string }): Language {
  return (patient.language ?? "en") as Language;
}
