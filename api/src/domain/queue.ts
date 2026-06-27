// Pure queue logic for a live token queue (one per doctor per day). No DB, HTTP,
// chat, or AI imports. `activeOrder` is the single source of truth for ordering;
// everything else (position, wait, suggested arrival) is derived from it.

import { InvalidTransitionError } from "./errors.js";
import { AppointmentStatus, type Appointment } from "./types.js";

const MINUTE_MS = 60_000;

/** A scheduled token activates this many minutes before its target by default. */
export const DEFAULT_SCHEDULED_LEAD_MIN = 15;

/** Statuses that are no longer in the active queue. */
const INACTIVE: ReadonlySet<AppointmentStatus> = new Set([
  AppointmentStatus.DONE,
  AppointmentStatus.NO_SHOW,
  AppointmentStatus.CANCELLED,
]);

/** A "come at my own time" token carries a preferred targetTime. */
export function isScheduled(entry: Appointment): boolean {
  return entry.targetTime != null;
}

/**
 * The single ordering key (epoch ms): IN_PROGRESS is pinned to the front by
 * `activeOrder` separately; otherwise a scheduled token sits at its targetTime,
 * and an immediate token at when it became real — arrivedAt if checked in, else
 * its join time (createdAt). A scheduled patient who arrives early keeps
 * targetTime, so they never jump ahead of earlier waiters.
 */
export function effectiveTime(entry: Appointment): number {
  if (entry.targetTime != null) return entry.targetTime.getTime();
  return (entry.arrivedAt ?? entry.createdAt).getTime();
}

/**
 * A scheduled token is "upcoming" — not yet in the active line — while it is
 * still WAITING and now is earlier than `targetTime - leadMin`. After that it
 * activates automatically (joins activeOrder); checking in / no-show is unchanged.
 */
export function isUpcoming(
  entry: Appointment,
  now: Date,
  leadMin: number = DEFAULT_SCHEDULED_LEAD_MIN,
): boolean {
  if (entry.targetTime == null) return false;
  if (entry.status !== AppointmentStatus.WAITING) return false;
  return now.getTime() < entry.targetTime.getTime() - leadMin * MINUTE_MS;
}

export interface OrderOptions {
  /** Current time — required to exclude not-yet-active scheduled tokens. */
  now?: Date;
  /** Minutes before targetTime a scheduled token joins the line. */
  scheduledLeadMin?: number;
}

/**
 * The ordered active queue for a doctor+date. Excludes DONE/NO_SHOW/CANCELLED
 * and any scheduled token that is still upcoming (before its lead window — pass
 * `now` to enable that exclusion). Ordering is a single effective-time key:
 * IN_PROGRESS pinned to the front, then priority, then ascending effectiveTime,
 * then token. This one list drives position, wait estimates, and the board.
 */
export function activeOrder(
  entries: Appointment[],
  opts: OrderOptions = {},
): Appointment[] {
  const { now } = opts;
  const leadMin = opts.scheduledLeadMin ?? DEFAULT_SCHEDULED_LEAD_MIN;
  return entries
    .filter((e) => !INACTIVE.has(e.status))
    .filter((e) => !(now && isUpcoming(e, now, leadMin)))
    .sort((a, b) => {
      const ap = a.status === AppointmentStatus.IN_PROGRESS ? 0 : 1;
      const bp = b.status === AppointmentStatus.IN_PROGRESS ? 0 : 1;
      if (ap !== bp) return ap - bp; // IN_PROGRESS pinned to the front
      if (a.isPriority !== b.isPriority) return a.isPriority ? -1 : 1;
      const at = effectiveTime(a);
      const bt = effectiveTime(b);
      if (at !== bt) return at - bt;
      return a.token - b.token;
    });
}

/** Scheduled tokens that have NOT yet activated (still upcoming), target order. */
export function upcomingScheduled(
  entries: Appointment[],
  now: Date,
  leadMin: number = DEFAULT_SCHEDULED_LEAD_MIN,
): Appointment[] {
  return entries
    .filter((e) => isUpcoming(e, now, leadMin))
    .sort((a, b) => effectiveTime(a) - effectiveTime(b) || a.token - b.token);
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
