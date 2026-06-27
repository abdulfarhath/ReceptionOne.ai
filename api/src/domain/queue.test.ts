import { describe, it, expect } from "vitest";

import { DomainError } from "./errors.js";
import {
  activeOrder,
  assertTransition,
  effectiveTime,
  estimateRange,
  estimateWaitMinutes,
  isUpcoming,
  positionOf,
  suggestedArrival,
  upcomingScheduled,
} from "./queue.js";
import { AppointmentStatus, type Appointment } from "./types.js";

const DATE = new Date("2026-06-24T00:00:00.000Z");
/** A UTC instant `min` minutes after the queue-day midnight. */
const T = (min: number): Date => new Date(DATE.getTime() + min * 60_000);

function entry(
  token: number,
  status: AppointmentStatus,
  opts: {
    priority?: boolean;
    targetTime?: Date | null;
    arrivedAt?: Date | null;
    createdAt?: Date;
  } = {},
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
    targetTime: opts.targetTime ?? null,
    arrivedAt: opts.arrivedAt ?? null,
    startedAt: null,
    doneAt: null,
    status,
    lastNotifiedMaxMinutes: null,
    start: null,
    end: null,
    createdAt: opts.createdAt ?? DATE,
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

  it("orders by effective time: earlier-arrived before later-arrived", () => {
    const order = activeOrder([
      entry(1, AppointmentStatus.ARRIVED, { arrivedAt: T(50) }),
      entry(2, AppointmentStatus.ARRIVED, { arrivedAt: T(10) }),
    ]);
    expect(order.map((e) => e.token)).toEqual([2, 1]);
  });
});

describe("effectiveTime + scheduled ordering", () => {
  it("effectiveTime is targetTime (scheduled), else arrivedAt, else createdAt", () => {
    expect(
      effectiveTime(entry(1, AppointmentStatus.WAITING, { targetTime: T(30) })),
    ).toBe(T(30).getTime());
    expect(
      effectiveTime(entry(2, AppointmentStatus.ARRIVED, { arrivedAt: T(10) })),
    ).toBe(T(10).getTime());
    expect(
      effectiveTime(entry(3, AppointmentStatus.WAITING, { createdAt: T(5) })),
    ).toBe(T(5).getTime());
  });

  it("a scheduled token sits at its target: ahead of later walk-ups, behind earlier waiters", () => {
    const order = activeOrder(
      [
        entry(1, AppointmentStatus.ARRIVED, { arrivedAt: T(10) }), // earlier waiter
        entry(2, AppointmentStatus.WAITING, { targetTime: T(30) }), // scheduled
        entry(3, AppointmentStatus.ARRIVED, { arrivedAt: T(50) }), // later walk-up
      ],
      { now: T(40), scheduledLeadMin: 15 },
    );
    expect(order.map((e) => e.token)).toEqual([1, 2, 3]);
  });

  it("an early-arriving scheduled token keeps its target time (no jumping ahead)", () => {
    const order = activeOrder(
      [
        entry(1, AppointmentStatus.ARRIVED, { arrivedAt: T(10) }), // earlier waiter
        // scheduled for T(30) but already checked in at T(5):
        entry(2, AppointmentStatus.ARRIVED, { targetTime: T(30), arrivedAt: T(5) }),
      ],
      { now: T(40), scheduledLeadMin: 15 },
    );
    expect(order.map((e) => e.token)).toEqual([1, 2]);
  });

  it("excludes a scheduled token before its lead window, includes it after", () => {
    const entries = [entry(1, AppointmentStatus.WAITING, { targetTime: T(60) })];
    // target - lead = 45; before that it is upcoming, not in the active line.
    expect(
      activeOrder(entries, { now: T(40), scheduledLeadMin: 15 }).map((e) => e.token),
    ).toEqual([]);
    expect(isUpcoming(entries[0]!, T(40), 15)).toBe(true);
    expect(upcomingScheduled(entries, T(40), 15).map((e) => e.token)).toEqual([1]);
    // at/after the lead window it activates.
    expect(
      activeOrder(entries, { now: T(45), scheduledLeadMin: 15 }).map((e) => e.token),
    ).toEqual([1]);
    expect(isUpcoming(entries[0]!, T(45), 15)).toBe(false);
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
