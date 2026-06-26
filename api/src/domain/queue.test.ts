import { describe, it, expect } from "vitest";

import { DomainError } from "./errors.js";
import {
  activeOrder,
  assertTransition,
  estimateRange,
  estimateWaitMinutes,
  positionOf,
  suggestedArrival,
} from "./queue.js";
import { AppointmentStatus, type Appointment } from "./types.js";

const DATE = new Date("2026-06-24T00:00:00.000Z");

function entry(
  token: number,
  status: AppointmentStatus,
  opts: { priority?: boolean } = {},
): Appointment {
  return {
    id: `a${token}`,
    doctorId: "d1",
    patientId: `p${token}`,
    queueDate: DATE,
    token,
    isWalkIn: false,
    isPriority: opts.priority ?? false,
    onHold: false,
    arrivedAt: null,
    startedAt: null,
    doneAt: null,
    status,
    lastNotifiedMaxMinutes: null,
    start: null,
    end: null,
    createdAt: DATE,
    updatedAt: DATE,
  };
}

describe("activeOrder", () => {
  it("excludes DONE/NO_SHOW/CANCELLED, pins IN_PROGRESS, then priority, then token", () => {
    const order = activeOrder([
      entry(1, AppointmentStatus.WAITING),
      entry(2, AppointmentStatus.WAITING, { priority: true }),
      entry(3, AppointmentStatus.DONE),
      entry(4, AppointmentStatus.IN_PROGRESS),
      entry(5, AppointmentStatus.CANCELLED),
      entry(6, AppointmentStatus.NO_SHOW),
    ]);
    expect(order.map((e) => e.token)).toEqual([4, 2, 1]);
  });

  it("orders multiple in-progress entries by token, ahead of everyone", () => {
    const order = activeOrder([
      entry(3, AppointmentStatus.WAITING, { priority: true }),
      entry(2, AppointmentStatus.IN_PROGRESS),
      entry(1, AppointmentStatus.IN_PROGRESS),
    ]);
    expect(order.map((e) => e.token)).toEqual([1, 2, 3]);
  });

  it("is present-first: ARRIVED beats WAITING, even priority WAITING", () => {
    const order = activeOrder([
      entry(1, AppointmentStatus.WAITING, { priority: true }), // travelling VIP
      entry(2, AppointmentStatus.ARRIVED), // physically here
      entry(3, AppointmentStatus.ARRIVED, { priority: true }), // here + VIP
      entry(4, AppointmentStatus.WAITING),
      entry(5, AppointmentStatus.IN_PROGRESS),
    ]);
    // IN_PROGRESS, then ARRIVED (priority 3 before 2), then WAITING (priority 1 before 4).
    expect(order.map((e) => e.token)).toEqual([5, 3, 2, 1, 4]);
  });
});

describe("estimateRange", () => {
  it("is base ± buffer, clamped at 0", () => {
    expect(estimateRange(0, 15)).toEqual({ minMinutes: 0, maxMinutes: 10 });
    expect(estimateRange(3, 15)).toEqual({ minMinutes: 35, maxMinutes: 55 }); // 45±10
    expect(estimateRange(1, 5)).toEqual({ minMinutes: 0, maxMinutes: 15 }); // base 5, min clamped
    expect(estimateRange(2, 10, 5)).toEqual({ minMinutes: 15, maxMinutes: 25 });
  });
});

describe("positionOf", () => {
  it("is the 1-based index in the active order", () => {
    const order = activeOrder([
      entry(1, AppointmentStatus.WAITING),
      entry(2, AppointmentStatus.WAITING),
      entry(3, AppointmentStatus.WAITING),
    ]);
    expect(positionOf(order[2]!, order)).toBe(3); // token 3 is third
    expect(positionOf(order[0]!, order)).toBe(1);
  });
});

describe("estimateWaitMinutes", () => {
  it("is peopleAhead * avgConsultMinutes", () => {
    expect(estimateWaitMinutes(0, 15)).toBe(0);
    expect(estimateWaitMinutes(3, 15)).toBe(45);
    expect(estimateWaitMinutes(-1, 15)).toBe(0); // never negative
  });
});

describe("suggestedArrival", () => {
  const sessionStart = new Date("2026-06-24T03:30:00.000Z"); // 09:00 IST

  it("is max(now, sessionStart) + wait - buffer", () => {
    const now = new Date("2026-06-24T04:30:00.000Z"); // after session start
    // base = now (04:30) + 30 - 15 = +15 min => 04:45
    expect(suggestedArrival(now, sessionStart, 30).toISOString()).toBe(
      "2026-06-24T04:45:00.000Z",
    );
  });

  it("uses sessionStart when now is before it", () => {
    const now = new Date("2026-06-24T02:00:00.000Z"); // before session
    // base = sessionStart (03:30) + 0 - 15 = 03:15
    expect(suggestedArrival(now, sessionStart, 0).toISOString()).toBe(
      "2026-06-24T03:15:00.000Z",
    );
  });
});

describe("assertTransition", () => {
  const S = AppointmentStatus;
  it("allows the legal moves", () => {
    expect(() => assertTransition(S.WAITING, S.ARRIVED)).not.toThrow();
    expect(() => assertTransition(S.WAITING, S.CANCELLED)).not.toThrow();
    expect(() => assertTransition(S.WAITING, S.NO_SHOW)).not.toThrow();
    expect(() => assertTransition(S.ARRIVED, S.IN_PROGRESS)).not.toThrow();
    expect(() => assertTransition(S.ARRIVED, S.NO_SHOW)).not.toThrow();
    expect(() => assertTransition(S.ARRIVED, S.CANCELLED)).not.toThrow();
    expect(() => assertTransition(S.IN_PROGRESS, S.DONE)).not.toThrow();
    // A late no-show can be reinstated.
    expect(() => assertTransition(S.NO_SHOW, S.ARRIVED)).not.toThrow();
  });

  it("rejects the illegal moves with a DomainError(INVALID_TRANSITION)", () => {
    const illegal: [AppointmentStatus, AppointmentStatus][] = [
      [S.WAITING, S.IN_PROGRESS],
      [S.WAITING, S.DONE],
      [S.ARRIVED, S.DONE],
      [S.IN_PROGRESS, S.CANCELLED],
      [S.IN_PROGRESS, S.NO_SHOW],
      [S.DONE, S.IN_PROGRESS],
      [S.NO_SHOW, S.DONE],
      [S.CANCELLED, S.WAITING],
    ];
    for (const [from, to] of illegal) {
      let thrown: unknown;
      try {
        assertTransition(from, to);
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toBeInstanceOf(DomainError);
      expect((thrown as DomainError).code).toBe("INVALID_TRANSITION");
    }
  });
});
