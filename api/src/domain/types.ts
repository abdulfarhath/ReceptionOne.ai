// Source of truth for the domain model. This module is PURE: no DB, HTTP, chat,
// or AI imports. Everything here is plain data + value types.
//
// Time policy (per CLAUDE.md): all instants (Appointment.start/end, timestamps)
// are UTC. Availability windows are expressed as a weekday + minutes-from-midnight
// and are interpreted in UTC inside the core. Converting to the clinic's display
// timezone (Asia/Kolkata) is a presentation concern handled at the HTTP/messaging
// boundary, never here.

export type DoctorId = string;
export type PatientId = string;
export type AppointmentId = string;
export type AvailabilityId = string;
export type AppointmentEventId = string;

/** Lifecycle status of an appointment. Stored as a String column at the DB edge. */
export const AppointmentStatus = {
  BOOKED: "BOOKED",
  CANCELLED: "CANCELLED",
  COMPLETED: "COMPLETED",
} as const;
export type AppointmentStatus =
  (typeof AppointmentStatus)[keyof typeof AppointmentStatus];

/** Append-only audit log event types. */
export const AppointmentEventType = {
  BOOKED: "BOOKED",
  RESCHEDULED: "RESCHEDULED",
  CANCELLED: "CANCELLED",
  COMPLETED: "COMPLETED",
} as const;
export type AppointmentEventType =
  (typeof AppointmentEventType)[keyof typeof AppointmentEventType];

export interface Doctor {
  id: DoctorId;
  name: string;
  department: string;
  /** Length of a single bookable slot, in minutes. */
  slotDurationMinutes: number;
}

/**
 * One weekly working window for a doctor. `dayOfWeek` is 0=Sun..6=Sat.
 * `startMinutes`/`endMinutes` are minutes-from-midnight (UTC), with
 * startMinutes < endMinutes and both in [0, 1440].
 */
export interface Availability {
  id: AvailabilityId;
  doctorId: DoctorId;
  dayOfWeek: number;
  startMinutes: number;
  endMinutes: number;
}

export interface Patient {
  id: PatientId;
  /** E.164 phone number, unique across patients. */
  phone: string;
  name: string;
  /** When the patient consented to be messaged; null until captured. */
  consentAt: Date | null;
}

export interface Appointment {
  id: AppointmentId;
  doctorId: DoctorId;
  patientId: PatientId;
  /** Slot start, UTC. */
  start: Date;
  /** Slot end (start + doctor.slotDurationMinutes), UTC. */
  end: Date;
  status: AppointmentStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface AppointmentEvent {
  id: AppointmentEventId;
  appointmentId: AppointmentId;
  type: AppointmentEventType;
  /** When the event was recorded, UTC. */
  at: Date;
  /** Optional structured context (e.g. previous start on reschedule). */
  metadata: Record<string, unknown> | null;
}
