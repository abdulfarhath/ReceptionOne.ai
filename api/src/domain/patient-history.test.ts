import { describe, it, expect } from "vitest";

import { summarizePatientHistory } from "./patient-history.js";
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

describe("summarizePatientHistory", () => {
  it("returns zeros for a patient with no entries", () => {
    expect(summarizePatientHistory([])).toEqual({
      total: 0,
      active: 0,
      completed: 0,
      cancelled: 0,
      noShow: 0,
      firstVisitAt: null,
      lastVisitAt: null,
    });
  });

  it("counts by status", () => {
    const s = summarizePatientHistory([
      entry(AppointmentStatus.DONE, "2026-01-10T00:00:00.000Z"),
      entry(AppointmentStatus.DONE, "2026-03-15T00:00:00.000Z"),
      entry(AppointmentStatus.CANCELLED, "2026-04-01T00:00:00.000Z"),
      entry(AppointmentStatus.NO_SHOW, "2026-04-02T00:00:00.000Z"),
      entry(AppointmentStatus.WAITING, "2026-07-01T00:00:00.000Z"),
    ]);
    expect(s).toMatchObject({
      total: 5,
      completed: 2,
      cancelled: 1,
      noShow: 1,
      active: 1,
    });
  });

  it("derives first/last visit, ignoring cancelled for first and using DONE for last", () => {
    const s = summarizePatientHistory([
      entry(AppointmentStatus.DONE, "2026-01-10T00:00:00.000Z"),
      entry(AppointmentStatus.DONE, "2026-03-15T00:00:00.000Z"),
      entry(AppointmentStatus.CANCELLED, "2025-12-01T00:00:00.000Z"), // earlier, cancelled
      entry(AppointmentStatus.WAITING, "2026-08-01T00:00:00.000Z"), // active, not a completed visit
    ]);
    expect(s.firstVisitAt?.toISOString()).toBe("2026-01-10T00:00:00.000Z");
    expect(s.lastVisitAt?.toISOString()).toBe("2026-03-15T00:00:00.000Z");
  });

  it("has no last visit when nothing is DONE", () => {
    const s = summarizePatientHistory([
      entry(AppointmentStatus.WAITING, "2026-07-01T00:00:00.000Z"),
    ]);
    expect(s.lastVisitAt).toBeNull();
    expect(s.firstVisitAt?.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });
});
