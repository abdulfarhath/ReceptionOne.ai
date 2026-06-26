// Pure domain logic: summarise a patient's queue history. No DB/HTTP/chat/AI —
// it takes plain queue entries and returns counts + key dates (by queueDate).

import { AppointmentStatus, type Appointment } from "./types.js";

export interface PatientHistorySummary {
  /** Every queue entry ever, regardless of status. */
  total: number;
  /** Entries still live in a queue (WAITING / ARRIVED / IN_PROGRESS). */
  active: number;
  /** Entries seen through to DONE. */
  completed: number;
  /** Entries that were CANCELLED. */
  cancelled: number;
  /** Entries marked NO_SHOW. */
  noShow: number;
  /** Earliest non-cancelled queueDate — when this patient first engaged. */
  firstVisitAt: Date | null;
  /** Most recent completed (DONE) queueDate — their last actual visit. */
  lastVisitAt: Date | null;
}

const ACTIVE: ReadonlySet<AppointmentStatus> = new Set([
  AppointmentStatus.WAITING,
  AppointmentStatus.ARRIVED,
  AppointmentStatus.IN_PROGRESS,
]);

/** Summarise a patient's queue entries. May be empty / any order. */
export function summarizePatientHistory(
  appointments: Appointment[],
): PatientHistorySummary {
  const summary: PatientHistorySummary = {
    total: appointments.length,
    active: 0,
    completed: 0,
    cancelled: 0,
    noShow: 0,
    firstVisitAt: null,
    lastVisitAt: null,
  };

  for (const appt of appointments) {
    if (ACTIVE.has(appt.status)) summary.active++;
    else if (appt.status === AppointmentStatus.DONE) summary.completed++;
    else if (appt.status === AppointmentStatus.CANCELLED) summary.cancelled++;
    else if (appt.status === AppointmentStatus.NO_SHOW) summary.noShow++;

    const day = appt.queueDate;
    if (appt.status !== AppointmentStatus.CANCELLED) {
      if (summary.firstVisitAt === null || day < summary.firstVisitAt) {
        summary.firstVisitAt = day;
      }
    }
    if (appt.status === AppointmentStatus.DONE) {
      if (summary.lastVisitAt === null || day > summary.lastVisitAt) {
        summary.lastVisitAt = day;
      }
    }
  }

  return summary;
}
