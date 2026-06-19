// ConversationEngine: a per-sender state machine for WhatsApp-style booking.
// It NEVER decides availability or writes appointments itself — every check and
// write goes through SchedulingService. It only formats options and parses the
// patient's numbered replies.
//
// Interactive messages: uses sendButtons (≤3 choices) or sendList (4+) so that
// WhatsApp renders tappable UI elements instead of plain numbered text.

import { DomainError } from "../domain/errors.js";
import type { Clock } from "../domain/scheduling.js";
import { SchedulingService } from "../domain/scheduling.js";
import type { Repository } from "../repository/repository.js";
import type {
  ChannelAdapter,
  InboundMessage,
  InteractiveButton,
  ListItem,
} from "./channel.js";
import {
  ConversationStep,
  type ConversationAction,
  type ConversationRecord,
  type ConversationStore,
} from "./conversation.js";
import type { NotificationService } from "./notifications.js";

const DAY_MS = 86_400_000;
const SLOT_LOOKAHEAD_DAYS = 14;
const MAX_SLOTS = 8;

const systemClock: Clock = { now: () => new Date() };

const istFormat = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function isRestart(text: string): boolean {
  return /^(hi|hello|hey|menu|start|restart|0)$/i.test(text.trim());
}

const ACTION_OPTIONS = [
  "Book an appointment",
  "Reschedule an appointment",
  "Cancel an appointment",
  "View my appointments",
  "Our Doctors",
  "About the Hospital",
  "Talk to Receptionist",
];
const ACTIONS: ConversationAction[] = [
  "book",
  "reschedule",
  "cancel",
  "view_appointments",
  "our_doctors",
  "about_hospital",
  "talk_receptionist",
];

export interface ConversationEngineDeps {
  repo: Repository;
  scheduling: SchedulingService;
  channel: ChannelAdapter;
  store: ConversationStore;
  notifications?: NotificationService;
  clock?: Clock;
}

export class ConversationEngine {
  private readonly repo: Repository;
  private readonly scheduling: SchedulingService;
  private readonly channel: ChannelAdapter;
  private readonly store: ConversationStore;
  private readonly notifications: NotificationService | undefined;
  private readonly clock: Clock;

  constructor(deps: ConversationEngineDeps) {
    this.repo = deps.repo;
    this.scheduling = deps.scheduling;
    this.channel = deps.channel;
    this.store = deps.store;
    this.notifications = deps.notifications;
    this.clock = deps.clock ?? systemClock;
  }

  /** Process one inbound message and send the reply(ies) via the channel. */
  async handle(inbound: InboundMessage): Promise<void> {
    const phone = inbound.from;
    const record = await this.store.get(phone);

    if (!record || record.step === ConversationStep.DONE || isRestart(inbound.text)) {
      await this.greet(phone);
      return;
    }

    switch (record.step) {
      case ConversationStep.CHECK_EMERGENCY:
        return this.onCheckEmergency(record, inbound);
      case ConversationStep.CHOOSE_ACTION:
        return this.onChooseAction(record, inbound);
      case ConversationStep.ASK_NAME:
        return this.onAskName(record, inbound);
      case ConversationStep.CHOOSE_DOCTOR:
        return this.onChooseDoctor(record, inbound);
      case ConversationStep.CHOOSE_SLOT:
        return this.onChooseSlot(record, inbound);
      case ConversationStep.CHOOSE_APPOINTMENT:
        return this.onChooseAppointment(record, inbound);
      case ConversationStep.CONFIRM:
        return this.onConfirm(record, inbound);
      default:
        return this.greet(phone);
    }
  }

  // --- steps -------------------------------------------------------------
  private async greet(phone: string): Promise<void> {
    await this.store.save({
      phone,
      step: ConversationStep.CHECK_EMERGENCY,
      context: {},
    });
    // 2 options → quick-reply buttons
    await this.channel.sendButtons(
      phone,
      "Are you experiencing a medical emergency?",
      this.toButtons(["Yes, it's an emergency", "No"]),
    );
  }

  private async onCheckEmergency(
    record: ConversationRecord,
    inbound: InboundMessage,
  ): Promise<void> {
    const choice = inbound.choiceIndex;
    if (choice === 1) {
      await this.channel.sendText(
        record.phone,
        "Please call 108 (or your local emergency number) immediately, or visit the nearest emergency room.\n\nFor our clinic emergency reception, tap the number to call: +919059790014",
      );
      record.step = ConversationStep.DONE;
      await this.store.save(record);
      return;
    }
    if (choice === 2) {
      record.step = ConversationStep.CHOOSE_ACTION;
      await this.store.save(record);
      await this.sendInteractive(
        record.phone,
        "Hi! I'm the clinic booking assistant. Tap 'Main Menu' below to see what I can do for you — send 'menu' anytime to start over.",
        ACTION_OPTIONS,
        "Main Menu",
      );
      return;
    }
    return this.repromptList(record.phone);
  }

  private async onChooseAction(
    record: ConversationRecord,
    inbound: InboundMessage,
  ): Promise<void> {
    const choice = inbound.choiceIndex;
    if (!choice || choice < 1 || choice > ACTIONS.length) {
      return this.repromptList(record.phone);
    }
    const action = ACTIONS[choice - 1]!;
    record.context = { action };

    if (action === "about_hospital") {
      return this.finish(
        record,
        "We are ReceptionSync Clinic, providing top-notch healthcare services. We are open Monday to Saturday, 9 AM to 7 PM. Located at 123 Health Ave."
      );
    }

    if (action === "talk_receptionist") {
      return this.finish(
        record,
        "Our reception desk is available at +1-800-CLINIC during business hours. Please call us directly for immediate assistance."
      );
    }

    if (action === "our_doctors") {
      const doctors = await this.repo.listDoctors();
      if (doctors.length === 0) {
        return this.finish(record, "No doctors are currently listed.");
      }
      const text = doctors.map((d) => `• ${d.name} (${d.department})`).join("\n");
      return this.finish(record, "Our Doctors:\n" + text);
    }

    if (action === "book") {
      const patient = await this.repo.getPatientByPhone(record.phone);
      if (patient) {
        record.context.patientId = patient.id;
        record.context.patientName = patient.name;
        return this.startChooseDoctor(record);
      }
      record.step = ConversationStep.ASK_NAME;
      await this.store.save(record);
      await this.channel.sendText(
        record.phone,
        "Sure — what name should the appointment be under?",
      );
      return;
    }

    // reschedule / cancel / view appointments — needs an existing patient
    const patient = await this.repo.getPatientByPhone(record.phone);
    if (!patient) {
      await this.channel.sendText(
        record.phone,
        "I couldn't find any appointments for this number.",
      );
      return this.greet(record.phone);
    }
    record.context.patientId = patient.id;

    if (action === "view_appointments") {
      const appts = await this.repo.listUpcomingAppointmentsForPatient(
        patient.id,
        this.clock.now(),
      );
      if (appts.length === 0) {
        return this.finish(record, "You have no upcoming appointments.");
      }
      const lines = [];
      for (const a of appts) {
        const doc = await this.repo.getDoctor(a.doctorId);
        lines.push(`• ${doc?.name ?? "Doctor"} on ${istFormat.format(a.start)}`);
      }
      return this.finish(record, "Your upcoming appointments:\n" + lines.join("\n"));
    }

    return this.startChooseAppointment(record);
  }

  private async onAskName(
    record: ConversationRecord,
    inbound: InboundMessage,
  ): Promise<void> {
    const name = inbound.text.trim();
    if (name.length === 0) {
      await this.channel.sendText(record.phone, "Please tell me your name.");
      return;
    }
    const patient = await this.repo.createPatient({
      phone: record.phone,
      name,
      consentAt: this.clock.now(), // messaging us = consent on first contact
    });
    record.context.patientId = patient.id;
    record.context.patientName = name;
    return this.startChooseDoctor(record);
  }

  private async startChooseDoctor(record: ConversationRecord): Promise<void> {
    const doctors = await this.repo.listDoctors();
    if (doctors.length === 0) {
      await this.channel.sendText(
        record.phone,
        "Sorry, no doctors are available right now.",
      );
      return this.greet(record.phone);
    }
    record.context.offeredDoctorIds = doctors.map((d) => d.id);
    record.step = ConversationStep.CHOOSE_DOCTOR;
    await this.store.save(record);
    const labels = doctors.map((d) => `${d.name} — ${d.department}`);
    await this.sendInteractive(
      record.phone,
      "Which doctor would you like to see?",
      labels,
      "Choose Doctor",
    );
  }

  private async onChooseDoctor(
    record: ConversationRecord,
    inbound: InboundMessage,
  ): Promise<void> {
    const ids = record.context.offeredDoctorIds ?? [];
    const choice = inbound.choiceIndex;
    if (!choice || choice < 1 || choice > ids.length) {
      return this.repromptList(record.phone);
    }
    record.context.doctorId = ids[choice - 1]!;
    return this.startChooseSlot(record);
  }

  private async startChooseSlot(record: ConversationRecord): Promise<void> {
    const doctorId = record.context.doctorId!;
    const slots = await this.upcomingSlots(doctorId);
    if (slots.length === 0) {
      await this.channel.sendText(
        record.phone,
        "Sorry, there are no open times in the next two weeks for that doctor.",
      );
      return this.greet(record.phone);
    }
    record.context.offeredSlotsIso = slots.map((s) => s.toISOString());
    record.step = ConversationStep.CHOOSE_SLOT;
    await this.store.save(record);
    const labels = slots.map((s) => istFormat.format(s));
    await this.sendInteractive(
      record.phone,
      "Here are the next available times:",
      labels,
      "Pick a Time",
    );
  }

  private async onChooseSlot(
    record: ConversationRecord,
    inbound: InboundMessage,
  ): Promise<void> {
    const slotsIso = record.context.offeredSlotsIso ?? [];
    const choice = inbound.choiceIndex;
    if (!choice || choice < 1 || choice > slotsIso.length) {
      return this.repromptList(record.phone);
    }
    record.context.slotIso = slotsIso[choice - 1]!;
    record.step = ConversationStep.CONFIRM;
    await this.store.save(record);

    const slot = new Date(record.context.slotIso!);
    const doctor = record.context.doctorId
      ? await this.repo.getDoctor(record.context.doctorId)
      : null;
    const verb =
      record.context.action === "reschedule" ? "Move to" : "Book";
    // 2 options → quick-reply buttons
    await this.channel.sendButtons(
      record.phone,
      `${verb} ${doctor ? doctor.name + " on " : ""}${istFormat.format(slot)}?`,
      this.toButtons(["Yes, confirm", "No, back to menu"]),
    );
  }

  private async startChooseAppointment(
    record: ConversationRecord,
  ): Promise<void> {
    const patientId = record.context.patientId!;
    const appts = await this.repo.listUpcomingAppointmentsForPatient(
      patientId,
      this.clock.now(),
    );
    if (appts.length === 0) {
      await this.channel.sendText(
        record.phone,
        "You have no upcoming appointments.",
      );
      return this.greet(record.phone);
    }
    const labels: string[] = [];
    const ids: string[] = [];
    for (const a of appts) {
      const doctor = await this.repo.getDoctor(a.doctorId);
      labels.push(`${doctor?.name ?? "Doctor"} — ${istFormat.format(a.start)}`);
      ids.push(a.id);
    }
    record.context.offeredAppointmentIds = ids;
    record.step = ConversationStep.CHOOSE_APPOINTMENT;
    await this.store.save(record);
    const verb = record.context.action === "cancel" ? "cancel" : "reschedule";
    await this.sendInteractive(
      record.phone,
      `Which appointment would you like to ${verb}?`,
      labels,
      "Choose Appt",
    );
  }

  private async onChooseAppointment(
    record: ConversationRecord,
    inbound: InboundMessage,
  ): Promise<void> {
    const ids = record.context.offeredAppointmentIds ?? [];
    const choice = inbound.choiceIndex;
    if (!choice || choice < 1 || choice > ids.length) {
      return this.repromptList(record.phone);
    }
    const appointmentId = ids[choice - 1]!;
    record.context.appointmentId = appointmentId;

    const appt = await this.repo.getAppointment(appointmentId);
    if (!appt) {
      await this.channel.sendText(
        record.phone,
        "That appointment is no longer available.",
      );
      return this.greet(record.phone);
    }
    record.context.doctorId = appt.doctorId;

    if (record.context.action === "cancel") {
      record.step = ConversationStep.CONFIRM;
      await this.store.save(record);
      const doctor = await this.repo.getDoctor(appt.doctorId);
      // 2 options → quick-reply buttons
      await this.channel.sendButtons(
        record.phone,
        `Cancel your appointment with ${doctor?.name ?? "the doctor"} on ${istFormat.format(appt.start)}?`,
        this.toButtons(["Yes, cancel it", "No, keep it"]),
      );
      return;
    }
    // reschedule: pick a new slot for the same doctor.
    return this.startChooseSlot(record);
  }

  private async onConfirm(
    record: ConversationRecord,
    inbound: InboundMessage,
  ): Promise<void> {
    const choice = inbound.choiceIndex;
    if (choice === 2) {
      await this.channel.sendText(record.phone, "No problem.");
      return this.greet(record.phone);
    }
    if (choice !== 1) {
      await this.channel.sendText(
        record.phone,
        "Please reply 1 to confirm or 2 to go back.",
      );
      return;
    }

    const { action, doctorId, patientId, slotIso, appointmentId } =
      record.context;
    try {
      if (action === "book") {
        const appt = await this.scheduling.book({
          doctorId: doctorId!,
          patientId: patientId!,
          start: new Date(slotIso!),
        });
        if (this.notifications) {
          await this.notifications.notifyDoctor(appt, "booked").catch((err) => {
            console.error("Failed to notify doctor:", err);
          });
        }
        await this.finish(
          record,
          `You're booked for ${istFormat.format(appt.start)}. See you then!`,
        );
      } else if (action === "reschedule") {
        const appt = await this.scheduling.reschedule({
          appointmentId: appointmentId!,
          newStart: new Date(slotIso!),
        });
        if (this.notifications) {
          await this.notifications.notifyDoctor(appt, "rescheduled").catch((err) => {
            console.error("Failed to notify doctor:", err);
          });
        }
        await this.finish(
          record,
          `Done — your appointment is now ${istFormat.format(appt.start)}.`,
        );
      } else if (action === "cancel") {
        const appt = await this.scheduling.cancel(appointmentId!);
        if (this.notifications) {
          await this.notifications.notifyDoctor(appt, "cancelled").catch((err) => {
            console.error("Failed to notify doctor:", err);
          });
        }
        await this.finish(record, "Your appointment has been cancelled.");
      } else {
        await this.greet(record.phone);
      }
    } catch (err) {
      await this.handleDomainError(record, err);
    }
  }

  // --- helpers -----------------------------------------------------------
  private async finish(
    record: ConversationRecord,
    message: string,
  ): Promise<void> {
    record.step = ConversationStep.DONE;
    record.context = {};
    await this.store.save(record);
    await this.channel.sendText(
      record.phone,
      `${message}\n\nSend 'menu' to do something else.`,
    );
  }

  private async handleDomainError(
    record: ConversationRecord,
    err: unknown,
  ): Promise<void> {
    if (!(err instanceof DomainError)) throw err;
    if (err.code === "SLOT_UNAVAILABLE") {
      await this.channel.sendText(
        record.phone,
        "Sorry, that time was just taken. Let's pick another.",
      );
      // Re-offer slots for the same doctor (book or reschedule).
      if (record.context.doctorId) return this.startChooseSlot(record);
    } else if (err.code === "OUTSIDE_HOURS" || err.code === "PAST_TIME") {
      await this.channel.sendText(
        record.phone,
        "That time isn't available anymore. Let's pick another.",
      );
      if (record.context.doctorId) return this.startChooseSlot(record);
    } else {
      await this.channel.sendText(
        record.phone,
        "Sorry, I couldn't find that. Let's start over.",
      );
    }
    return this.greet(record.phone);
  }

  private repromptList(phone: string): Promise<void> {
    return this.channel.sendText(
      phone,
      "Sorry, I didn't catch that. Please tap one of the options above, or send 'menu' to start over.",
    );
  }

  /**
   * Pick the right interactive format based on option count:
   *   ≤3 → sendButtons (quick-reply, tappable inline)
   *   4+ → sendList   (list-picker, scrollable menu)
   */
  private async sendInteractive(
    to: string,
    body: string,
    labels: string[],
    listButtonLabel: string,
  ): Promise<void> {
    if (labels.length <= 3) {
      await this.channel.sendButtons(to, body, this.toButtons(labels));
    } else {
      await this.channel.sendList(
        to,
        body,
        listButtonLabel,
        this.toListItems(labels),
      );
    }
  }

  /** Convert string labels into InteractiveButton[]. IDs are 1-based. */
  private toButtons(labels: string[]): InteractiveButton[] {
    return labels.map((title, i) => ({ id: String(i + 1), title }));
  }

  /** Convert string labels into ListItem[]. IDs are 1-based. */
  private toListItems(labels: string[]): ListItem[] {
    return labels.map((title, i) => ({ id: String(i + 1), title }));
  }

  private async upcomingSlots(doctorId: string): Promise<Date[]> {
    const now = this.clock.now();
    const startMs = startOfUtcDay(now).getTime();
    const out: Date[] = [];
    for (let i = 0; i < SLOT_LOOKAHEAD_DAYS && out.length < MAX_SLOTS; i++) {
      const day = new Date(startMs + i * DAY_MS);
      const daySlots = await this.scheduling.getAvailableSlots(doctorId, day);
      for (const slot of daySlots) {
        if (slot.getTime() > now.getTime()) {
          out.push(slot);
          if (out.length >= MAX_SLOTS) break;
        }
      }
    }
    return out;
  }
}
