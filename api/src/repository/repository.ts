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
  avgConsultMinutes?: number;
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
  avgConsultMinutes?: number;
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
  /** The queue day (UTC midnight). */
  date: Date;
  doctorId?: string;
}

/**
 * Denormalized read model for the dashboard board: a queue entry joined with its
 * doctor and patient. Read-only — writes still go through the core.
 */
export interface AppointmentView {
  id: string;
  doctorId: string;
  patientId: string;
  queueDate: Date;
  token: number;
  isWalkIn: boolean;
  isPriority: boolean;
  onHold: boolean;
  status: AppointmentStatus;
  arrivedAt: Date | null;
  startedAt: Date | null;
  doneAt: Date | null;
  createdAt: Date;
  doctorName: string;
  department: string;
  patientName: string;
  patientPhone: string;
}

export interface CreateAppointmentInput {
  doctorId: string;
  patientId: string;
  queueDate: Date;
  token: number;
  isWalkIn: boolean;
  isPriority: boolean;
  status: AppointmentStatus;
  arrivedAt?: Date | null;
}

export interface UpdateAppointmentInput {
  status?: AppointmentStatus;
  arrivedAt?: Date | null;
  startedAt?: Date | null;
  doneAt?: Date | null;
  onHold?: boolean;
  /** Reinstate to the back of the queue assigns a fresh token. */
  token?: number;
  isPriority?: boolean;
  lastNotifiedMaxMinutes?: number | null;
}

export interface AppendEventInput {
  appointmentId: string;
  type: AppointmentEventType;
  metadata: Record<string, unknown> | null;
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
  /** Every queue entry for one patient (any status), newest first — history view. */
  listAppointmentsForPatient(patientId: string): Promise<Appointment[]>;
  /** Every queue entry in the system (any status) — for analytics + directory. */
  listAllAppointments(): Promise<Appointment[]>;
  /** All queue entries for a doctor on a given queueDate (any status). */
  listQueueEntries(doctorId: string, queueDate: Date): Promise<Appointment[]>;
  /** The next token for a doctor's queue on a queueDate (max existing + 1). */
  nextToken(doctorId: string, queueDate: Date): Promise<number>;

  /**
   * Claim a one-time notification of `kind` for a booking. Returns true if this
   * call recorded it (caller should send), false if it was already claimed —
   * making "you're next" and similar sends idempotent.
   */
  claimNotification(appointmentId: string, kind: string): Promise<boolean>;

  /** Day-board read model: queue entries joined with doctor + patient. */
  listAppointmentViews(query: AppointmentViewQuery): Promise<AppointmentView[]>;

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
