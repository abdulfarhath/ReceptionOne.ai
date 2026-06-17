import { describe, it, expect, beforeEach } from "vitest";

import { InMemoryRepository } from "../repository/in-memory.js";
import { SchedulingService, type Clock } from "./scheduling.js";
import {
  NotFoundError,
  OutsideHoursError,
  PastTimeError,
  SlotUnavailableError,
} from "./errors.js";
import { AppointmentStatus } from "./types.js";

// All times UTC. 2026-01-05 is a Monday (getUTCDay() === 1).
const MONDAY = "2026-01-05";
const FIXED_NOW = new Date("2026-01-05T00:00:00.000Z");
const fixedClock: Clock = { now: () => FIXED_NOW };

const DOCTOR_ID = "doc1";
const PATIENT_ID = "pat1";

function buildRepo(): InMemoryRepository {
  const repo = new InMemoryRepository();
  repo.addDoctor({
    id: DOCTOR_ID,
    name: "Dr. Test",
    department: "General",
    slotDurationMinutes: 30,
  });
  repo.addPatient({
    id: PATIENT_ID,
    phone: "+919999999999",
    name: "Test Patient",
    consentAt: FIXED_NOW,
  });
  // Monday 09:00–11:00 UTC -> 540..660 minutes-from-midnight.
  repo.addAvailability({
    id: "av1",
    doctorId: DOCTOR_ID,
    dayOfWeek: 1,
    startMinutes: 540,
    endMinutes: 660,
  });
  return repo;
}

function at(time: string): Date {
  return new Date(`${MONDAY}T${time}:00.000Z`);
}

describe("SchedulingService", () => {
  let repo: InMemoryRepository;
  let service: SchedulingService;

  beforeEach(() => {
    repo = buildRepo();
    service = new SchedulingService(repo, fixedClock);
  });

  it("lists the free 30-minute slots within the availability window", async () => {
    const slots = await service.getAvailableSlots(DOCTOR_ID, at("00:00"));
    expect(slots.map((s) => s.toISOString())).toEqual([
      at("09:00").toISOString(),
      at("09:30").toISOString(),
      at("10:00").toISOString(),
      at("10:30").toISOString(),
    ]);
  });

  it("books an available slot", async () => {
    const appt = await service.book({
      doctorId: DOCTOR_ID,
      patientId: PATIENT_ID,
      start: at("09:00"),
    });
    expect(appt.status).toBe(AppointmentStatus.BOOKED);
    expect(appt.start.toISOString()).toBe(at("09:00").toISOString());
    expect(appt.end.toISOString()).toBe(at("09:30").toISOString());

    // The booked slot disappears from availability.
    const slots = await service.getAvailableSlots(DOCTOR_ID, at("00:00"));
    expect(slots.map((s) => s.toISOString())).not.toContain(
      at("09:00").toISOString(),
    );
  });

  it("rejects double-booking the same slot", async () => {
    await service.book({
      doctorId: DOCTOR_ID,
      patientId: PATIENT_ID,
      start: at("09:00"),
    });
    await expect(
      service.book({
        doctorId: DOCTOR_ID,
        patientId: PATIENT_ID,
        start: at("09:00"),
      }),
    ).rejects.toBeInstanceOf(SlotUnavailableError);
  });

  it("rejects a slot outside the doctor's hours", async () => {
    // 12:00 is in the future (now is 00:00) but past the 11:00 window end.
    await expect(
      service.book({
        doctorId: DOCTOR_ID,
        patientId: PATIENT_ID,
        start: at("12:00"),
      }),
    ).rejects.toBeInstanceOf(OutsideHoursError);
  });

  it("rejects a slot in the past", async () => {
    // 2025-12-29 is also a Monday and inside the window, but before `now`.
    await expect(
      service.book({
        doctorId: DOCTOR_ID,
        patientId: PATIENT_ID,
        start: new Date("2025-12-29T09:00:00.000Z"),
      }),
    ).rejects.toBeInstanceOf(PastTimeError);
  });

  it("reschedules a booked appointment to a new free slot", async () => {
    const appt = await service.book({
      doctorId: DOCTOR_ID,
      patientId: PATIENT_ID,
      start: at("09:00"),
    });
    const moved = await service.reschedule({
      appointmentId: appt.id,
      newStart: at("10:00"),
    });
    expect(moved.id).toBe(appt.id);
    expect(moved.status).toBe(AppointmentStatus.BOOKED);
    expect(moved.start.toISOString()).toBe(at("10:00").toISOString());
    expect(moved.end.toISOString()).toBe(at("10:30").toISOString());

    const slots = await service.getAvailableSlots(DOCTOR_ID, at("00:00"));
    const iso = slots.map((s) => s.toISOString());
    expect(iso).toContain(at("09:00").toISOString()); // old slot freed
    expect(iso).not.toContain(at("10:00").toISOString()); // new slot taken
  });

  it("frees the slot when an appointment is cancelled", async () => {
    const appt = await service.book({
      doctorId: DOCTOR_ID,
      patientId: PATIENT_ID,
      start: at("09:00"),
    });
    const cancelled = await service.cancel(appt.id);
    expect(cancelled.status).toBe(AppointmentStatus.CANCELLED);

    const slots = await service.getAvailableSlots(DOCTOR_ID, at("00:00"));
    expect(slots.map((s) => s.toISOString())).toContain(
      at("09:00").toISOString(),
    );

    // The freed slot can be re-booked.
    const rebooked = await service.book({
      doctorId: DOCTOR_ID,
      patientId: PATIENT_ID,
      start: at("09:00"),
    });
    expect(rebooked.status).toBe(AppointmentStatus.BOOKED);
  });

  it("writes an append-only audit event for each state change", async () => {
    const appt = await service.book({
      doctorId: DOCTOR_ID,
      patientId: PATIENT_ID,
      start: at("09:00"),
    });
    await service.reschedule({ appointmentId: appt.id, newStart: at("10:00") });
    await service.cancel(appt.id);

    const events = await repo.listEvents(appt.id);
    expect(events.map((e) => e.type)).toEqual([
      "BOOKED",
      "RESCHEDULED",
      "CANCELLED",
    ]);
    // Reschedule records the previous start in its metadata.
    expect(events[1]?.metadata).toMatchObject({
      previousStart: at("09:00").toISOString(),
    });
  });

  it("throws NotFound when booking for an unknown doctor", async () => {
    await expect(
      service.book({
        doctorId: "nope",
        patientId: PATIENT_ID,
        start: at("09:00"),
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
