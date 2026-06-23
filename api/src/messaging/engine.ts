// ConversationEngine: a per-sender state machine for WhatsApp-style booking.
// It NEVER decides availability or writes appointments itself — every check and
// write goes through SchedulingService. It only formats options and parses the
// patient's numbered replies.
//
// Interactive messages: uses sendButtons (≤3 choices) or sendList (4+) so that
// WhatsApp renders tappable UI elements instead of plain numbered text.

import { DomainError } from "../domain/errors.js";
import type { Patient } from "../domain/types.js";
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
  type Language,
} from "./conversation.js";
import type { NotificationService } from "./notifications.js";
import { t } from "./i18n.js";

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

function getActionOptions(lang: Language): string[] {
  return [
    t("opt_book", lang),
    t("opt_reschedule", lang),
    t("opt_cancel", lang),
    t("opt_view", lang),
    t("opt_doctors", lang),
    t("opt_about", lang),
    t("opt_receptionist", lang),
  ];
}
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
      case ConversationStep.CHOOSE_LANGUAGE:
        return this.onChooseLanguage(record, inbound);
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
      step: ConversationStep.CHOOSE_LANGUAGE,
      context: {},
    });
    // 3 options → quick-reply buttons
    await this.channel.sendButtons(
      phone,
      t("language_prompt", "en"),
      this.toButtons([t("btn_english", "en"), t("btn_telugu", "te"), t("btn_hindi", "hi")]),
    );
  }

  private async onChooseLanguage(
    record: ConversationRecord,
    inbound: InboundMessage,
  ): Promise<void> {
    const choice = inbound.choiceIndex;
    let lang: Language = "en";
    if (choice === 2) lang = "te";
    if (choice === 3) lang = "hi";
    
    record.context.language = lang;
    record.step = ConversationStep.CHECK_EMERGENCY;
    await this.store.save(record);
    
    await this.channel.sendButtons(
      record.phone,
      t("emergency_check", lang),
      this.toButtons([t("btn_yes_emergency", lang), t("btn_no", lang)]),
    );
  }

  private async onCheckEmergency(
    record: ConversationRecord,
    inbound: InboundMessage,
  ): Promise<void> {
    const choice = inbound.choiceIndex;
    const lang = record.context.language ?? "en";
    
    if (choice === 1) {
      await this.channel.sendText(
        record.phone,
        t("emergency_reply", lang),
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
        t("menu_prompt", lang),
        getActionOptions(lang),
        t("menu_title", lang),
      );
      return;
    }
    return this.repromptList(record);
  }

  private async onChooseAction(
    record: ConversationRecord,
    inbound: InboundMessage,
  ): Promise<void> {
    const choice = inbound.choiceIndex;
    const lang = record.context.language ?? "en";
    
    if (!choice || choice < 1 || choice > ACTIONS.length) {
      return this.repromptList(record);
    }
    const action = ACTIONS[choice - 1]!;
    record.context = { action, language: lang };

    if (action === "about_hospital") {
      return this.finish(record, t("about_text", lang));
    }

    if (action === "talk_receptionist") {
      return this.finish(record, t("receptionist_text", lang));
    }

    if (action === "our_doctors") {
      const doctors = await this.repo.listDoctors();
      if (doctors.length === 0) {
        return this.finish(record, t("no_doctors", lang));
      }
      const text = doctors.map((d) => `• ${d.name} (${d.department})`).join("\n");
      return this.finish(record, t("our_doctors_text", lang) + "\n" + text);
    }

    if (action === "book") {
      const patient = await this.repo.getPatientByPhone(record.phone);
      if (patient) {
        record.context.patientId = patient.id;
        record.context.patientName = patient.name;
        await this.syncPatientLanguage(patient, lang);
        return this.startChooseDoctor(record);
      }
      record.step = ConversationStep.ASK_NAME;
      await this.store.save(record);
      await this.channel.sendText(record.phone, t("ask_name", lang));
      return;
    }

    // reschedule / cancel / view appointments — needs an existing patient
    const patient = await this.repo.getPatientByPhone(record.phone);
    if (!patient) {
      await this.channel.sendText(record.phone, t("no_appointments", lang));
      return this.greet(record.phone);
    }
    record.context.patientId = patient.id;
    await this.syncPatientLanguage(patient, lang);

    if (action === "view_appointments") {
      const appts = await this.repo.listUpcomingAppointmentsForPatient(
        patient.id,
        this.clock.now(),
      );
      if (appts.length === 0) {
        return this.finish(record, t("no_appointments", lang));
      }
      const lines = [];
      for (const a of appts) {
        const doc = await this.repo.getDoctor(a.doctorId);
        lines.push(`• ${doc?.name ?? "Doctor"} on ${istFormat.format(a.start)}`);
      }
      return this.finish(record, t("upcoming_appointments", lang) + "\n" + lines.join("\n"));
    }

    return this.startChooseAppointment(record);
  }

  private async onAskName(
    record: ConversationRecord,
    inbound: InboundMessage,
  ): Promise<void> {
    const name = inbound.text.trim();
    const lang = record.context.language ?? "en";
    if (name.length === 0) {
      await this.channel.sendText(record.phone, t("ask_name", lang));
      return;
    }
    const patient = await this.repo.createPatient({
      phone: record.phone,
      name,
      language: lang,
      consentAt: this.clock.now(), // messaging us = consent on first contact
    });
    record.context.patientId = patient.id;
    record.context.patientName = name;
    return this.startChooseDoctor(record);
  }

  private async startChooseDoctor(record: ConversationRecord): Promise<void> {
    const lang = record.context.language ?? "en";
    const doctors = await this.repo.listDoctors();
    if (doctors.length === 0) {
      await this.channel.sendText(record.phone, t("no_doctors", lang));
      return this.greet(record.phone);
    }
    record.context.offeredDoctorIds = doctors.map((d) => d.id);
    record.step = ConversationStep.CHOOSE_DOCTOR;
    await this.store.save(record);
    const labels = doctors.map((d) => `${d.name} — ${d.department}`);
    await this.sendInteractive(
      record.phone,
      t("choose_doctor", lang),
      labels,
      "Doctor",
    );
  }

  private async onChooseDoctor(
    record: ConversationRecord,
    inbound: InboundMessage,
  ): Promise<void> {
    const ids = record.context.offeredDoctorIds ?? [];
    const choice = inbound.choiceIndex;
    if (!choice || choice < 1 || choice > ids.length) {
      return this.repromptList(record);
    }
    record.context.doctorId = ids[choice - 1]!;
    return this.startChooseSlot(record);
  }

  private async startChooseSlot(record: ConversationRecord): Promise<void> {
    const lang = record.context.language ?? "en";
    const doctorId = record.context.doctorId!;
    const slots = await this.upcomingSlots(doctorId);
    if (slots.length === 0) {
      await this.channel.sendText(record.phone, t("no_slots", lang));
      return this.greet(record.phone);
    }
    record.context.offeredSlotsIso = slots.map((s) => s.toISOString());
    record.step = ConversationStep.CHOOSE_SLOT;
    await this.store.save(record);
    const labels = slots.map((s) => istFormat.format(s));
    await this.sendInteractive(
      record.phone,
      t("choose_slot", lang),
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
      return this.repromptList(record);
    }
    record.context.slotIso = slotsIso[choice - 1]!;
    record.step = ConversationStep.CONFIRM;
    await this.store.save(record);

    const slot = new Date(record.context.slotIso!);
    const doctor = record.context.doctorId
      ? await this.repo.getDoctor(record.context.doctorId)
      : null;
    const lang = record.context.language ?? "en";
    const who = doctor ? doctor.name : "Doctor";
    const when = istFormat.format(slot);
    
    await this.channel.sendButtons(
      record.phone,
      t("confirm_book_prompt", lang, { doctor: who, time: when }),
      this.toButtons([t("btn_yes_confirm", lang), t("btn_no_back", lang)]),
    );
  }

  private async startChooseAppointment(
    record: ConversationRecord,
  ): Promise<void> {
    const patientId = record.context.patientId!;
    const lang = record.context.language ?? "en";
    const appts = await this.repo.listUpcomingAppointmentsForPatient(
      patientId,
      this.clock.now(),
    );
    if (appts.length === 0) {
      await this.channel.sendText(record.phone, t("no_appointments", lang));
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
    const title = record.context.action === "cancel" ? t("choose_appt_cancel", lang) : t("choose_appt_reschedule", lang);
    await this.sendInteractive(
      record.phone,
      title,
      labels,
      "Appt",
    );
  }

  private async onChooseAppointment(
    record: ConversationRecord,
    inbound: InboundMessage,
  ): Promise<void> {
    const ids = record.context.offeredAppointmentIds ?? [];
    const choice = inbound.choiceIndex;
    const lang = record.context.language ?? "en";
    
    if (!choice || choice < 1 || choice > ids.length) {
      return this.repromptList(record);
    }
    const appointmentId = ids[choice - 1]!;
    record.context.appointmentId = appointmentId;

    const appt = await this.repo.getAppointment(appointmentId);
    if (!appt) {
      await this.channel.sendText(record.phone, t("no_appointments", lang));
      return this.greet(record.phone);
    }
    record.context.doctorId = appt.doctorId;

    if (record.context.action === "cancel") {
      record.step = ConversationStep.CONFIRM;
      await this.store.save(record);
      const doctor = await this.repo.getDoctor(appt.doctorId);
      const who = doctor?.name ?? "Doctor";
      const when = istFormat.format(appt.start);
      await this.channel.sendButtons(
        record.phone,
        t("confirm_cancel_prompt", lang, { doctor: who, time: when }),
        this.toButtons([t("btn_yes_cancel", lang), t("btn_no_keep", lang)]),
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
    const lang = record.context.language ?? "en";
    if (choice === 2) {
      await this.channel.sendText(record.phone, t("reschedule_ok", lang));
      return this.greet(record.phone);
    }
    if (choice !== 1) {
      await this.channel.sendText(record.phone, t("reply_1_or_2", lang));
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
          t("booked_success", lang, { time: istFormat.format(appt.start) }),
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
          t("rescheduled_success", lang, { time: istFormat.format(appt.start) }),
        );
      } else if (action === "cancel") {
        const appt = await this.scheduling.cancel(appointmentId!);
        if (this.notifications) {
          await this.notifications.notifyDoctor(appt, "cancelled").catch((err) => {
            console.error("Failed to notify doctor:", err);
          });
        }
        await this.finish(record, t("cancelled_success", lang));
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
    const lang = record.context.language ?? "en";
    record.context = {};
    await this.store.save(record);
    await this.channel.sendText(
      record.phone,
      `${message}\n\n${t("menu_hint", lang)}`,
    );
  }

  private async handleDomainError(
    record: ConversationRecord,
    err: unknown,
  ): Promise<void> {
    if (!(err instanceof DomainError)) throw err;
    const lang = record.context.language ?? "en";
    if (err.code === "SLOT_UNAVAILABLE") {
      await this.channel.sendText(record.phone, t("err_slot_taken", lang));
      // Re-offer slots for the same doctor (book or reschedule).
      if (record.context.doctorId) return this.startChooseSlot(record);
    } else if (err.code === "OUTSIDE_HOURS" || err.code === "PAST_TIME") {
      await this.channel.sendText(record.phone, t("err_time_unavailable", lang));
      if (record.context.doctorId) return this.startChooseSlot(record);
    } else {
      await this.channel.sendText(record.phone, t("err_generic", lang));
    }
    return this.greet(record.phone);
  }

  private repromptList(record: ConversationRecord): Promise<void> {
    const lang = record.context.language ?? "en";
    return this.channel.sendText(record.phone, t("reprompt_menu", lang));
  }

  /**
   * The language the patient picks this session is the source of truth. Persist it
   * onto the patient record when it differs so async confirmations and reminders
   * (which read patient.language) go out in the same language they chatted in.
   */
  private async syncPatientLanguage(
    patient: Patient,
    lang: Language,
  ): Promise<void> {
    if ((patient.language ?? "en") !== lang) {
      await this.repo.updatePatient(patient.id, { language: lang });
    }
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
