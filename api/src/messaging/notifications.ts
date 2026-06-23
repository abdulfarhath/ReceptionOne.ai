// Sends patient-facing notifications through the active ChannelAdapter:
// confirmations (inline, on a successful book/reschedule/cancel) and reminders
// (driven by the reminder job). Messaging is consent-gated and the reminder
// ledger (Repository.recordNotificationOnce) makes reminders idempotent.

import type { Clock } from "../domain/scheduling.js";
import type { Appointment } from "../domain/types.js";
import type { Repository } from "../repository/repository.js";
import type { ChannelAdapter } from "./channel.js";
import { t } from "./i18n.js";
import type { Language } from "./conversation.js";

export const REMINDER_24H = "REMINDER_24H";
export const REMINDER_2H = "REMINDER_2H";

const HOUR_MS = 3_600_000;
const LEAD_24H_MS = 24 * HOUR_MS;
const LEAD_2H_MS = 2 * HOUR_MS;

const systemClock: Clock = { now: () => new Date() };

const istDateTime = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export type ConfirmationKind = "booked" | "rescheduled" | "cancelled";

export interface NotificationServiceDeps {
  repo: Repository;
  channel: ChannelAdapter;
  clock?: Clock;
}

export class NotificationService {
  private readonly repo: Repository;
  private readonly channel: ChannelAdapter;
  private readonly clock: Clock;

  constructor(deps: NotificationServiceDeps) {
    this.repo = deps.repo;
    this.channel = deps.channel;
    this.clock = deps.clock ?? systemClock;
  }

  /** Send a confirmation for a state change. No-op if the patient hasn't consented. */
  async confirm(appointment: Appointment, kind: ConfirmationKind): Promise<void> {
    const patient = await this.repo.getPatient(appointment.patientId);
    if (!patient || !patient.consentAt) return;

    // A reschedule moves the appointment, so its reminders must be re-armed.
    if (kind === "rescheduled") {
      await this.repo.deleteNotifications(appointment.id, [
        REMINDER_24H,
        REMINDER_2H,
      ]);
    }

    const doctor = await this.repo.getDoctor(appointment.doctorId);
    const who = doctor?.name ?? "the doctor";
    const when = istDateTime.format(appointment.start);
    const lang = (patient.language ?? "en") as Language;
    
    let message = "";
    if (kind === "booked") {
      message = t("confirm_booked", lang, { doctor: who, time: when });
    } else if (kind === "rescheduled") {
      message = t("confirm_rescheduled", lang, { doctor: who, time: when });
    } else {
      message = t("confirm_cancelled", lang, { doctor: who, time: when });
    }

    await this.channel.sendText(patient.phone, message);
  }

  /** Send an alert to the doctor for a new booking, reschedule, or cancellation. */
  async notifyDoctor(
    appointment: Appointment,
    kind: ConfirmationKind,
  ): Promise<void> {
    const doctor = await this.repo.getDoctor(appointment.doctorId);
    if (!doctor || !doctor.phone) return;

    const patient = await this.repo.getPatient(appointment.patientId);
    const patientName = patient?.name ?? "A patient";
    const when = istDateTime.format(appointment.start);

    const message =
      kind === "booked"
        ? `New booking alert: ${patientName} has booked an appointment for ${when}.`
        : kind === "rescheduled"
          ? `Update: ${patientName} has rescheduled their appointment to ${when}.`
          : `Cancellation: ${patientName} has cancelled their appointment for ${when}.`;

    await this.channel.sendText(doctor.phone, message);
  }

  /**
   * One reminder pass: send a 24h reminder to appointments 2–24h away and a 2h
   * reminder to those within 2h. Idempotent and safe to re-run (each kind is
   * claimed via recordNotificationOnce before sending). Returns the count sent.
   */
  async runReminders(): Promise<{ sent: number }> {
    const now = this.clock.now();
    const horizon = new Date(now.getTime() + LEAD_24H_MS);
    const appointments = await this.repo.listBookedBetween(now, horizon);

    let sent = 0;
    for (const appointment of appointments) {
      const within2h =
        appointment.start.getTime() <= now.getTime() + LEAD_2H_MS;
      const kind = within2h ? REMINDER_2H : REMINDER_24H;

      const patient = await this.repo.getPatient(appointment.patientId);
      if (!patient || !patient.consentAt) continue;

      const claimed = await this.repo.recordNotificationOnce(
        appointment.id,
        kind,
      );
      if (!claimed) continue; // already reminded — idempotent

      const doctor = await this.repo.getDoctor(appointment.doctorId);
      const who = doctor?.name ?? "the doctor";
      const when = istDateTime.format(appointment.start);
      const lang = (patient.language ?? "en") as Language;
      
      const message = within2h 
        ? t("remind_2h", lang, { doctor: who, time: when })
        : t("remind_24h", lang, { doctor: who, time: when });

      await this.channel.sendText(patient.phone, message);
      sent++;
    }
    return { sent };
  }
}
