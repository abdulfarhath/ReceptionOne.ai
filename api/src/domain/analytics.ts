// Pure analytics helpers derived from queue entries. No DB/HTTP/timezone — the
// HTTP layer injects clinic-timezone bucketing. The slot model is gone, so there
// is no capacity/utilization here; demand and outcomes come from real statuses.

import { AppointmentStatus, type Appointment } from "./types.js";

/** Seen through to completion. */
export function isAttended(a: Appointment): boolean {
  return a.status === AppointmentStatus.DONE;
}

/** A real no-show (now a tracked status, not an estimate). */
export function isNoShow(a: Appointment): boolean {
  return a.status === AppointmentStatus.NO_SHOW;
}

/** Still live in a queue. */
export function isActive(a: Appointment): boolean {
  return (
    a.status === AppointmentStatus.WAITING ||
    a.status === AppointmentStatus.ARRIVED ||
    a.status === AppointmentStatus.IN_PROGRESS
  );
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Mean actual consult length in minutes (startedAt → doneAt) over DONE entries.
 * Null when no completed consult has both timestamps.
 */
export function avgConsultMinutes(entries: Appointment[]): number | null {
  let sum = 0;
  let n = 0;
  for (const e of entries) {
    if (e.status === AppointmentStatus.DONE && e.startedAt && e.doneAt) {
      sum += (e.doneAt.getTime() - e.startedAt.getTime()) / 60_000;
      n++;
    }
  }
  return n === 0 ? null : round1(sum / n);
}

export interface PatientInsights {
  totalPatients: number;
  newPatients: number;
  returningPatients: number;
  returningPct: number;
  retentionPct: number;
}

function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 1000) / 10 : 0;
}

/** New-vs-returning and retention, derived from per-patient entry counts. */
export function patientInsights(appointments: Appointment[]): PatientInsights {
  const totalByPatient = new Map<string, number>();
  const doneByPatient = new Map<string, number>();
  for (const a of appointments) {
    totalByPatient.set(a.patientId, (totalByPatient.get(a.patientId) ?? 0) + 1);
    if (a.status === AppointmentStatus.DONE) {
      doneByPatient.set(a.patientId, (doneByPatient.get(a.patientId) ?? 0) + 1);
    }
  }

  const totalPatients = totalByPatient.size;
  let returningPatients = 0;
  for (const count of totalByPatient.values()) {
    if (count >= 2) returningPatients++;
  }
  const newPatients = totalPatients - returningPatients;

  // Retention: among patients who actually got a visit (>=1 DONE), how many
  // came back (>=2 total entries).
  let visited = 0;
  let retained = 0;
  for (const [patientId, done] of doneByPatient) {
    if (done >= 1) {
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
