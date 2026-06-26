// Pure queue logic for a live token queue (one per doctor per day). No DB, HTTP,
// chat, or AI imports. `activeOrder` is the single source of truth for ordering;
// everything else (position, wait, suggested arrival) is derived from it.

import { InvalidTransitionError } from "./errors.js";
import { AppointmentStatus, type Appointment } from "./types.js";

const MINUTE_MS = 60_000;

/** Statuses that are no longer in the active queue. */
const INACTIVE: ReadonlySet<AppointmentStatus> = new Set([
  AppointmentStatus.DONE,
  AppointmentStatus.NO_SHOW,
  AppointmentStatus.CANCELLED,
]);

/**
 * Present-first tier rank: someone being seen, then people physically here, then
 * people still travelling. The doctor is always served the next ARRIVED — a
 * WAITING (still on the way) is never served before someone present.
 */
const TIER: Record<AppointmentStatus, number> = {
  [AppointmentStatus.IN_PROGRESS]: 0,
  [AppointmentStatus.ARRIVED]: 1,
  [AppointmentStatus.WAITING]: 2,
  [AppointmentStatus.DONE]: 3,
  [AppointmentStatus.NO_SHOW]: 3,
  [AppointmentStatus.CANCELLED]: 3,
};

/**
 * The ordered active queue for a doctor+date. Excludes DONE/NO_SHOW/CANCELLED.
 * Ordered by **tier (present-first)**, then priority, then ascending token —
 * IN_PROGRESS(0) < ARRIVED(1) < WAITING(2); within a tier, priority first then
 * token. This one list drives position, wait estimates, and the board.
 */
export function activeOrder(entries: Appointment[]): Appointment[] {
  return entries
    .filter((e) => !INACTIVE.has(e.status))
    .sort((a, b) => {
      if (TIER[a.status] !== TIER[b.status]) return TIER[a.status] - TIER[b.status];
      if (a.isPriority !== b.isPriority) return a.isPriority ? -1 : 1;
      return a.token - b.token;
    });
}

/** 1-based position of `entry` in `order` (people before = position - 1). 0 if absent. */
export function positionOf(entry: Appointment, order: Appointment[]): number {
  const idx = order.findIndex((e) => e.id === entry.id);
  return idx === -1 ? 0 : idx + 1;
}

/** Estimated wait = people ahead × average consult length. */
export function estimateWaitMinutes(
  peopleAhead: number,
  avgConsultMinutes: number,
): number {
  return Math.max(0, peopleAhead) * avgConsultMinutes;
}

export interface EstimateRange {
  minMinutes: number;
  maxMinutes: number;
}

/**
 * An honest wait **range** for patient-facing replies — never a precise rank that
 * can jump around. base = peopleAhead × avg; min = max(0, base − buffer);
 * max = base + buffer.
 */
export function estimateRange(
  peopleAhead: number,
  avgConsultMinutes: number,
  bufferMin = 10,
): EstimateRange {
  const base = Math.max(0, peopleAhead) * avgConsultMinutes;
  return {
    minMinutes: Math.max(0, base - bufferMin),
    maxMinutes: base + bufferMin,
  };
}

/**
 * When the patient should aim to arrive: the later of now / session start, plus
 * the estimated wait, minus a buffer so they arrive a little early.
 */
export function suggestedArrival(
  now: Date,
  sessionStart: Date,
  estimateWaitMin: number,
  bufferMin = 15,
): Date {
  const base = Math.max(now.getTime(), sessionStart.getTime());
  return new Date(base + (estimateWaitMin - bufferMin) * MINUTE_MS);
}

/** Legal status transitions for a queue entry. */
const TRANSITIONS: Record<AppointmentStatus, ReadonlySet<AppointmentStatus>> = {
  [AppointmentStatus.WAITING]: new Set([
    AppointmentStatus.ARRIVED,
    AppointmentStatus.CANCELLED,
    AppointmentStatus.NO_SHOW,
  ]),
  [AppointmentStatus.ARRIVED]: new Set([
    AppointmentStatus.IN_PROGRESS,
    AppointmentStatus.NO_SHOW,
    AppointmentStatus.CANCELLED,
  ]),
  [AppointmentStatus.IN_PROGRESS]: new Set([AppointmentStatus.DONE]),
  [AppointmentStatus.DONE]: new Set(),
  // A late no-show can be reinstated back into the queue.
  [AppointmentStatus.NO_SHOW]: new Set([AppointmentStatus.ARRIVED]),
  [AppointmentStatus.CANCELLED]: new Set(),
};

/** Throw INVALID_TRANSITION unless `from -> to` is a legal move. */
export function assertTransition(
  from: AppointmentStatus,
  to: AppointmentStatus,
): void {
  if (!TRANSITIONS[from].has(to)) {
    throw new InvalidTransitionError(
      `Cannot move a queue entry from ${from} to ${to}`,
    );
  }
}
