// SchedulingService: the queue orchestration core. It depends ONLY on the
// Repository interface and an injectable Clock — no DB/HTTP/chat/AI. The slot
// model is gone: this runs a live token queue, one per doctor per queueDate.
// All ordering/estimate maths lives in the pure ./queue module.

import type {
  Repository,
  UpdateAppointmentInput,
} from "../repository/repository.js";
import type { Appointment } from "./types.js";
import { AppointmentStatus, AppointmentEventType } from "./types.js";
import { NotFoundError } from "./errors.js";
import {
  activeOrder,
  assertTransition,
  estimateRange,
  estimateWaitMinutes,
  positionOf,
  suggestedArrival,
} from "./queue.js";

const MINUTE_MS = 60_000;

/** Injectable wall clock so time-dependent logic stays testable. */
export interface Clock {
  now(): Date;
}

const systemClock: Clock = { now: () => new Date() };

/** Normalise any instant to the UTC midnight that identifies its queue day. */
export function toQueueDate(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

/**
 * `peopleAhead`/`estimateWaitMinutes` are internal/staff-only point values; the
 * min/max range is what patients see (never a precise rank that can jump).
 */
export interface QuoteResult {
  peopleAhead: number;
  estimateWaitMinutes: number;
  estimateMinMinutes: number;
  estimateMaxMinutes: number;
  suggestedArrival: Date;
}

export interface JoinQueueInput {
  doctorId: string;
  date: Date;
  patientName: string;
  patientPhone: string;
  isPriority?: boolean;
  isWalkIn?: boolean;
  /** Why priority was granted — captured into the JOINED event metadata. */
  priorityReason?: string;
}

/** Patient-facing join result: an honest range + arrival, never token/position. */
export interface JoinResult {
  bookingId: string;
  estimateMinMinutes: number;
  estimateMaxMinutes: number;
  suggestedArrival: Date;
  /** Set when the doctor's daily priority soft-cap is exceeded (advisory only). */
  priorityWarning?: string;
}

export type ReinstateMode = "back" | "priority";

export interface SchedulingOptions {
  /** Soft cap on priority bookings per doctor per day (warning, not a block). */
  maxPriorityPerDay?: number;
}

/** A queue entry enriched for the board / a patient status query. */
export interface QueueEntryView {
  id: string;
  token: number;
  status: AppointmentStatus;
  isWalkIn: boolean;
  isPriority: boolean;
  onHold: boolean;
  patientName: string;
  patientPhone: string;
  position: number;
  estimateWaitMinutes: number;
  arrivedAt: Date | null;
  startedAt: Date | null;
  doneAt: Date | null;
}

export interface QueueBoard {
  traveling: QueueEntryView[]; // WAITING — not yet checked in
  waitingHere: QueueEntryView[]; // ARRIVED — checked in, waiting
  inProgress: QueueEntryView[];
  done: QueueEntryView[];
  noShow: QueueEntryView[];
}

/** Patient-facing status: range + arrival only (no token/position/rank). */
export interface StatusResult {
  bookingId: string;
  estimateMinMinutes: number;
  estimateMaxMinutes: number;
  suggestedArrival: Date;
}

export class SchedulingService {
  private readonly maxPriorityPerDay: number | undefined;

  constructor(
    private readonly repo: Repository,
    private readonly clock: Clock = systemClock,
    options: SchedulingOptions = {},
  ) {
    this.maxPriorityPerDay = options.maxPriorityPerDay;
  }

  /** Estimate for a NEW (non-priority) booking without creating it. */
  async quote(doctorId: string, date: Date): Promise<QuoteResult> {
    const doctor = await this.repo.getDoctor(doctorId);
    if (!doctor) throw new NotFoundError(`Doctor ${doctorId} not found`);

    const queueDate = toQueueDate(date);
    const order = activeOrder(
      await this.repo.listQueueEntries(doctorId, queueDate),
    );
    const peopleAhead = order.length; // a new joiner goes to the back
    const estimate = estimateWaitMinutes(peopleAhead, doctor.avgConsultMinutes);
    const range = estimateRange(peopleAhead, doctor.avgConsultMinutes);
    const suggested = suggestedArrival(
      this.clock.now(),
      await this.sessionStart(doctorId, queueDate),
      estimate,
    );
    return {
      peopleAhead,
      estimateWaitMinutes: estimate,
      estimateMinMinutes: range.minMinutes,
      estimateMaxMinutes: range.maxMinutes,
      suggestedArrival: suggested,
    };
  }

  /** Take the next token and join the queue. Walk-ins are ARRIVED immediately. */
  async joinQueue(input: JoinQueueInput): Promise<JoinResult> {
    const doctor = await this.repo.getDoctor(input.doctorId);
    if (!doctor) throw new NotFoundError(`Doctor ${input.doctorId} not found`);

    const queueDate = toQueueDate(input.date);
    const patient = await this.resolvePatient(
      input.patientPhone,
      input.patientName,
    );
    const isWalkIn = input.isWalkIn ?? false;
    const isPriority = input.isPriority ?? false;
    const now = this.clock.now();

    return this.repo.transaction(async (tx) => {
      const token = await tx.nextToken(input.doctorId, queueDate);
      const entry = await tx.createAppointment({
        doctorId: input.doctorId,
        patientId: patient.id,
        queueDate,
        token,
        isWalkIn,
        isPriority,
        status: isWalkIn ? AppointmentStatus.ARRIVED : AppointmentStatus.WAITING,
        arrivedAt: isWalkIn ? now : null,
      });
      // Capture the priority reason in the audit trail when priority is granted.
      await tx.appendEvent({
        appointmentId: entry.id,
        type: AppointmentEventType.JOINED,
        metadata: {
          token,
          isWalkIn,
          isPriority,
          ...(isPriority && input.priorityReason
            ? { priorityReason: input.priorityReason }
            : {}),
        },
      });

      const allEntries = await tx.listQueueEntries(input.doctorId, queueDate);
      const order = activeOrder(allEntries);
      const peopleAhead = Math.max(0, positionOf(entry, order) - 1);
      const estimate = estimateWaitMinutes(peopleAhead, doctor.avgConsultMinutes);
      const range = estimateRange(peopleAhead, doctor.avgConsultMinutes);
      const suggested = suggestedArrival(
        now,
        await this.sessionStart(input.doctorId, queueDate),
        estimate,
      );

      // Seed the slip baseline with what we're telling them now.
      await tx.updateAppointment(entry.id, {
        lastNotifiedMaxMinutes: range.maxMinutes,
      });

      // Soft priority cap: advise, never block.
      let priorityWarning: string | undefined;
      if (isPriority && this.maxPriorityPerDay !== undefined) {
        const priorityCount = allEntries.filter((e) => e.isPriority).length;
        if (priorityCount > this.maxPriorityPerDay) {
          priorityWarning = `Priority cap of ${this.maxPriorityPerDay} exceeded for this doctor today (${priorityCount} priority bookings).`;
        }
      }

      return {
        bookingId: entry.id,
        estimateMinMinutes: range.minMinutes,
        estimateMaxMinutes: range.maxMinutes,
        suggestedArrival: suggested,
        ...(priorityWarning ? { priorityWarning } : {}),
      };
    });
  }

  checkIn(id: string): Promise<Appointment> {
    return this.transition(id, AppointmentStatus.ARRIVED, AppointmentEventType.ARRIVED, {
      arrivedAt: this.clock.now(),
    });
  }

  startVisit(id: string): Promise<Appointment> {
    return this.transition(id, AppointmentStatus.IN_PROGRESS, AppointmentEventType.STARTED, {
      startedAt: this.clock.now(),
    });
  }

  complete(id: string): Promise<Appointment> {
    return this.transition(id, AppointmentStatus.DONE, AppointmentEventType.DONE, {
      doneAt: this.clock.now(),
    });
  }

  markNoShow(id: string): Promise<Appointment> {
    return this.transition(id, AppointmentStatus.NO_SHOW, AppointmentEventType.NO_SHOW, {});
  }

  cancel(id: string): Promise<Appointment> {
    return this.transition(id, AppointmentStatus.CANCELLED, AppointmentEventType.CANCELLED, {});
  }

  /** Flag a WAITING entry as absent-when-called; keeps its token and status. */
  async hold(id: string): Promise<Appointment> {
    const entry = await this.repo.getAppointment(id);
    if (!entry) throw new NotFoundError(`Queue entry ${id} not found`);
    if (entry.status !== AppointmentStatus.WAITING) {
      // Reuse the transition guard's error for an illegal hold.
      assertTransition(entry.status, AppointmentStatus.WAITING);
    }
    const updated = await this.repo.updateAppointment(id, { onHold: true });
    await this.repo.appendEvent({
      appointmentId: id,
      type: AppointmentEventType.HOLD,
      metadata: null,
    });
    return updated;
  }

  /** The grouped board for a doctor's queue on a date. */
  async getQueue(doctorId: string, date: Date): Promise<QueueBoard> {
    const queueDate = toQueueDate(date);
    const entries = await this.repo.listQueueEntries(doctorId, queueDate);
    const order = activeOrder(entries);
    const avg = (await this.repo.getDoctor(doctorId))?.avgConsultMinutes ?? 15;
    const patients = await this.patientMap(entries);

    const toView = (e: Appointment): QueueEntryView => {
      const position = positionOf(e, order);
      const estimate =
        position > 0 ? estimateWaitMinutes(position - 1, avg) : 0;
      const patient = patients.get(e.patientId);
      return {
        id: e.id,
        token: e.token,
        status: e.status,
        isWalkIn: e.isWalkIn,
        isPriority: e.isPriority,
        onHold: e.onHold,
        patientName: patient?.name ?? "Unknown",
        patientPhone: patient?.phone ?? "",
        position,
        estimateWaitMinutes: estimate,
        arrivedAt: e.arrivedAt,
        startedAt: e.startedAt,
        doneAt: e.doneAt,
      };
    };

    const byStatus = (s: AppointmentStatus) =>
      entries.filter((e) => e.status === s).map(toView);
    // traveling/waitingHere follow the active order; the rest follow token order.
    const orderedActive = order.map(toView);

    return {
      traveling: orderedActive.filter((v) => v.status === AppointmentStatus.WAITING),
      waitingHere: orderedActive.filter(
        (v) => v.status === AppointmentStatus.ARRIVED,
      ),
      inProgress: orderedActive.filter(
        (v) => v.status === AppointmentStatus.IN_PROGRESS,
      ),
      done: byStatus(AppointmentStatus.DONE),
      noShow: byStatus(AppointmentStatus.NO_SHOW),
    };
  }

  /** Patient-facing status: honest range + suggested arrival (no token/position). */
  async statusOf(bookingId: string): Promise<StatusResult> {
    const entry = await this.repo.getAppointment(bookingId);
    if (!entry) throw new NotFoundError(`Queue entry ${bookingId} not found`);
    const doctor = await this.repo.getDoctor(entry.doctorId);
    const avg = doctor?.avgConsultMinutes ?? 15;
    const order = activeOrder(
      await this.repo.listQueueEntries(entry.doctorId, entry.queueDate),
    );
    const position = positionOf(entry, order);
    const peopleAhead = position > 0 ? position - 1 : 0;
    const range = estimateRange(peopleAhead, avg);
    const suggested = suggestedArrival(
      this.clock.now(),
      await this.sessionStart(entry.doctorId, entry.queueDate),
      estimateWaitMinutes(peopleAhead, avg),
    );
    return {
      bookingId: entry.id,
      estimateMinMinutes: range.minMinutes,
      estimateMaxMinutes: range.maxMinutes,
      suggestedArrival: suggested,
    };
  }

  /**
   * Reinstate a (typically NO_SHOW) booking — they turned up late. Never silently
   * restores the old position: "back" gives a fresh token at the end of the line;
   * "priority" sets the priority flag. A non-empty `reason` is required and logged.
   */
  async reinstate(
    id: string,
    mode: ReinstateMode,
    reason: string,
  ): Promise<Appointment> {
    if (!reason || reason.trim().length === 0) {
      throw new Error("A reason is required to reinstate a booking.");
    }
    const entry = await this.repo.getAppointment(id);
    if (!entry) throw new NotFoundError(`Queue entry ${id} not found`);
    assertTransition(entry.status, AppointmentStatus.ARRIVED);

    const patch: UpdateAppointmentInput = {
      status: AppointmentStatus.ARRIVED,
      arrivedAt: this.clock.now(),
    };
    if (mode === "back") {
      patch.token = await this.repo.nextToken(entry.doctorId, entry.queueDate);
    } else {
      patch.isPriority = true;
    }
    const updated = await this.repo.updateAppointment(id, patch);
    await this.repo.appendEvent({
      appointmentId: id,
      type: AppointmentEventType.REINSTATED,
      metadata: { mode, reason },
    });
    return updated;
  }

  /**
   * Flip any still-WAITING booking to NO_SHOW once a doctor's session has ended
   * plus `graceMin`. Only WAITING entries are touched (people who never showed),
   * so it's idempotent and skips ARRIVED / DONE / CANCELLED. Returns the count.
   */
  async sweepNoShows(graceMin: number): Promise<{ swept: number }> {
    const now = this.clock.now();
    const queueDate = toQueueDate(now);
    const doctors = await this.repo.listDoctors();
    let swept = 0;
    for (const doctor of doctors) {
      const sessionEnd = await this.sessionEnd(doctor.id, queueDate);
      if (sessionEnd === null) continue; // no session today
      if (now.getTime() < sessionEnd.getTime() + graceMin * MINUTE_MS) continue;

      const entries = await this.repo.listQueueEntries(doctor.id, queueDate);
      for (const entry of entries) {
        if (entry.status === AppointmentStatus.WAITING) {
          await this.markNoShow(entry.id);
          swept++;
        }
      }
    }
    return { swept };
  }

  // --- helpers -----------------------------------------------------------
  private async transition(
    id: string,
    to: AppointmentStatus,
    eventType: AppointmentEventType,
    timestamps: { arrivedAt?: Date; startedAt?: Date; doneAt?: Date },
  ): Promise<Appointment> {
    const entry = await this.repo.getAppointment(id);
    if (!entry) throw new NotFoundError(`Queue entry ${id} not found`);
    assertTransition(entry.status, to);
    const updated = await this.repo.updateAppointment(id, {
      status: to,
      ...timestamps,
    });
    await this.repo.appendEvent({
      appointmentId: id,
      type: eventType,
      metadata: null,
    });
    return updated;
  }

  private async resolvePatient(phone: string, name: string) {
    const existing = await this.repo.getPatientByPhone(phone);
    if (existing) return existing;
    // Joining the queue is consent to be messaged about it.
    return this.repo.createPatient({
      phone,
      name,
      consentAt: this.clock.now(),
    });
  }

  /** Session open time on `queueDate` (earliest availability window), for estimates. */
  private async sessionStart(doctorId: string, queueDate: Date): Promise<Date> {
    const dayOfWeek = queueDate.getUTCDay();
    const windows = (await this.repo.listAvailability(doctorId)).filter(
      (w) => w.dayOfWeek === dayOfWeek,
    );
    if (windows.length === 0) return queueDate;
    const startMin = Math.min(...windows.map((w) => w.startMinutes));
    return new Date(queueDate.getTime() + startMin * MINUTE_MS);
  }

  /** Session close time on `queueDate` (latest window end); null if no session. */
  private async sessionEnd(
    doctorId: string,
    queueDate: Date,
  ): Promise<Date | null> {
    const dayOfWeek = queueDate.getUTCDay();
    const windows = (await this.repo.listAvailability(doctorId)).filter(
      (w) => w.dayOfWeek === dayOfWeek,
    );
    if (windows.length === 0) return null;
    const endMin = Math.max(...windows.map((w) => w.endMinutes));
    return new Date(queueDate.getTime() + endMin * MINUTE_MS);
  }

  private async patientMap(entries: Appointment[]) {
    const map = new Map<string, { name: string; phone: string }>();
    const ids = [...new Set(entries.map((e) => e.patientId))];
    for (const id of ids) {
      const p = await this.repo.getPatient(id);
      if (p) map.set(id, { name: p.name, phone: p.phone });
    }
    return map;
  }
}
