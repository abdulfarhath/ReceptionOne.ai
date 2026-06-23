// The Repository interface is the core's only door to persistence. It is PURE
// (types + method signatures); concrete adapters (InMemory, Prisma) implement it.

import type {
  Appointment,
  AppointmentEvent,
  AppointmentEventType,
  AppointmentStatus,
  Availability,
  Broadcast,
  BroadcastCategory,
  BroadcastPriority,
  BroadcastStatus,
  Doctor,
  Patient,
} from "../domain/types.js";

export interface CreateDoctorInput {
  name: string;
  phone?: string | null;
  department: string;
  slotDurationMinutes: number;
}

export interface CreateAvailabilityInput {
  doctorId: string;
  dayOfWeek: number;
  startMinutes: number;
  endMinutes: number;
}

export interface CreatePatientInput {
  phone: string;
  name: string;
  language?: string;
  consentAt: Date | null;
}

export interface UpdateDoctorInput {
  name?: string;
  phone?: string | null;
  department?: string;
  slotDurationMinutes?: number;
}

export interface UpdatePatientInput {
  name?: string;
  language?: string;
  consentAt?: Date | null;
}

/** One weekly window without an id, used when replacing a doctor's hours. */
export interface AvailabilityDraft {
  dayOfWeek: number;
  startMinutes: number;
  endMinutes: number;
}

export interface AppointmentViewQuery {
  from: Date;
  to: Date;
  doctorId?: string;
}

/**
 * Denormalized read model for the dashboard: an appointment joined with its
 * doctor and patient. A read-only view — writes still go through the core.
 */
export interface AppointmentView {
  id: string;
  doctorId: string;
  patientId: string;
  start: Date;
  end: Date;
  status: AppointmentStatus;
  createdAt: Date;
  doctorName: string;
  department: string;
  patientName: string;
  patientPhone: string;
}

export interface CreateAppointmentInput {
  doctorId: string;
  patientId: string;
  start: Date;
  end: Date;
  status: AppointmentStatus;
}

export interface UpdateAppointmentInput {
  start?: Date;
  end?: Date;
  status?: AppointmentStatus;
}

export interface AppendEventInput {
  appointmentId: string;
  type: AppointmentEventType;
  metadata: Record<string, unknown> | null;
}

export interface ListAppointmentsQuery {
  doctorId: string;
  /** Inclusive lower bound on Appointment.start. */
  from: Date;
  /** Exclusive upper bound on Appointment.start. */
  to: Date;
  /** If given, only appointments with one of these statuses. */
  statuses?: AppointmentStatus[];
}

export interface CreateBroadcastInput {
  title: string;
  body: string;
  category: BroadcastCategory;
  priority: BroadcastPriority;
  status: BroadcastStatus;
  scheduledAt: Date | null;
  sentAt: Date | null;
  recipientCount: number;
  createdById: string;
  createdByName: string;
}

export interface UpdateBroadcastInput {
  status?: BroadcastStatus;
  sentAt?: Date | null;
  recipientCount?: number;
}

export interface ListBroadcastsQuery {
  /** Case-insensitive substring match over title + body. */
  search?: string;
  category?: BroadcastCategory;
  status?: BroadcastStatus;
  priority?: BroadcastPriority;
}

export interface BroadcastStats {
  /** Broadcasts already dispatched. */
  totalSent: number;
  /** Sum of recipientCount across sent broadcasts. */
  totalReached: number;
  /** Broadcasts still scheduled for the future. */
  scheduled: number;
}

export interface Repository {
  getDoctor(id: string): Promise<Doctor | null>;
  listDoctors(): Promise<Doctor[]>;
  createDoctor(input: CreateDoctorInput): Promise<Doctor>;
  updateDoctor(id: string, patch: UpdateDoctorInput): Promise<Doctor>;
  getPatient(id: string): Promise<Patient | null>;
  getPatientByPhone(phone: string): Promise<Patient | null>;
  /** All patients, ordered by name — for the staff patient directory. */
  listPatients(): Promise<Patient[]>;
  createPatient(input: CreatePatientInput): Promise<Patient>;
  updatePatient(id: string, patch: UpdatePatientInput): Promise<Patient>;
  listAvailability(doctorId: string): Promise<Availability[]>;
  /** Every availability window across all doctors — for analytics/capacity. */
  listAllAvailability(): Promise<Availability[]>;
  createAvailability(input: CreateAvailabilityInput): Promise<Availability>;
  /** Replace a doctor's entire weekly availability with `entries`. */
  replaceAvailability(
    doctorId: string,
    entries: AvailabilityDraft[],
  ): Promise<Availability[]>;

  getAppointment(id: string): Promise<Appointment | null>;
  listAppointments(query: ListAppointmentsQuery): Promise<Appointment[]>;
  /** Every appointment for one patient (any status), newest first — history view. */
  listAppointmentsForPatient(patientId: string): Promise<Appointment[]>;
  /** Every appointment in the system (any status) — for patient-directory stats. */
  listAllAppointments(): Promise<Appointment[]>;
  /** A patient's BOOKED appointments starting at or after `from`, soonest first. */
  listUpcomingAppointmentsForPatient(
    patientId: string,
    from: Date,
  ): Promise<Appointment[]>;
  /** BOOKED appointments starting in (from, to], soonest first — for reminders. */
  listBookedBetween(from: Date, to: Date): Promise<Appointment[]>;

  /**
   * Claim a notification of `kind` for an appointment. Returns true if this call
   * recorded it (caller should send), false if it was already recorded. This is
   * what makes reminders idempotent and the job safe to re-run.
   */
  recordNotificationOnce(appointmentId: string, kind: string): Promise<boolean>;
  /** Remove notification records (used to re-arm reminders after a reschedule). */
  deleteNotifications(appointmentId: string, kinds: string[]): Promise<void>;
  /** Day-view read model: appointments joined with doctor + patient. */
  listAppointmentViews(query: AppointmentViewQuery): Promise<AppointmentView[]>;
  /** A BOOKED appointment for this doctor at exactly `start`, if any. */
  findBookedSlot(doctorId: string, start: Date): Promise<Appointment | null>;

  createAppointment(input: CreateAppointmentInput): Promise<Appointment>;
  updateAppointment(
    id: string,
    patch: UpdateAppointmentInput,
  ): Promise<Appointment>;

  appendEvent(input: AppendEventInput): Promise<AppointmentEvent>;
  listEvents(appointmentId: string): Promise<AppointmentEvent[]>;

  createBroadcast(input: CreateBroadcastInput): Promise<Broadcast>;
  getBroadcast(id: string): Promise<Broadcast | null>;
  /** Broadcasts matching the filters, newest first. */
  listBroadcasts(query: ListBroadcastsQuery): Promise<Broadcast[]>;
  updateBroadcast(id: string, patch: UpdateBroadcastInput): Promise<Broadcast>;
  /** SCHEDULED broadcasts whose scheduledAt is at or before `now`, soonest first. */
  listDueBroadcasts(now: Date): Promise<Broadcast[]>;
  broadcastStats(): Promise<BroadcastStats>;

  /**
   * Run `fn` atomically. The repo passed to `fn` participates in the same
   * transaction; concrete adapters back this with a real DB transaction.
   */
  transaction<T>(fn: (repo: Repository) => Promise<T>): Promise<T>;
}
