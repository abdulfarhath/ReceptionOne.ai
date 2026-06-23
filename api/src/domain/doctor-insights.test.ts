import { describe, it, expect } from "vitest";

import { summarizeDoctorDemand } from "./doctor-insights.js";
import { AppointmentStatus, type Appointment } from "./types.js";

let seq = 0;
function appt(status: AppointmentStatus, startIso: string): Appointment {
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

// Bucket by the UTC calendar date (good enough for a test; the route injects IST).
const dayKeyOf = (d: Date) => d.toISOString().slice(0, 10);
const JUNE = ["2026-06-01", "2026-06-02", "2026-06-03"];

describe("summarizeDoctorDemand", () => {
  it("zero-fills every day in the range", () => {
    const s = summarizeDoctorDemand([], JUNE, dayKeyOf);
    expect(s.perDay).toHaveLength(3);
    expect(s.perDay.every((d) => d.visits === 0)).toBe(true);
    expect(s.totalVisits).toBe(0);
    expect(s.busiestDate).toBeNull();
    expect(s.averagePerDay).toBe(0);
  });

  it("counts bookings per day and treats cancellations separately from visits", () => {
    const s = summarizeDoctorDemand(
      [
        appt(AppointmentStatus.BOOKED, "2026-06-01T09:00:00.000Z"),
        appt(AppointmentStatus.COMPLETED, "2026-06-01T09:30:00.000Z"),
        appt(AppointmentStatus.CANCELLED, "2026-06-01T10:00:00.000Z"),
        appt(AppointmentStatus.COMPLETED, "2026-06-02T09:00:00.000Z"),
      ],
      JUNE,
      dayKeyOf,
    );
    const [d1, d2, d3] = s.perDay;
    expect(d1).toMatchObject({ booked: 1, completed: 1, cancelled: 1, visits: 2 });
    expect(d2).toMatchObject({ completed: 1, visits: 1 });
    expect(d3).toMatchObject({ visits: 0 });

    expect(s.totalVisits).toBe(3);
    expect(s.totalCancelled).toBe(1);
    expect(s.busiestDate).toBe("2026-06-01");
    expect(s.busiestCount).toBe(2);
    expect(s.averagePerDay).toBe(1); // 3 visits / 3 days
  });

  it("ignores appointments outside the requested range", () => {
    const s = summarizeDoctorDemand(
      [appt(AppointmentStatus.BOOKED, "2026-07-15T09:00:00.000Z")],
      JUNE,
      dayKeyOf,
    );
    expect(s.totalVisits).toBe(0);
  });
});
