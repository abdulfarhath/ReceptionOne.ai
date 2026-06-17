// SchedulingService: the pure scheduling core. It depends ONLY on the Repository
// interface and an injectable Clock — no DB/HTTP/chat/AI. All times are UTC.

import type { Repository } from "../repository/repository.js";
import type { Appointment } from "./types.js";
import { AppointmentStatus, AppointmentEventType } from "./types.js";
import {
  NotFoundError,
  OutsideHoursError,
  PastTimeError,
  SlotUnavailableError,
} from "./errors.js";

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

/** Injectable wall clock so time-dependent logic stays testable. */
export interface Clock {
  now(): Date;
}

const systemClock: Clock = { now: () => new Date() };

function startOfUtcDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

export interface BookInput {
  doctorId: string;
  patientId: string;
  start: Date;
}

export interface RescheduleInput {
  appointmentId: string;
  newStart: Date;
}

export class SchedulingService {
  constructor(
    private readonly repo: Repository,
    private readonly clock: Clock = systemClock,
  ) {}

  /** Free slot start times (UTC) for a doctor on the UTC day containing `day`. */
  async getAvailableSlots(doctorId: string, day: Date): Promise<Date[]> {
    const doctor = await this.repo.getDoctor(doctorId);
    if (!doctor) throw new NotFoundError(`Doctor ${doctorId} not found`);

    const dayStart = startOfUtcDay(day);
    const dayOfWeek = dayStart.getUTCDay();
    const windows = (await this.repo.listAvailability(doctorId)).filter(
      (w) => w.dayOfWeek === dayOfWeek,
    );
    if (windows.length === 0) return [];

    const dayEnd = new Date(dayStart.getTime() + DAY_MS);
    const booked = await this.repo.listAppointments({
      doctorId,
      from: dayStart,
      to: dayEnd,
      statuses: [AppointmentStatus.BOOKED],
    });
    const takenStarts = new Set(booked.map((a) => a.start.getTime()));
    const nowMs = this.clock.now().getTime();

    const slots: Date[] = [];
    for (const w of windows) {
      for (
        let m = w.startMinutes;
        m + doctor.slotDurationMinutes <= w.endMinutes;
        m += doctor.slotDurationMinutes
      ) {
        const startMs = dayStart.getTime() + m * MINUTE_MS;
        if (startMs < nowMs) continue;
        if (takenStarts.has(startMs)) continue;
        slots.push(new Date(startMs));
      }
    }
    slots.sort((a, b) => a.getTime() - b.getTime());
    return slots;
  }

  async book(input: BookInput): Promise<Appointment> {
    const { doctorId, patientId, start } = input;

    const doctor = await this.repo.getDoctor(doctorId);
    if (!doctor) throw new NotFoundError(`Doctor ${doctorId} not found`);
    const patient = await this.repo.getPatient(patientId);
    if (!patient) throw new NotFoundError(`Patient ${patientId} not found`);

    this.assertNotPast(start);
    const end = new Date(start.getTime() + doctor.slotDurationMinutes * MINUTE_MS);
    await this.assertWithinHours(doctorId, start, end);

    return this.repo.transaction(async (tx) => {
      const clash = await tx.findBookedSlot(doctorId, start);
      if (clash) {
        throw new SlotUnavailableError(
          `Slot at ${start.toISOString()} is already booked`,
        );
      }
      const appointment = await tx.createAppointment({
        doctorId,
        patientId,
        start,
        end,
        status: AppointmentStatus.BOOKED,
      });
      await tx.appendEvent({
        appointmentId: appointment.id,
        type: AppointmentEventType.BOOKED,
        metadata: null,
      });
      return appointment;
    });
  }

  async reschedule(input: RescheduleInput): Promise<Appointment> {
    const { appointmentId, newStart } = input;

    const existing = await this.repo.getAppointment(appointmentId);
    if (!existing || existing.status !== AppointmentStatus.BOOKED) {
      throw new NotFoundError(`Active appointment ${appointmentId} not found`);
    }
    const doctor = await this.repo.getDoctor(existing.doctorId);
    if (!doctor) throw new NotFoundError(`Doctor ${existing.doctorId} not found`);

    this.assertNotPast(newStart);
    const end = new Date(
      newStart.getTime() + doctor.slotDurationMinutes * MINUTE_MS,
    );
    await this.assertWithinHours(existing.doctorId, newStart, end);

    return this.repo.transaction(async (tx) => {
      const clash = await tx.findBookedSlot(existing.doctorId, newStart);
      if (clash && clash.id !== appointmentId) {
        throw new SlotUnavailableError(
          `Slot at ${newStart.toISOString()} is already booked`,
        );
      }
      const updated = await tx.updateAppointment(appointmentId, {
        start: newStart,
        end,
      });
      await tx.appendEvent({
        appointmentId,
        type: AppointmentEventType.RESCHEDULED,
        metadata: { previousStart: existing.start.toISOString() },
      });
      return updated;
    });
  }

  async cancel(appointmentId: string): Promise<Appointment> {
    const existing = await this.repo.getAppointment(appointmentId);
    if (!existing || existing.status !== AppointmentStatus.BOOKED) {
      throw new NotFoundError(`Active appointment ${appointmentId} not found`);
    }
    return this.repo.transaction(async (tx) => {
      const updated = await tx.updateAppointment(appointmentId, {
        status: AppointmentStatus.CANCELLED,
      });
      await tx.appendEvent({
        appointmentId,
        type: AppointmentEventType.CANCELLED,
        metadata: null,
      });
      return updated;
    });
  }

  private assertNotPast(start: Date): void {
    if (start.getTime() < this.clock.now().getTime()) {
      throw new PastTimeError(`Start ${start.toISOString()} is in the past`);
    }
  }

  /** The whole slot [start, end] must fit inside one availability window. */
  private async assertWithinHours(
    doctorId: string,
    start: Date,
    end: Date,
  ): Promise<void> {
    const dayStartMs = startOfUtcDay(start).getTime();
    const dayOfWeek = startOfUtcDay(start).getUTCDay();
    const startMin = (start.getTime() - dayStartMs) / MINUTE_MS;
    const endMin = (end.getTime() - dayStartMs) / MINUTE_MS;

    const windows = (await this.repo.listAvailability(doctorId)).filter(
      (w) => w.dayOfWeek === dayOfWeek,
    );
    const fits = windows.some(
      (w) => startMin >= w.startMinutes && endMin <= w.endMinutes,
    );
    if (!fits) {
      throw new OutsideHoursError(
        `Slot ${start.toISOString()} is outside the doctor's hours`,
      );
    }
  }
}
