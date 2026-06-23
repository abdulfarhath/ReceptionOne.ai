// Pure analytics helpers derived from the appointments dataset. No DB/HTTP/
// timezone here — the HTTP layer injects clinic-timezone day/hour bucketing and
// supplies availability data. These functions are the tested core for the
// operational analytics dashboard.

import { AppointmentStatus, type Appointment } from "./types.js";

/** A real unit of demand: a slot that is booked or already completed. */
export function isVisit(a: Appointment): boolean {
  return (
    a.status === AppointmentStatus.BOOKED ||
    a.status === AppointmentStatus.COMPLETED
  );
}

/**
 * A no-show estimate: the dataset has no NO_SHOW status, so we derive it as an
 * appointment still BOOKED whose start time has already passed (never completed
 * or cancelled). Approximate — surfaced as "est." in the UI.
 */
export function isEstimatedNoShow(a: Appointment, nowMs: number): boolean {
  return a.status === AppointmentStatus.BOOKED && a.start.getTime() < nowMs;
}

export interface SlotWindow {
  startMinutes: number;
  endMinutes: number;
}

/** Total bookable slots that fit in `windows` for a single day. */
export function slotCapacity(
  windows: SlotWindow[],
  slotDurationMinutes: number,
): number {
  if (slotDurationMinutes <= 0) return 0;
  let count = 0;
  for (const w of windows) {
    if (w.endMinutes > w.startMinutes) {
      count += Math.floor((w.endMinutes - w.startMinutes) / slotDurationMinutes);
    }
  }
  return count;
}

/**
 * Free slots for one day: slots inside `windows` that are neither already booked
 * nor in the past. Mirrors SchedulingService.getAvailableSlots so the numbers
 * agree with the booking flow. `dayStartMs` is UTC-midnight of the day; window
 * minutes are minutes-from-midnight (UTC), per the domain convention.
 */
export function openSlotCount(
  windows: SlotWindow[],
  slotDurationMinutes: number,
  dayStartMs: number,
  bookedStartMs: Set<number>,
  nowMs: number,
): number {
  if (slotDurationMinutes <= 0) return 0;
  let count = 0;
  for (const w of windows) {
    for (
      let m = w.startMinutes;
      m + slotDurationMinutes <= w.endMinutes;
      m += slotDurationMinutes
    ) {
      const startMs = dayStartMs + m * 60_000;
      if (startMs < nowMs) continue;
      if (bookedStartMs.has(startMs)) continue;
      count++;
    }
  }
  return count;
}

export interface PatientInsights {
  /** Distinct patients with at least one appointment. */
  totalPatients: number;
  /** Patients with exactly one appointment. */
  newPatients: number;
  /** Patients who booked two or more times. */
  returningPatients: number;
  /** returning / total, as a percentage (1 decimal). */
  returningPct: number;
  /** Of patients with a completed visit, the share who booked again. */
  retentionPct: number;
}

function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 1000) / 10 : 0;
}

/** New-vs-returning and retention, derived from per-patient appointment counts. */
export function patientInsights(appointments: Appointment[]): PatientInsights {
  const totalByPatient = new Map<string, number>();
  const completedByPatient = new Map<string, number>();
  for (const a of appointments) {
    totalByPatient.set(a.patientId, (totalByPatient.get(a.patientId) ?? 0) + 1);
    if (a.status === AppointmentStatus.COMPLETED) {
      completedByPatient.set(
        a.patientId,
        (completedByPatient.get(a.patientId) ?? 0) + 1,
      );
    }
  }

  const totalPatients = totalByPatient.size;
  let returningPatients = 0;
  for (const count of totalByPatient.values()) {
    if (count >= 2) returningPatients++;
  }
  const newPatients = totalPatients - returningPatients;

  // Retention: among patients who actually visited (>=1 completed), how many
  // have booked more than once.
  let visited = 0;
  let retained = 0;
  for (const [patientId, completed] of completedByPatient) {
    if (completed >= 1) {
      visited++;
      if ((totalByPatient.get(patientId) ?? 0) >= 2) retained++;
    }
  }

  return {
    totalPatients,
    newPatients,
    returningPatients,
    returningPct: pct(returningPatients, totalPatients),
    retentionPct: pct(retained, visited),
  };
}
