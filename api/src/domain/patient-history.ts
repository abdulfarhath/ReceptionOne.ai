// Pure domain logic: derive a patient's appointment history summary from their
// appointments. No DB/HTTP/chat/AI — it takes plain Appointments and a `now`
// instant and returns counts + key dates. The HTTP layer owns presentation
// (timezone, formatting); this module owns the rules.

import { AppointmentStatus, type Appointment } from "./types.js";

export interface PatientHistorySummary {
  /** Every appointment ever made, regardless of status. */
  total: number;
  /** BOOKED appointments still in the future (start >= now). */
  upcoming: number;
  /** Appointments marked COMPLETED. */
  completed: number;
  /** Appointments that were CANCELLED. */
  cancelled: number;
  /** Earliest non-cancelled appointment start — when this patient first engaged. */
  firstVisitAt: Date | null;
  /** Most recent non-cancelled appointment that has already started (their last visit). */
  lastVisitAt: Date | null;
  /** Soonest upcoming BOOKED appointment, if any. */
  nextAppointmentAt: Date | null;
}

/**
 * Summarize a patient's appointment history. `appointments` may be in any order
 * and may be empty. `now` is the reference instant for upcoming/past splits.
 */
export function summarizePatientHistory(
  appointments: Appointment[],
  now: Date,
): PatientHistorySummary {
  const nowMs = now.getTime();
  const summary: PatientHistorySummary = {
    total: appointments.length,
    upcoming: 0,
    completed: 0,
    cancelled: 0,
    firstVisitAt: null,
    lastVisitAt: null,
    nextAppointmentAt: null,
  };

  for (const appt of appointments) {
    const startMs = appt.start.getTime();
    const isCancelled = appt.status === AppointmentStatus.CANCELLED;

    if (appt.status === AppointmentStatus.COMPLETED) summary.completed++;
    if (isCancelled) summary.cancelled++;
    if (appt.status === AppointmentStatus.BOOKED && startMs >= nowMs) {
      summary.upcoming++;
      if (
        summary.nextAppointmentAt === null ||
        startMs < summary.nextAppointmentAt.getTime()
      ) {
        summary.nextAppointmentAt = appt.start;
      }
    }

    if (isCancelled) continue; // cancelled visits don't count toward first/last visit

    if (
      summary.firstVisitAt === null ||
      startMs < summary.firstVisitAt.getTime()
    ) {
      summary.firstVisitAt = appt.start;
    }
    if (
      startMs < nowMs &&
      (summary.lastVisitAt === null || startMs > summary.lastVisitAt.getTime())
    ) {
      summary.lastVisitAt = appt.start;
    }
  }

  return summary;
}
