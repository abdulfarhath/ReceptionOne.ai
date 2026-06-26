// Pure domain logic: per-day demand for one doctor's queue. No DB/HTTP/timezone
// here — the caller passes the ordered day keys covering the range and a
// `dayKeyOf` mapper (an IST date formatter) applied to each entry's queueDate.

import { AppointmentStatus, type Appointment } from "./types.js";

export interface DoctorDayDemand {
  /** Clinic-day key, e.g. "2026-06-23". */
  date: string;
  /** Everyone who took a token that day (raw demand). */
  joined: number;
  /** Seen through to DONE. */
  done: number;
  /** Marked NO_SHOW. */
  noShow: number;
  /** CANCELLED before being seen. */
  cancelled: number;
}

export interface DoctorDemandSummary {
  totalJoined: number;
  totalDone: number;
  totalNoShow: number;
  totalCancelled: number;
  /** Busiest clinic-day by tokens joined, or null. */
  busiestDate: string | null;
  busiestCount: number;
  /** totalJoined / number of days in range, to 1 decimal. */
  averagePerDay: number;
  perDay: DoctorDayDemand[];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Aggregate `appointments` (a doctor's queue entries) into per-day demand.
 * `dayKeys` is the ordered set of clinic-day keys covering the range (so empty
 * days still appear); `dayKeyOf` maps an entry's queueDate to its day key.
 */
export function summarizeDoctorDemand(
  appointments: Appointment[],
  dayKeys: string[],
  dayKeyOf: (queueDate: Date) => string,
): DoctorDemandSummary {
  const buckets = new Map<string, DoctorDayDemand>();
  for (const date of dayKeys) {
    buckets.set(date, { date, joined: 0, done: 0, noShow: 0, cancelled: 0 });
  }

  for (const appt of appointments) {
    const bucket = buckets.get(dayKeyOf(appt.queueDate));
    if (!bucket) continue; // outside the requested range
    bucket.joined++;
    if (appt.status === AppointmentStatus.DONE) bucket.done++;
    else if (appt.status === AppointmentStatus.NO_SHOW) bucket.noShow++;
    else if (appt.status === AppointmentStatus.CANCELLED) bucket.cancelled++;
  }

  const perDay = dayKeys.map((d) => buckets.get(d)!);
  const summary: DoctorDemandSummary = {
    totalJoined: 0,
    totalDone: 0,
    totalNoShow: 0,
    totalCancelled: 0,
    busiestDate: null,
    busiestCount: 0,
    averagePerDay: 0,
    perDay,
  };

  for (const b of perDay) {
    summary.totalJoined += b.joined;
    summary.totalDone += b.done;
    summary.totalNoShow += b.noShow;
    summary.totalCancelled += b.cancelled;
    if (b.joined > summary.busiestCount) {
      summary.busiestCount = b.joined;
      summary.busiestDate = b.date;
    }
  }
  summary.averagePerDay =
    dayKeys.length > 0 ? round1(summary.totalJoined / dayKeys.length) : 0;

  return summary;
}
