// Prisma-backed Repository adapter. Maps the String `status` column to the
// AppointmentStatus union at this boundary and wraps writes in real DB
// transactions via the Repository.transaction() contract.

import { PrismaClient, Prisma } from "@prisma/client";

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
import {
  AppointmentStatus as Status,
  AppointmentEventType as EventType,
  BroadcastStatus as BcStatus,
} from "../domain/types.js";
import type { Staff } from "../auth/staff.js";
import { toStaffRole } from "../auth/staff.js";
import type {
  AppendEventInput,
  AppointmentView,
  AppointmentViewQuery,
  AvailabilityDraft,
  BroadcastStats,
  CreateAppointmentInput,
  CreateAvailabilityInput,
  CreateBroadcastInput,
  CreateDoctorInput,
  CreatePatientInput,
  ListBroadcastsQuery,
  UpdateBroadcastInput,
  UpdatePatientInput,
  Repository,
  UpdateAppointmentInput,
  UpdateDoctorInput,
} from "./repository.js";
import type {
  CreateStaffInput,
  StaffRepository,
} from "./staff-repository.js";

type PrismaDb = PrismaClient | Prisma.TransactionClient;

const STATUSES = new Set<string>(Object.values(Status));
const EVENT_TYPES = new Set<string>(Object.values(EventType));

function toStatus(value: string): AppointmentStatus {
  if (!STATUSES.has(value)) {
    throw new Error(`Unknown appointment status from DB: ${value}`);
  }
  return value as AppointmentStatus;
}

function toEventType(value: string): AppointmentEventType {
  if (!EVENT_TYPES.has(value)) {
    throw new Error(`Unknown appointment event type from DB: ${value}`);
  }
  return value as AppointmentEventType;
}

type DoctorRow = {
  id: string;
  name: string;
  phone: string | null;
  department: string;
  slotDurationMinutes: number;
  avgConsultMinutes: number;
};
type AvailabilityRow = {
  id: string;
  doctorId: string;
  dayOfWeek: number;
  startMinutes: number;
  endMinutes: number;
};
type PatientRow = {
  id: string;
  phone: string;
  name: string;
  language: string;
  consentAt: Date | null;
};
type AppointmentRow = {
  id: string;
  doctorId: string;
  patientId: string;
  queueDate: Date;
  token: number;
  isWalkIn: boolean;
  isPriority: boolean;
  onHold: boolean;
  arrivedAt: Date | null;
  startedAt: Date | null;
  doneAt: Date | null;
  lastNotifiedMaxMinutes: number | null;
  start: Date | null;
  end: Date | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};
type EventRow = {
  id: string;
  appointmentId: string;
  type: string;
  metadata: Prisma.JsonValue;
  at: Date;
};

function toDoctor(row: DoctorRow): Doctor {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    department: row.department,
    slotDurationMinutes: row.slotDurationMinutes,
    avgConsultMinutes: row.avgConsultMinutes,
  };
}

function toAvailability(row: AvailabilityRow): Availability {
  return {
    id: row.id,
    doctorId: row.doctorId,
    dayOfWeek: row.dayOfWeek,
    startMinutes: row.startMinutes,
    endMinutes: row.endMinutes,
  };
}

function toPatient(row: PatientRow): Patient {
  return {
    id: row.id,
    phone: row.phone,
    name: row.name,
    language: row.language,
    consentAt: row.consentAt,
  };
}

function toAppointment(row: AppointmentRow): Appointment {
  return {
    id: row.id,
    doctorId: row.doctorId,
    patientId: row.patientId,
    queueDate: row.queueDate,
    token: row.token,
    isWalkIn: row.isWalkIn,
    isPriority: row.isPriority,
    onHold: row.onHold,
    arrivedAt: row.arrivedAt,
    startedAt: row.startedAt,
    doneAt: row.doneAt,
    status: toStatus(row.status),
    lastNotifiedMaxMinutes: row.lastNotifiedMaxMinutes,
    start: row.start,
    end: row.end,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

type StaffRow = {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  role: string;
  active: boolean;
};

function toStaff(row: StaffRow): Staff {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    name: row.name,
    role: toStaffRole(row.role),
    active: row.active,
  };
}

function toEvent(row: EventRow): AppointmentEvent {
  return {
    id: row.id,
    appointmentId: row.appointmentId,
    type: toEventType(row.type),
    at: row.at,
    metadata:
      row.metadata === null
        ? null
        : (row.metadata as unknown as Record<string, unknown>),
  };
}

type BroadcastRow = {
  id: string;
  title: string;
  body: string;
  category: string;
  priority: string;
  status: string;
  scheduledAt: Date | null;
  sentAt: Date | null;
  recipientCount: number;
  createdById: string;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
};

function toBroadcast(row: BroadcastRow): Broadcast {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    // Stored as Strings; the HTTP layer only ever writes validated unions.
    category: row.category as BroadcastCategory,
    priority: row.priority as BroadcastPriority,
    status: row.status as BroadcastStatus,
    scheduledAt: row.scheduledAt,
    sentAt: row.sentAt,
    recipientCount: row.recipientCount,
    createdById: row.createdById,
    createdByName: row.createdByName,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class PrismaRepository implements Repository, StaffRepository {
  constructor(private readonly db: PrismaDb) {}

  async getDoctor(id: string): Promise<Doctor | null> {
    const row = await this.db.doctor.findUnique({ where: { id } });
    return row ? toDoctor(row) : null;
  }

  async listDoctors(): Promise<Doctor[]> {
    const rows = await this.db.doctor.findMany({ orderBy: { name: "asc" } });
    return rows.map(toDoctor);
  }

  async createDoctor(input: CreateDoctorInput): Promise<Doctor> {
    const row = await this.db.doctor.create({ data: input });
    return toDoctor(row);
  }

  async updateDoctor(id: string, patch: UpdateDoctorInput): Promise<Doctor> {
    const row = await this.db.doctor.update({
      where: { id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
        ...(patch.department !== undefined
          ? { department: patch.department }
          : {}),
        ...(patch.slotDurationMinutes !== undefined
          ? { slotDurationMinutes: patch.slotDurationMinutes }
          : {}),
        ...(patch.avgConsultMinutes !== undefined
          ? { avgConsultMinutes: patch.avgConsultMinutes }
          : {}),
      },
    });
    return toDoctor(row);
  }

  async getPatient(id: string): Promise<Patient | null> {
    const row = await this.db.patient.findUnique({ where: { id } });
    return row ? toPatient(row) : null;
  }

  async getPatientByPhone(phone: string): Promise<Patient | null> {
    const row = await this.db.patient.findUnique({ where: { phone } });
    return row ? toPatient(row) : null;
  }

  async createPatient(input: CreatePatientInput): Promise<Patient> {
    const row = await this.db.patient.create({
      data: {
        phone: input.phone,
        name: input.name,
        language: input.language ?? "en",
        consentAt: input.consentAt,
      },
    });
    return toPatient(row);
  }

  async updatePatient(id: string, patch: UpdatePatientInput): Promise<Patient> {
    const row = await this.db.patient.update({
      where: { id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.language !== undefined ? { language: patch.language } : {}),
        ...(patch.consentAt !== undefined ? { consentAt: patch.consentAt } : {}),
      },
    });
    return toPatient(row);
  }

  async listPatients(): Promise<Patient[]> {
    const rows = await this.db.patient.findMany({ orderBy: { name: "asc" } });
    return rows.map(toPatient);
  }

  async listAvailability(doctorId: string): Promise<Availability[]> {
    const rows = await this.db.availability.findMany({
      where: { doctorId },
      orderBy: [{ dayOfWeek: "asc" }, { startMinutes: "asc" }],
    });
    return rows.map(toAvailability);
  }

  async listAllAvailability(): Promise<Availability[]> {
    const rows = await this.db.availability.findMany({
      orderBy: [{ doctorId: "asc" }, { dayOfWeek: "asc" }, { startMinutes: "asc" }],
    });
    return rows.map(toAvailability);
  }

  async createAvailability(
    input: CreateAvailabilityInput,
  ): Promise<Availability> {
    const row = await this.db.availability.create({ data: input });
    return toAvailability(row);
  }

  async replaceAvailability(
    doctorId: string,
    entries: AvailabilityDraft[],
  ): Promise<Availability[]> {
    await this.db.availability.deleteMany({ where: { doctorId } });
    if (entries.length > 0) {
      await this.db.availability.createMany({
        data: entries.map((e) => ({ doctorId, ...e })),
      });
    }
    const rows = await this.db.availability.findMany({
      where: { doctorId },
      orderBy: [{ dayOfWeek: "asc" }, { startMinutes: "asc" }],
    });
    return rows.map(toAvailability);
  }

  // --- StaffRepository ---------------------------------------------------
  async getStaffById(id: string): Promise<Staff | null> {
    const row = await this.db.staff.findUnique({ where: { id } });
    return row ? toStaff(row) : null;
  }

  async getStaffByEmail(email: string): Promise<Staff | null> {
    const row = await this.db.staff.findUnique({ where: { email } });
    return row ? toStaff(row) : null;
  }

  async createStaff(input: CreateStaffInput): Promise<Staff> {
    const row = await this.db.staff.create({
      data: {
        email: input.email,
        passwordHash: input.passwordHash,
        name: input.name,
        role: input.role,
        active: input.active ?? true,
      },
    });
    return toStaff(row);
  }

  async getAppointment(id: string): Promise<Appointment | null> {
    const row = await this.db.appointment.findUnique({ where: { id } });
    return row ? toAppointment(row) : null;
  }

  async listQueueEntries(
    doctorId: string,
    queueDate: Date,
  ): Promise<Appointment[]> {
    const rows = await this.db.appointment.findMany({
      where: { doctorId, queueDate },
      orderBy: { token: "asc" },
    });
    return rows.map(toAppointment);
  }

  async nextToken(doctorId: string, queueDate: Date): Promise<number> {
    const top = await this.db.appointment.aggregate({
      where: { doctorId, queueDate },
      _max: { token: true },
    });
    return (top._max.token ?? 0) + 1;
  }

  async claimNotification(
    appointmentId: string,
    kind: string,
  ): Promise<boolean> {
    try {
      await this.db.notification.create({ data: { appointmentId, kind } });
      return true;
    } catch (err) {
      // Unique (appointmentId, kind) violation -> already claimed.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        return false;
      }
      throw err;
    }
  }

  async listAppointmentViews(
    query: AppointmentViewQuery,
  ): Promise<AppointmentView[]> {
    const rows = await this.db.appointment.findMany({
      where: {
        queueDate: query.date,
        ...(query.doctorId ? { doctorId: query.doctorId } : {}),
      },
      orderBy: { token: "asc" },
      include: { doctor: true, patient: true },
    });
    return rows.map((row) => ({
      id: row.id,
      doctorId: row.doctorId,
      patientId: row.patientId,
      queueDate: row.queueDate,
      token: row.token,
      isWalkIn: row.isWalkIn,
      isPriority: row.isPriority,
      onHold: row.onHold,
      status: toStatus(row.status),
      arrivedAt: row.arrivedAt,
      startedAt: row.startedAt,
      doneAt: row.doneAt,
      createdAt: row.createdAt,
      doctorName: row.doctor.name,
      department: row.doctor.department,
      patientName: row.patient.name,
      patientPhone: row.patient.phone,
    }));
  }

  async listAppointmentsForPatient(patientId: string): Promise<Appointment[]> {
    const rows = await this.db.appointment.findMany({
      where: { patientId },
      orderBy: [{ queueDate: "desc" }, { token: "desc" }], // newest first
    });
    return rows.map(toAppointment);
  }

  async listAllAppointments(): Promise<Appointment[]> {
    const rows = await this.db.appointment.findMany();
    return rows.map(toAppointment);
  }

  async createAppointment(
    input: CreateAppointmentInput,
  ): Promise<Appointment> {
    const row = await this.db.appointment.create({
      data: {
        doctorId: input.doctorId,
        patientId: input.patientId,
        queueDate: input.queueDate,
        token: input.token,
        isWalkIn: input.isWalkIn,
        isPriority: input.isPriority,
        status: input.status,
        arrivedAt: input.arrivedAt ?? null,
      },
    });
    return toAppointment(row);
  }

  async updateAppointment(
    id: string,
    patch: UpdateAppointmentInput,
  ): Promise<Appointment> {
    const row = await this.db.appointment.update({
      where: { id },
      data: {
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.arrivedAt !== undefined ? { arrivedAt: patch.arrivedAt } : {}),
        ...(patch.startedAt !== undefined ? { startedAt: patch.startedAt } : {}),
        ...(patch.doneAt !== undefined ? { doneAt: patch.doneAt } : {}),
        ...(patch.onHold !== undefined ? { onHold: patch.onHold } : {}),
        ...(patch.token !== undefined ? { token: patch.token } : {}),
        ...(patch.isPriority !== undefined ? { isPriority: patch.isPriority } : {}),
        ...(patch.lastNotifiedMaxMinutes !== undefined
          ? { lastNotifiedMaxMinutes: patch.lastNotifiedMaxMinutes }
          : {}),
      },
    });
    return toAppointment(row);
  }

  async appendEvent(input: AppendEventInput): Promise<AppointmentEvent> {
    const row = await this.db.appointmentEvent.create({
      data: {
        appointmentId: input.appointmentId,
        type: input.type,
        metadata:
          input.metadata === null
            ? Prisma.DbNull
            : (input.metadata as Prisma.InputJsonValue),
      },
    });
    return toEvent(row);
  }

  async listEvents(appointmentId: string): Promise<AppointmentEvent[]> {
    const rows = await this.db.appointmentEvent.findMany({
      where: { appointmentId },
      orderBy: { at: "asc" },
    });
    return rows.map(toEvent);
  }

  async createBroadcast(input: CreateBroadcastInput): Promise<Broadcast> {
    const row = await this.db.broadcast.create({ data: input });
    return toBroadcast(row);
  }

  async getBroadcast(id: string): Promise<Broadcast | null> {
    const row = await this.db.broadcast.findUnique({ where: { id } });
    return row ? toBroadcast(row) : null;
  }

  async listBroadcasts(query: ListBroadcastsQuery): Promise<Broadcast[]> {
    const term = query.search?.trim();
    const rows = await this.db.broadcast.findMany({
      where: {
        ...(query.category ? { category: query.category } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.priority ? { priority: query.priority } : {}),
        ...(term
          ? {
              OR: [
                { title: { contains: term, mode: "insensitive" } },
                { body: { contains: term, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toBroadcast);
  }

  async updateBroadcast(
    id: string,
    patch: UpdateBroadcastInput,
  ): Promise<Broadcast> {
    const row = await this.db.broadcast.update({
      where: { id },
      data: {
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.sentAt !== undefined ? { sentAt: patch.sentAt } : {}),
        ...(patch.recipientCount !== undefined
          ? { recipientCount: patch.recipientCount }
          : {}),
      },
    });
    return toBroadcast(row);
  }

  async listDueBroadcasts(now: Date): Promise<Broadcast[]> {
    const rows = await this.db.broadcast.findMany({
      where: {
        status: BcStatus.SCHEDULED,
        scheduledAt: { not: null, lte: now },
      },
      orderBy: { scheduledAt: "asc" },
    });
    return rows.map(toBroadcast);
  }

  async broadcastStats(): Promise<BroadcastStats> {
    const [totalSent, reached, scheduled] = await Promise.all([
      this.db.broadcast.count({ where: { status: BcStatus.SENT } }),
      this.db.broadcast.aggregate({
        where: { status: BcStatus.SENT },
        _sum: { recipientCount: true },
      }),
      this.db.broadcast.count({ where: { status: BcStatus.SCHEDULED } }),
    ]);
    return {
      totalSent,
      totalReached: reached._sum.recipientCount ?? 0,
      scheduled,
    };
  }

  async transaction<T>(fn: (repo: Repository) => Promise<T>): Promise<T> {
    const db = this.db;
    if ("$transaction" in db) {
      return db.$transaction((tx) => fn(new PrismaRepository(tx)));
    }
    // Already inside a transaction — reuse the current client.
    return fn(this);
  }
}
