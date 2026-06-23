// Pure domain logic: turn a doctor's appointments into per-day demand buckets and
// totals. No DB/HTTP/timezone here — the caller passes the ordered day keys that
// define the range and a `dayKeyOf` mapper (e.g. an IST date formatter) so the
// clinic-timezone rule lives at the HTTP boundary, not in the core.

import { AppointmentStatus, type Appointment } from "./types.js";

export interface DoctorDayDemand {
  /** Clinic-day key, e.g. "2026-06-23". */
  date: string;
  /** Appointments still BOOKED on this day. */
  booked: number;
  /** Appointments marked COMPLETED on this day. */
  completed: number;
  /** Appointments that were CANCELLED. */
  cancelled: number;
  /** Real demand = booked + completed (excludes cancellations). */
  visits: number;
}

export interface DoctorDemandSummary {
  totalBooked: number;
  totalCompleted: number;
  totalCancelled: number;
  /** booked + completed across the whole range. */
  totalVisits: number;
  /** The busiest clinic-day by visits, or null if there were none. */
  busiestDate: string | null;
  busiestCount: number;
  /** totalVisits divided by the number of days in the range, to 1 decimal. */
  averagePerDay: number;
  /** One bucket per day in `dayKeys`, in the same order (zero-filled). */
  perDay: DoctorDayDemand[];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Aggregate `appointments` into per-day demand. `dayKeys` is the ordered set of
 * clinic-day keys covering the range (so days with zero bookings still appear);
 * `dayKeyOf` maps an appointment's start instant to its clinic-day key.
 * Appointments whose key isn't in `dayKeys` are ignored (outside the range).
 */
export function summarizeDoctorDemand(
  appointments: Appointment[],
  dayKeys: string[],
  dayKeyOf: (start: Date) => string,
): DoctorDemandSummary {
  const buckets = new Map<string, DoctorDayDemand>();
  for (const date of dayKeys) {
    buckets.set(date, { date, booked: 0, completed: 0, cancelled: 0, visits: 0 });
  }

  for (const appt of appointments) {
    const bucket = buckets.get(dayKeyOf(appt.start));
    if (!bucket) continue; // outside the requested range
    if (appt.status === AppointmentStatus.BOOKED) {
      bucket.booked++;
      bucket.visits++;
    } else if (appt.status === AppointmentStatus.COMPLETED) {
      bucket.completed++;
      bucket.visits++;
    } else if (appt.status === AppointmentStatus.CANCELLED) {
      bucket.cancelled++;
    }
  }

  const perDay = dayKeys.map((d) => buckets.get(d)!);
  const summary: DoctorDemandSummary = {
    totalBooked: 0,
    totalCompleted: 0,
    totalCancelled: 0,
    totalVisits: 0,
    busiestDate: null,
    busiestCount: 0,
    averagePerDay: 0,
    perDay,
  };

  for (const b of perDay) {
    summary.totalBooked += b.booked;
    summary.totalCompleted += b.completed;
    summary.totalCancelled += b.cancelled;
    summary.totalVisits += b.visits;
    if (b.visits > summary.busiestCount) {
      summary.busiestCount = b.visits;
      summary.busiestDate = b.date;
    }
  }
  summary.averagePerDay =
    dayKeys.length > 0 ? round1(summary.totalVisits / dayKeys.length) : 0;

  return summary;
}
