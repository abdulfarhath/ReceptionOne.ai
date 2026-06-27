// ConversationEngine: a per-sender state machine for WhatsApp-style queue join.
// It NEVER decides ordering or writes entries itself — every check and write goes
// through SchedulingService. It only formats options and parses tapped replies.
//
// Queue model: there are no time slots. Booking = joining a doctor's live token
// queue for today; the patient gets a token number, an estimated wait, and a
// suggested arrival time.

import { DomainError } from "../domain/errors.js";
import type { Clock } from "../domain/scheduling.js";
import { SchedulingService, toQueueDate } from "../domain/scheduling.js";
import { AppointmentStatus } from "../domain/types.js";
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
import type { QueueNotifier } from "./queue-notifier.js";
import { t } from "./i18n.js";

const systemClock: Clock = { now: () => new Date() };

const istTime = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const ACTIVE: ReadonlySet<AppointmentStatus> = new Set([
  AppointmentStatus.WAITING,
  AppointmentStatus.ARRIVED,
  AppointmentStatus.IN_PROGRESS,
]);

function isRestart(text: string): boolean {
  return /^(hi|hello|hey|menu|start|restart|0)$/i.test(text.trim());
}

// Menu actions (reschedule is gone in the queue model — no slots to move).
const ACTIONS: ConversationAction[] = [
  "book",
  "cancel",
  "view_appointments",
  "our_doctors",
  "about_hospital",
  "talk_receptionist",
];

function getActionOptions(lang: Language): string[] {
  return [
    t("opt_book", lang),
    t("opt_cancel", lang),
    t("opt_view", lang),
    t("opt_doctors", lang),
    t("opt_about", lang),
    t("opt_receptionist", lang),
  ];
}

export interface ConversationEngineDeps {
  repo: Repository;
  scheduling: SchedulingService;
  channel: ChannelAdapter;
  store: ConversationStore;
  notifier?: QueueNotifier;
  clock?: Clock;
}

export class ConversationEngine {
  private readonly repo: Repository;
  private readonly scheduling: SchedulingService;
  private readonly channel: ChannelAdapter;
  private readonly store: ConversationStore;
  private readonly notifier: QueueNotifier | undefined;
  private readonly clock: Clock;

  constructor(deps: ConversationEngineDeps) {
    this.repo = deps.repo;
    this.scheduling = deps.scheduling;
    this.channel = deps.channel;
    this.store = deps.store;
    this.notifier = deps.notifier;
    this.clock = deps.clock ?? systemClock;
  }

  /** Process one inbound message and send the reply(ies) via the channel. */
  async handle(inbound: InboundMessage): Promise<void> {
    const phone = inbound.from;
    const text = inbound.text.trim();

    // Global keyword intents work at any point in (or outside) a conversation.
    if (/^(arrived|here|i'?m here|reached)$/i.test(text)) {
      return this.onArrivedKeyword(phone);
    }
    if (/^(status|how long|position|where|wait)$/i.test(text)) {
      return this.onStatusKeyword(phone);
    }

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
      case ConversationStep.CHOOSE_TIMING:
        return this.onChooseTiming(record, inbound);
      case ConversationStep.CHOOSE_TIME:
        return this.onChooseTime(record, inbound);
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
    let lang: Language = "en";
    if (inbound.choiceIndex === 2) lang = "te";
    if (inbound.choiceIndex === 3) lang = "hi";
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
    const lang = record.context.language ?? "en";
    if (inbound.choiceIndex === 1) {
      await this.channel.sendText(record.phone, t("emergency_reply", lang));
      record.step = ConversationStep.DONE;
      await this.store.save(record);
      return;
    }
    if (inbound.choiceIndex === 2) {
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

    if (action === "about_hospital") return this.finish(record, t("about_text", lang));
    if (action === "talk_receptionist") {
      return this.finish(record, t("receptionist_text", lang));
    }
    if (action === "our_doctors") {
      const doctors = await this.repo.listDoctors();
      if (doctors.length === 0) return this.finish(record, t("no_doctors", lang));
      const text = doctors.map((d) => `• ${d.name} (${d.department})`).join("\n");
      return this.finish(record, t("our_doctors_text", lang) + "\n" + text);
    }

    if (action === "book") {
      const patient = await this.repo.getPatientByPhone(record.phone);
      if (patient) {
        record.context.patientId = patient.id;
        record.context.patientName = patient.name;
        await this.syncPatientLanguage(patient.id, patient.language, lang);
        return this.startChooseDoctor(record);
      }
      record.step = ConversationStep.ASK_NAME;
      await this.store.save(record);
      await this.channel.sendText(record.phone, t("ask_name", lang));
      return;
    }

    // cancel / view — need an existing patient.
    const patient = await this.repo.getPatientByPhone(record.phone);
    if (!patient) {
      await this.channel.sendText(record.phone, t("queue_none", lang));
      return this.greet(record.phone);
    }
    record.context.patientId = patient.id;

    const active = await this.activeEntriesToday(patient.id);
    if (active.length === 0) return this.finish(record, t("queue_none", lang));

    if (action === "view_appointments") {
      const lines: string[] = [];
      for (const e of active) {
        const status = await this.scheduling.statusOf(e.id);
        const doc = await this.repo.getDoctor(e.doctorId);
        lines.push(
          t("queue_status", lang, {
            doctor: doc?.name ?? "Doctor",
            min: String(status.estimateMinMinutes),
            max: String(status.estimateMaxMinutes),
            arrival: istTime.format(status.suggestedArrival),
          }),
        );
      }
      return this.finish(record, lines.join("\n"));
    }

    // cancel: offer the active entries to pick from.
    const labels: string[] = [];
    const ids: string[] = [];
    for (const e of active) {
      const doc = await this.repo.getDoctor(e.doctorId);
      labels.push(`#${e.token} — ${doc?.name ?? "Doctor"}`);
      ids.push(e.id);
    }
    record.context.offeredAppointmentIds = ids;
    record.step = ConversationStep.CHOOSE_APPOINTMENT;
    await this.store.save(record);
    await this.sendInteractive(record.phone, t("choose_appt_cancel", lang), labels, "Token");
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
    await this.sendInteractive(record.phone, t("choose_doctor", lang), labels, "Doctor");
  }

  private async onChooseDoctor(
    record: ConversationRecord,
    inbound: InboundMessage,
  ): Promise<void> {
    const ids = record.context.offeredDoctorIds ?? [];
    const choice = inbound.choiceIndex;
    const lang = record.context.language ?? "en";
    if (!choice || choice < 1 || choice > ids.length) {
      return this.repromptList(record);
    }
    record.context.doctorId = ids[choice - 1]!;
    // Ask "come now" vs "pick a time" before quoting.
    record.step = ConversationStep.CHOOSE_TIMING;
    await this.store.save(record);
    await this.channel.sendButtons(
      record.phone,
      t("ask_timing", lang),
      this.toButtons([t("btn_come_now", lang), t("btn_pick_time", lang)]),
    );
  }

  /** "Come now" -> immediate quote+confirm; "Pick a time" -> offer scheduled times. */
  private async onChooseTiming(
    record: ConversationRecord,
    inbound: InboundMessage,
  ): Promise<void> {
    const lang = record.context.language ?? "en";
    const choice = inbound.choiceIndex;
    if (choice === 1) {
      return this.promptImmediateConfirm(record);
    }
    if (choice !== 2) return this.repromptList(record);

    const times = await this.scheduledTimeOptions(record.context.doctorId!);
    if (times.length === 0) {
      // No times left in today's session — fall back to coming now.
      return this.promptImmediateConfirm(record);
    }
    record.context.offeredTimesIso = times.map((d) => d.toISOString());
    record.step = ConversationStep.CHOOSE_TIME;
    await this.store.save(record);
    await this.sendInteractive(
      record.phone,
      t("choose_time", lang),
      times.map((d) => istTime.format(d)),
      "Time",
    );
  }

  /** Pick a concrete scheduled time -> window quote -> confirm. */
  private async onChooseTime(
    record: ConversationRecord,
    inbound: InboundMessage,
  ): Promise<void> {
    const lang = record.context.language ?? "en";
    const iso = record.context.offeredTimesIso ?? [];
    const choice = inbound.choiceIndex;
    if (!choice || choice < 1 || choice > iso.length) {
      return this.repromptList(record);
    }
    const targetIso = iso[choice - 1]!;
    record.context.targetTimeIso = targetIso;
    record.step = ConversationStep.CONFIRM;
    await this.store.save(record);

    const doctor = await this.repo.getDoctor(record.context.doctorId!);
    const sq = await this.scheduling.scheduledQuote(
      record.context.doctorId!,
      new Date(targetIso),
    );
    if (sq.likelySeenBy) {
      await this.channel.sendText(
        record.phone,
        t("scheduled_busy_note", lang, { likely: istTime.format(sq.likelySeenBy) }),
      );
    }
    await this.channel.sendButtons(
      record.phone,
      t("confirm_scheduled_prompt", lang, {
        doctor: doctor?.name ?? "Doctor",
        around: istTime.format(sq.aroundTime),
        comeBy: istTime.format(sq.comeBy),
      }),
      this.toButtons([t("btn_yes_confirm", lang), t("btn_no_back", lang)]),
    );
  }

  /** Quote the live queue now and ask to confirm an immediate token. */
  private async promptImmediateConfirm(record: ConversationRecord): Promise<void> {
    const lang = record.context.language ?? "en";
    delete record.context.targetTimeIso;
    record.step = ConversationStep.CONFIRM;
    await this.store.save(record);
    const doctor = await this.repo.getDoctor(record.context.doctorId!);
    const quote = await this.scheduling.quote(
      record.context.doctorId!,
      this.clock.now(),
    );
    await this.channel.sendButtons(
      record.phone,
      t("confirm_join_prompt", lang, {
        doctor: doctor?.name ?? "Doctor",
        min: String(quote.estimateMinMinutes),
        max: String(quote.estimateMaxMinutes),
        arrival: istTime.format(quote.suggestedArrival),
      }),
      this.toButtons([t("btn_yes_confirm", lang), t("btn_no_back", lang)]),
    );
  }

  /**
   * Concrete scheduled-time options inside today's session window: from the next
   * 30-min mark (at least ~30 min out) to session close, at hourly spacing, max 5.
   */
  private async scheduledTimeOptions(doctorId: string): Promise<Date[]> {
    const MIN = 60_000;
    const now = this.clock.now();
    const queueDate = toQueueDate(now);
    const windows = (await this.repo.listAvailability(doctorId)).filter(
      (w) => w.dayOfWeek === queueDate.getUTCDay(),
    );
    const startMs = windows.length
      ? queueDate.getTime() + Math.min(...windows.map((w) => w.startMinutes)) * MIN
      : now.getTime();
    const endMs = windows.length
      ? queueDate.getTime() + Math.max(...windows.map((w) => w.endMinutes)) * MIN
      : now.getTime() + 6 * 60 * MIN;

    // Earliest pickable: a bit out from now, rounded up to the next half hour.
    const floor = Math.max(startMs, now.getTime() + 30 * MIN);
    let cursor = Math.ceil(floor / (30 * MIN)) * (30 * MIN);
    const options: Date[] = [];
    while (cursor <= endMs && options.length < 5) {
      options.push(new Date(cursor));
      cursor += 60 * MIN;
    }
    return options;
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
    try {
      await this.scheduling.cancel(ids[choice - 1]!);
      return this.finish(record, t("cancelled_success", lang));
    } catch (err) {
      return this.handleDomainError(record, err);
    }
  }

  private async onConfirm(
    record: ConversationRecord,
    inbound: InboundMessage,
  ): Promise<void> {
    const lang = record.context.language ?? "en";
    if (inbound.choiceIndex === 2) {
      await this.channel.sendText(record.phone, t("reschedule_ok", lang));
      return this.greet(record.phone);
    }
    if (inbound.choiceIndex !== 1) {
      await this.channel.sendText(record.phone, t("reply_1_or_2", lang));
      return;
    }

    const { doctorId, patientName, targetTimeIso } = record.context;
    const target = targetTimeIso ? new Date(targetTimeIso) : null;
    try {
      const doctor = await this.repo.getDoctor(doctorId!);
      const result = await this.scheduling.joinQueue({
        doctorId: doctorId!,
        date: target ?? this.clock.now(),
        patientName: patientName ?? "Patient",
        patientPhone: record.phone,
        ...(target ? { targetTime: target } : {}),
      });
      await this.notifier?.notifyFront(
        doctorId!,
        toQueueDate(target ?? this.clock.now()),
      );
      if (result.scheduled && result.aroundTime && result.comeBy) {
        // Scheduled token: a window + come-by, never an exact minute.
        await this.finish(
          record,
          t("queue_scheduled", lang, {
            doctor: doctor?.name ?? "Doctor",
            around: istTime.format(result.aroundTime),
            comeBy: istTime.format(result.comeBy),
          }),
        );
      } else {
        await this.finish(
          record,
          t("queue_joined", lang, {
            doctor: doctor?.name ?? "Doctor",
            min: String(result.estimateMinMinutes),
            max: String(result.estimateMaxMinutes),
            arrival: istTime.format(result.suggestedArrival),
          }),
        );
      }
    } catch (err) {
      await this.handleDomainError(record, err);
    }
  }

  // --- keyword intents ---------------------------------------------------
  /** "arrived"/"here" -> check the patient's waiting token in, reply position/wait. */
  private async onArrivedKeyword(phone: string): Promise<void> {
    const patient = await this.repo.getPatientByPhone(phone);
    const lang = (patient?.language ?? "en") as Language;
    if (!patient) {
      await this.channel.sendText(phone, t("queue_none", lang));
      return;
    }
    const active = await this.activeEntriesToday(patient.id);
    const waiting = active.find((e) => e.status === AppointmentStatus.WAITING);
    const target = waiting ?? active[0];
    if (!target) {
      await this.channel.sendText(phone, t("queue_none", lang));
      return;
    }
    try {
      if (target.status === AppointmentStatus.WAITING) {
        await this.scheduling.checkIn(target.id);
        await this.notifier?.notifyFront(target.doctorId, target.queueDate);
      }
      const status = await this.scheduling.statusOf(target.id);
      const doctor = await this.repo.getDoctor(target.doctorId);
      await this.channel.sendText(
        phone,
        t("queue_arrived", lang, {
          doctor: doctor?.name ?? "the doctor",
          min: String(status.estimateMinMinutes),
          max: String(status.estimateMaxMinutes),
        }),
      );
    } catch {
      await this.channel.sendText(phone, t("err_generic", lang));
    }
  }

  /** "status"/"how long" -> reply position + wait for the patient's active tokens. */
  private async onStatusKeyword(phone: string): Promise<void> {
    const patient = await this.repo.getPatientByPhone(phone);
    const lang = (patient?.language ?? "en") as Language;
    if (!patient) {
      await this.channel.sendText(phone, t("queue_none", lang));
      return;
    }
    const active = await this.activeEntriesToday(patient.id);
    if (active.length === 0) {
      await this.channel.sendText(phone, t("queue_none", lang));
      return;
    }
    const lines: string[] = [];
    for (const e of active) {
      const status = await this.scheduling.statusOf(e.id);
      const doctor = await this.repo.getDoctor(e.doctorId);
      lines.push(
        t("queue_status", lang, {
          doctor: doctor?.name ?? "Doctor",
          min: String(status.estimateMinMinutes),
          max: String(status.estimateMaxMinutes),
          arrival: istTime.format(status.suggestedArrival),
        }),
      );
    }
    await this.channel.sendText(phone, lines.join("\n"));
  }

  // --- helpers -----------------------------------------------------------
  private async finish(record: ConversationRecord, message: string): Promise<void> {
    record.step = ConversationStep.DONE;
    const lang = record.context.language ?? "en";
    record.context = {};
    await this.store.save(record);
    await this.channel.sendText(record.phone, `${message}\n\n${t("menu_hint", lang)}`);
  }

  private async handleDomainError(
    record: ConversationRecord,
    err: unknown,
  ): Promise<void> {
    if (!(err instanceof DomainError)) throw err;
    const lang = record.context.language ?? "en";
    await this.channel.sendText(record.phone, t("err_generic", lang));
    return this.greet(record.phone);
  }

  private repromptList(record: ConversationRecord): Promise<void> {
    const lang = record.context.language ?? "en";
    return this.channel.sendText(record.phone, t("reprompt_menu", lang));
  }

  /** A patient's still-live queue entries for today, soonest token first. */
  private async activeEntriesToday(patientId: string) {
    const today = toQueueDate(this.clock.now()).getTime();
    return (await this.repo.listAppointmentsForPatient(patientId))
      .filter((e) => e.queueDate.getTime() === today && ACTIVE.has(e.status))
      .sort((a, b) => a.token - b.token);
  }

  private async syncPatientLanguage(
    patientId: string,
    current: string | undefined,
    lang: Language,
  ): Promise<void> {
    if ((current ?? "en") !== lang) {
      await this.repo.updatePatient(patientId, { language: lang });
    }
  }

  private async sendInteractive(
    to: string,
    body: string,
    labels: string[],
    listButtonLabel: string,
  ): Promise<void> {
    if (labels.length <= 3) {
      await this.channel.sendButtons(to, body, this.toButtons(labels));
    } else {
      await this.channel.sendList(to, body, listButtonLabel, this.toListItems(labels));
    }
  }

  private toButtons(labels: string[]): InteractiveButton[] {
    return labels.map((title, i) => ({ id: String(i + 1), title }));
  }

  private toListItems(labels: string[]): ListItem[] {
    return labels.map((title, i) => ({ id: String(i + 1), title }));
  }
}
