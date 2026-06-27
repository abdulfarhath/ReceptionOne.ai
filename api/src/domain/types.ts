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

/**
 * Lifecycle status of a queue entry. Stored as a String column at the DB edge.
 *   WAITING     — has a token, on the way / not yet checked in
 *   ARRIVED     — checked in at the clinic, waiting to be seen
 *   IN_PROGRESS — consult underway
 *   DONE        — consult finished
 *   NO_SHOW     — never turned up / called and absent
 *   CANCELLED   — withdrawn before being seen
 */
export const AppointmentStatus = {
  WAITING: "WAITING",
  ARRIVED: "ARRIVED",
  IN_PROGRESS: "IN_PROGRESS",
  DONE: "DONE",
  NO_SHOW: "NO_SHOW",
  CANCELLED: "CANCELLED",
} as const;
export type AppointmentStatus =
  (typeof AppointmentStatus)[keyof typeof AppointmentStatus];

/** Append-only audit log event types for a queue entry. */
export const AppointmentEventType = {
  JOINED: "JOINED",
  ARRIVED: "ARRIVED",
  STARTED: "STARTED",
  DONE: "DONE",
  NO_SHOW: "NO_SHOW",
  CANCELLED: "CANCELLED",
  HOLD: "HOLD",
  REINSTATED: "REINSTATED",
} as const;
export type AppointmentEventType =
  (typeof AppointmentEventType)[keyof typeof AppointmentEventType];

export interface Doctor {
  id: DoctorId;
  name: string;
  phone?: string | null;
  department: string;
  /** Legacy slot length, in minutes. Unused by the queue model. */
  slotDurationMinutes: number;
  /** Average consult length, in minutes — drives queue wait estimates. */
  avgConsultMinutes: number;
}

/**
 * One weekly SESSION window for a doctor: which weekday the queue is open and
 * its open/close clock times. `dayOfWeek` is 0=Sun..6=Sat. `startMinutes`/
 * `endMinutes` are minutes-from-midnight (UTC); `startMinutes` is the session
 * start used for arrival estimates. No discrete slots are derived from this.
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
  language?: string;
  /** When the patient consented to be messaged; null until captured. */
  consentAt: Date | null;
}

/**
 * A live queue entry. One queue per doctor per `queueDate`; `token` is unique
 * within that queue and assigned in join order starting at 1. There is no slot
 * time — `arrivedAt`/`startedAt`/`doneAt` track the lifecycle. `start`/`end` are
 * legacy (slot model) and always null on new entries.
 */
export interface Appointment {
  id: AppointmentId;
  doctorId: DoctorId;
  patientId: PatientId;
  /** The clinic day this entry belongs to (UTC midnight). */
  queueDate: Date;
  /** Per doctor per queueDate, starting at 1. */
  token: number;
  isWalkIn: boolean;
  isPriority: boolean;
  /** Absent when called; the board skips a held token. */
  onHold: boolean;
  /**
   * Preferred "come at my own time" target (UTC). Null = an immediate token
   * (come now). A scheduled token is still a token, never a reserved slot: it
   * enters the live queue around this time and is given an honest window.
   */
  targetTime: Date | null;
  arrivedAt: Date | null;
  startedAt: Date | null;
  doneAt: Date | null;
  status: AppointmentStatus;
  /** Last max-wait (minutes) the patient was told, for slip re-notification. */
  lastNotifiedMaxMinutes: number | null;
  /** Legacy slot times (slot model removed); null on queue entries. */
  start: Date | null;
  end: Date | null;
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

export type BroadcastId = string;

/** Broadcast topic. Stored as a String column; validated at every edge. */
export const BroadcastCategory = {
  MARKETING: "MARKETING",
  BOOTCAMP: "BOOTCAMP",
  BLOOD_DONATION: "BLOOD_DONATION",
  HEALTH_CAMP: "HEALTH_CAMP",
  PROMOTION: "PROMOTION",
  DOCTOR_UPDATE: "DOCTOR_UPDATE",
  REMINDER: "REMINDER",
  EMERGENCY_NOTICE: "EMERGENCY_NOTICE",
  CUSTOM: "CUSTOM",
} as const;
export type BroadcastCategory =
  (typeof BroadcastCategory)[keyof typeof BroadcastCategory];

export const BroadcastPriority = {
  LOW: "LOW",
  NORMAL: "NORMAL",
  HIGH: "HIGH",
  URGENT: "URGENT",
} as const;
export type BroadcastPriority =
  (typeof BroadcastPriority)[keyof typeof BroadcastPriority];

/** SCHEDULED until dispatched; SENT once delivered to consented patients. */
export const BroadcastStatus = {
  SCHEDULED: "SCHEDULED",
  SENT: "SENT",
} as const;
export type BroadcastStatus =
  (typeof BroadcastStatus)[keyof typeof BroadcastStatus];

/**
 * A single message broadcast to all consented patients. `scheduledAt` null means
 * it was sent immediately; `sentAt`/`recipientCount` are set on dispatch.
 */
export interface Broadcast {
  id: BroadcastId;
  title: string;
  body: string;
  category: BroadcastCategory;
  priority: BroadcastPriority;
  status: BroadcastStatus;
  /** When it should go out; null for immediate sends. UTC. */
  scheduledAt: Date | null;
  /** When it was actually dispatched; null until then. UTC. */
  sentAt: Date | null;
  /** Number of consented patients messaged. */
  recipientCount: number;
  /** Staff member who created it. */
  createdById: string;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
}
