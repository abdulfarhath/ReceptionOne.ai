import { describe, it, expect } from "vitest";

import { summarizePatientHistory } from "./patient-history.js";
import { AppointmentStatus, type Appointment } from "./types.js";

const NOW = new Date("2026-06-23T00:00:00.000Z");

let seq = 0;
function appt(
  status: AppointmentStatus,
  startIso: string,
): Appointment {
  const start = new Date(startIso);
  return {
    id: `a${seq++}`,
    doctorId: "doc1",
    patientId: "pat1",
    start,
    end: new Date(start.getTime() + 30 * 60_000),
    status,
    createdAt: start,
    updatedAt: start,
  };
}

describe("summarizePatientHistory", () => {
  it("returns zeros for a patient with no appointments", () => {
    const s = summarizePatientHistory([], NOW);
    expect(s).toEqual({
      total: 0,
      upcoming: 0,
      completed: 0,
      cancelled: 0,
      firstVisitAt: null,
      lastVisitAt: null,
      nextAppointmentAt: null,
    });
  });

  it("counts by status and splits upcoming vs past", () => {
    const s = summarizePatientHistory(
      [
        appt(AppointmentStatus.COMPLETED, "2026-01-10T09:00:00.000Z"),
        appt(AppointmentStatus.COMPLETED, "2026-03-15T09:00:00.000Z"),
        appt(AppointmentStatus.CANCELLED, "2026-04-01T09:00:00.000Z"),
        appt(AppointmentStatus.BOOKED, "2026-07-01T09:00:00.000Z"),
        appt(AppointmentStatus.BOOKED, "2026-06-30T09:00:00.000Z"),
      ],
      NOW,
    );
    expect(s.total).toBe(5);
    expect(s.completed).toBe(2);
    expect(s.cancelled).toBe(1);
    expect(s.upcoming).toBe(2);
  });

  it("picks the soonest upcoming as next, ignoring order", () => {
    const s = summarizePatientHistory(
      [
        appt(AppointmentStatus.BOOKED, "2026-08-01T09:00:00.000Z"),
        appt(AppointmentStatus.BOOKED, "2026-06-30T09:00:00.000Z"),
      ],
      NOW,
    );
    expect(s.nextAppointmentAt?.toISOString()).toBe("2026-06-30T09:00:00.000Z");
  });

  it("derives first and last visit from non-cancelled past visits", () => {
    const s = summarizePatientHistory(
      [
        appt(AppointmentStatus.COMPLETED, "2026-01-10T09:00:00.000Z"),
        appt(AppointmentStatus.COMPLETED, "2026-03-15T09:00:00.000Z"),
        appt(AppointmentStatus.CANCELLED, "2025-12-01T09:00:00.000Z"), // earlier, but cancelled
        appt(AppointmentStatus.BOOKED, "2026-07-01T09:00:00.000Z"), // future, not a past visit
      ],
      NOW,
    );
    // firstVisit ignores the cancelled 2025-12 and uses the earliest non-cancelled.
    expect(s.firstVisitAt?.toISOString()).toBe("2026-01-10T09:00:00.000Z");
    // lastVisit is the most recent non-cancelled start in the past.
    expect(s.lastVisitAt?.toISOString()).toBe("2026-03-15T09:00:00.000Z");
  });

  it("has no last visit when every appointment is upcoming", () => {
    const s = summarizePatientHistory(
      [appt(AppointmentStatus.BOOKED, "2026-07-01T09:00:00.000Z")],
      NOW,
    );
    expect(s.lastVisitAt).toBeNull();
    expect(s.firstVisitAt?.toISOString()).toBe("2026-07-01T09:00:00.000Z");
  });
});
