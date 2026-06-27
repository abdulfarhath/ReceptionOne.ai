import { describe, it, expect } from "vitest";

import { summarizeDoctorDemand } from "./doctor-insights.js";
import { AppointmentStatus, type Appointment } from "./types.js";

let seq = 0;
function entry(status: AppointmentStatus, queueDateIso: string): Appointment {
  const queueDate = new Date(queueDateIso);
  return {
    id: `a${seq++}`,
    doctorId: "doc1",
    patientId: "pat1",
    queueDate,
    token: 1,
    isWalkIn: false,
    isPriority: false,
    onHold: false,
    targetTime: null,
    arrivedAt: null,
    startedAt: null,
    doneAt: null,
    status,
    lastNotifiedMaxMinutes: null,
    start: null,
    end: null,
    createdAt: queueDate,
    updatedAt: queueDate,
  };
}

// Bucket by the UTC calendar date (the route injects IST).
const dayKeyOf = (d: Date) => d.toISOString().slice(0, 10);
const JUNE = ["2026-06-01", "2026-06-02", "2026-06-03"];

describe("summarizeDoctorDemand", () => {
  it("zero-fills every day in the range", () => {
    const s = summarizeDoctorDemand([], JUNE, dayKeyOf);
    expect(s.perDay).toHaveLength(3);
    expect(s.totalJoined).toBe(0);
    expect(s.busiestDate).toBeNull();
    expect(s.averagePerDay).toBe(0);
  });

  it("counts tokens joined per day and breaks down by outcome", () => {
    const s = summarizeDoctorDemand(
      [
        entry(AppointmentStatus.DONE, "2026-06-01T00:00:00.000Z"),
        entry(AppointmentStatus.NO_SHOW, "2026-06-01T00:00:00.000Z"),
        entry(AppointmentStatus.CANCELLED, "2026-06-01T00:00:00.000Z"),
        entry(AppointmentStatus.DONE, "2026-06-02T00:00:00.000Z"),
      ],
      JUNE,
      dayKeyOf,
    );
    const [d1, d2, d3] = s.perDay;
    expect(d1).toMatchObject({ joined: 3, done: 1, noShow: 1, cancelled: 1 });
    expect(d2).toMatchObject({ joined: 1, done: 1 });
    expect(d3).toMatchObject({ joined: 0 });

    expect(s.totalJoined).toBe(4);
    expect(s.totalDone).toBe(2);
    expect(s.totalNoShow).toBe(1);
    expect(s.busiestDate).toBe("2026-06-01");
    expect(s.busiestCount).toBe(3);
  });

  it("ignores entries outside the requested range", () => {
    const s = summarizeDoctorDemand(
      [entry(AppointmentStatus.DONE, "2026-07-15T00:00:00.000Z")],
      JUNE,
      dayKeyOf,
    );
    expect(s.totalJoined).toBe(0);
  });
});
