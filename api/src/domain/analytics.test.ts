import { describe, it, expect } from "vitest";

import { avgConsultMinutes, isNoShow, patientInsights } from "./analytics.js";
import { AppointmentStatus, type Appointment } from "./types.js";

let seq = 0;
function entry(
  patientId: string,
  status: AppointmentStatus,
  opts: { startedAt?: string; doneAt?: string } = {},
): Appointment {
  const queueDate = new Date("2026-06-24T00:00:00.000Z");
  return {
    id: `a${seq++}`,
    doctorId: "doc1",
    patientId,
    queueDate,
    token: 1,
    isWalkIn: false,
    isPriority: false,
    onHold: false,
    targetTime: null,
    arrivedAt: null,
    startedAt: opts.startedAt ? new Date(opts.startedAt) : null,
    doneAt: opts.doneAt ? new Date(opts.doneAt) : null,
    status,
    lastNotifiedMaxMinutes: null,
    start: null,
    end: null,
    createdAt: queueDate,
    updatedAt: queueDate,
  };
}

describe("avgConsultMinutes", () => {
  it("averages startedAt->doneAt over DONE entries", () => {
    const entries = [
      entry("p1", AppointmentStatus.DONE, {
        startedAt: "2026-06-24T04:00:00.000Z",
        doneAt: "2026-06-24T04:10:00.000Z", // 10 min
      }),
      entry("p2", AppointmentStatus.DONE, {
        startedAt: "2026-06-24T05:00:00.000Z",
        doneAt: "2026-06-24T05:20:00.000Z", // 20 min
      }),
      entry("p3", AppointmentStatus.NO_SHOW), // ignored
    ];
    expect(avgConsultMinutes(entries)).toBe(15);
  });

  it("is null when no completed consult has timestamps", () => {
    expect(avgConsultMinutes([entry("p1", AppointmentStatus.WAITING)])).toBeNull();
  });
});

describe("isNoShow", () => {
  it("uses the real NO_SHOW status", () => {
    expect(isNoShow(entry("p", AppointmentStatus.NO_SHOW))).toBe(true);
    expect(isNoShow(entry("p", AppointmentStatus.DONE))).toBe(false);
  });
});

describe("patientInsights", () => {
  it("splits new vs returning and computes retention (DONE-based)", () => {
    const data = [
      entry("p1", AppointmentStatus.DONE), // returning + visited -> retained
      entry("p1", AppointmentStatus.WAITING),
      entry("p2", AppointmentStatus.DONE), // one visit only -> new, visited not retained
      entry("p3", AppointmentStatus.WAITING), // returning, no visit
      entry("p3", AppointmentStatus.CANCELLED),
    ];
    const r = patientInsights(data);
    expect(r.totalPatients).toBe(3);
    expect(r.returningPatients).toBe(2); // p1, p3
    expect(r.newPatients).toBe(1); // p2
    expect(r.returningPct).toBe(66.7);
    expect(r.retentionPct).toBe(50); // visited {p1,p2}; retained {p1}
  });

  it("is all zeros for an empty dataset", () => {
    expect(patientInsights([])).toMatchObject({
      totalPatients: 0,
      returningPct: 0,
      retentionPct: 0,
    });
  });
});
