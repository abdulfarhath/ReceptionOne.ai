import { describe, it, expect } from "vitest";

import {
  isEstimatedNoShow,
  openSlotCount,
  patientInsights,
  slotCapacity,
} from "./analytics.js";
import { AppointmentStatus, type Appointment } from "./types.js";

function appt(
  patientId: string,
  status: AppointmentStatus,
  startIso = "2026-06-01T09:00:00.000Z",
): Appointment {
  const start = new Date(startIso);
  return {
    id: `a${Math.random()}`,
    doctorId: "doc1",
    patientId,
    start,
    end: new Date(start.getTime() + 30 * 60_000),
    status,
    createdAt: start,
    updatedAt: start,
  };
}

describe("slotCapacity", () => {
  it("counts whole slots that fit each window", () => {
    // 09:00–11:00 (540–660) at 30min = 4 slots; 14:00–15:00 (840–900) = 2.
    expect(
      slotCapacity(
        [
          { startMinutes: 540, endMinutes: 660 },
          { startMinutes: 840, endMinutes: 900 },
        ],
        30,
      ),
    ).toBe(6);
  });

  it("is zero with no windows or non-positive duration", () => {
    expect(slotCapacity([], 30)).toBe(0);
    expect(slotCapacity([{ startMinutes: 0, endMinutes: 60 }], 0)).toBe(0);
  });
});

describe("openSlotCount", () => {
  const DAY = Date.UTC(2026, 5, 1); // 2026-06-01 UTC midnight
  const windows = [{ startMinutes: 540, endMinutes: 660 }]; // 4 slots at 30min

  it("excludes booked and past slots", () => {
    const booked = new Set<number>([DAY + 540 * 60_000]); // 09:00 taken
    const now = DAY + 600 * 60_000; // 10:00 — 09:00 & 09:30 are now past
    // slots at 540(past+booked), 570(past), 600(open), 630(open) -> 2 open
    expect(openSlotCount(windows, 30, DAY, booked, now)).toBe(2);
  });

  it("returns full capacity when nothing booked and day is in the future", () => {
    expect(openSlotCount(windows, 30, DAY, new Set(), DAY - 1)).toBe(4);
  });
});

describe("patientInsights", () => {
  it("splits new vs returning and computes retention", () => {
    const data = [
      // p1: returning + completed -> retained
      appt("p1", AppointmentStatus.COMPLETED),
      appt("p1", AppointmentStatus.BOOKED),
      // p2: one completed only -> new, visited but not retained
      appt("p2", AppointmentStatus.COMPLETED),
      // p3: two bookings, none completed -> returning, not in retention base
      appt("p3", AppointmentStatus.BOOKED),
      appt("p3", AppointmentStatus.CANCELLED),
    ];
    const r = patientInsights(data);
    expect(r.totalPatients).toBe(3);
    expect(r.returningPatients).toBe(2); // p1, p3
    expect(r.newPatients).toBe(1); // p2
    expect(r.returningPct).toBe(66.7);
    // retention base = patients with a completed visit = {p1, p2}; retained = {p1}
    expect(r.retentionPct).toBe(50);
  });

  it("is all zeros for an empty dataset", () => {
    expect(patientInsights([])).toMatchObject({
      totalPatients: 0,
      returningPct: 0,
      retentionPct: 0,
    });
  });
});

describe("isEstimatedNoShow", () => {
  it("flags past BOOKED appointments only", () => {
    const now = new Date("2026-06-10T00:00:00Z").getTime();
    expect(
      isEstimatedNoShow(appt("p", AppointmentStatus.BOOKED, "2026-06-01T09:00:00Z"), now),
    ).toBe(true);
    expect(
      isEstimatedNoShow(appt("p", AppointmentStatus.COMPLETED, "2026-06-01T09:00:00Z"), now),
    ).toBe(false);
    expect(
      isEstimatedNoShow(appt("p", AppointmentStatus.BOOKED, "2026-07-01T09:00:00Z"), now),
    ).toBe(false);
  });
});
