// In-memory Repository adapter: used by tests and as a zero-dependency default.
// Adapters MAY use Node APIs (this is not the pure core).

import { randomUUID } from "node:crypto";

import type {
  Appointment,
  AppointmentEvent,
  Availability,
  Broadcast,
  Doctor,
  Patient,
} from "../domain/types.js";
import { AppointmentStatus, BroadcastStatus } from "../domain/types.js";
import type { Staff } from "../auth/staff.js";
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
  ListAppointmentsQuery,
  Repository,
  UpdateAppointmentInput,
  UpdateDoctorInput,
} from "./repository.js";
import type {
  CreateStaffInput,
  StaffRepository,
} from "./staff-repository.js";

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class InMemoryRepository implements Repository, StaffRepository {
  private readonly doctors = new Map<string, Doctor>();
  private readonly patients = new Map<string, Patient>();
  private readonly availability: Availability[] = [];
  private readonly appointments = new Map<string, Appointment>();
  private readonly events: AppointmentEvent[] = [];
  private readonly staff = new Map<string, Staff>();
  private readonly notifications = new Set<string>(); // `${appointmentId}::${kind}`
  private readonly broadcasts = new Map<string, Broadcast>();

  // --- test/seed helpers -------------------------------------------------
  addDoctor(doctor: Doctor): Doctor {
    this.doctors.set(doctor.id, clone(doctor));
    return clone(doctor);
  }

  addPatient(patient: Patient): Patient {
    this.patients.set(patient.id, clone(patient));
    return clone(patient);
  }

  addAvailability(entry: Availability): Availability {
    this.availability.push(clone(entry));
    return clone(entry);
  }

  // --- Repository --------------------------------------------------------
  async getDoctor(id: string): Promise<Doctor | null> {
    const found = this.doctors.get(id);
    return found ? clone(found) : null;
  }

  async listDoctors(): Promise<Doctor[]> {
    return [...this.doctors.values()].map(clone);
  }

  async createDoctor(input: CreateDoctorInput): Promise<Doctor> {
    const doctor: Doctor = { id: randomUUID(), ...input };
    this.doctors.set(doctor.id, clone(doctor));
    return clone(doctor);
  }

  async updateDoctor(id: string, patch: UpdateDoctorInput): Promise<Doctor> {
    const existing = this.doctors.get(id);
    if (!existing) throw new Error(`Doctor ${id} not found`);
    const updated: Doctor = {
      ...existing,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
      ...(patch.department !== undefined
        ? { department: patch.department }
        : {}),
      ...(patch.slotDurationMinutes !== undefined
        ? { slotDurationMinutes: patch.slotDurationMinutes }
        : {}),
    };
    this.doctors.set(id, clone(updated));
    return clone(updated);
  }

  async getPatient(id: string): Promise<Patient | null> {
    const found = this.patients.get(id);
    return found ? clone(found) : null;
  }

  async getPatientByPhone(phone: string): Promise<Patient | null> {
    const found = [...this.patients.values()].find((p) => p.phone === phone);
    return found ? clone(found) : null;
  }

  async listPatients(): Promise<Patient[]> {
    return [...this.patients.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(clone);
  }

  async createPatient(input: CreatePatientInput): Promise<Patient> {
    const patient: Patient = { id: randomUUID(), language: input.language ?? "en", ...input };
    this.patients.set(patient.id, clone(patient));
    return clone(patient);
  }

  async updatePatient(id: string, patch: UpdatePatientInput): Promise<Patient> {
    const existing = this.patients.get(id);
    if (!existing) throw new Error(`Patient ${id} not found`);
    const updated: Patient = {
      ...existing,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.language !== undefined ? { language: patch.language } : {}),
      ...(patch.consentAt !== undefined ? { consentAt: patch.consentAt } : {}),
    };
    this.patients.set(id, clone(updated));
    return clone(updated);
  }

  async listAvailability(doctorId: string): Promise<Availability[]> {
    return this.availability
      .filter((a) => a.doctorId === doctorId)
      .map(clone);
  }

  async listAllAvailability(): Promise<Availability[]> {
    return this.availability.map(clone);
  }

  async createAvailability(
    input: CreateAvailabilityInput,
  ): Promise<Availability> {
    const entry: Availability = { id: randomUUID(), ...input };
    this.availability.push(clone(entry));
    return clone(entry);
  }

  async replaceAvailability(
    doctorId: string,
    entries: AvailabilityDraft[],
  ): Promise<Availability[]> {
    for (let i = this.availability.length - 1; i >= 0; i--) {
      if (this.availability[i]!.doctorId === doctorId) {
        this.availability.splice(i, 1);
      }
    }
    const created = entries.map<Availability>((e) => ({
      id: randomUUID(),
      doctorId,
      dayOfWeek: e.dayOfWeek,
      startMinutes: e.startMinutes,
      endMinutes: e.endMinutes,
    }));
    for (const entry of created) this.availability.push(clone(entry));
    return created.map(clone);
  }

  // --- StaffRepository ---------------------------------------------------
  async getStaffById(id: string): Promise<Staff | null> {
    const found = this.staff.get(id);
    return found ? clone(found) : null;
  }

  async getStaffByEmail(email: string): Promise<Staff | null> {
    const found = [...this.staff.values()].find((s) => s.email === email);
    return found ? clone(found) : null;
  }

  async createStaff(input: CreateStaffInput): Promise<Staff> {
    const staff: Staff = {
      id: randomUUID(),
      email: input.email,
      passwordHash: input.passwordHash,
      name: input.name,
      role: input.role,
      active: input.active ?? true,
    };
    this.staff.set(staff.id, clone(staff));
    return clone(staff);
  }

  async getAppointment(id: string): Promise<Appointment | null> {
    const found = this.appointments.get(id);
    return found ? clone(found) : null;
  }

  async listAppointments(query: ListAppointmentsQuery): Promise<Appointment[]> {
    const fromMs = query.from.getTime();
    const toMs = query.to.getTime();
    return [...this.appointments.values()]
      .filter((a) => a.doctorId === query.doctorId)
      .filter((a) => a.start.getTime() >= fromMs && a.start.getTime() < toMs)
      .filter((a) => !query.statuses || query.statuses.includes(a.status))
      .map(clone);
  }

  async listAppointmentViews(
    query: AppointmentViewQuery,
  ): Promise<AppointmentView[]> {
    const fromMs = query.from.getTime();
    const toMs = query.to.getTime();
    const views: AppointmentView[] = [];
    for (const a of this.appointments.values()) {
      if (query.doctorId && a.doctorId !== query.doctorId) continue;
      if (a.start.getTime() < fromMs || a.start.getTime() >= toMs) continue;
      const doctor = this.doctors.get(a.doctorId);
      const patient = this.patients.get(a.patientId);
      views.push({
        id: a.id,
        doctorId: a.doctorId,
        patientId: a.patientId,
        start: a.start,
        end: a.end,
        status: a.status,
        createdAt: a.createdAt,
        doctorName: doctor?.name ?? "Unknown",
        department: doctor?.department ?? "",
        patientName: patient?.name ?? "Unknown",
        patientPhone: patient?.phone ?? "",
      });
    }
    views.sort((x, y) => x.start.getTime() - y.start.getTime());
    return views.map(clone);
  }

  async listAppointmentsForPatient(patientId: string): Promise<Appointment[]> {
    return [...this.appointments.values()]
      .filter((a) => a.patientId === patientId)
      .sort((x, y) => y.start.getTime() - x.start.getTime()) // newest first
      .map(clone);
  }

  async listAllAppointments(): Promise<Appointment[]> {
    return [...this.appointments.values()].map(clone);
  }

  async listUpcomingAppointmentsForPatient(
    patientId: string,
    from: Date,
  ): Promise<Appointment[]> {
    const fromMs = from.getTime();
    return [...this.appointments.values()]
      .filter(
        (a) =>
          a.patientId === patientId &&
          a.status === AppointmentStatus.BOOKED &&
          a.start.getTime() >= fromMs,
      )
      .sort((x, y) => x.start.getTime() - y.start.getTime())
      .map(clone);
  }

  async listBookedBetween(from: Date, to: Date): Promise<Appointment[]> {
    const fromMs = from.getTime();
    const toMs = to.getTime();
    return [...this.appointments.values()]
      .filter(
        (a) =>
          a.status === AppointmentStatus.BOOKED &&
          a.start.getTime() > fromMs &&
          a.start.getTime() <= toMs,
      )
      .sort((x, y) => x.start.getTime() - y.start.getTime())
      .map(clone);
  }

  async recordNotificationOnce(
    appointmentId: string,
    kind: string,
  ): Promise<boolean> {
    const key = `${appointmentId}::${kind}`;
    if (this.notifications.has(key)) return false;
    this.notifications.add(key);
    return true;
  }

  async deleteNotifications(
    appointmentId: string,
    kinds: string[],
  ): Promise<void> {
    for (const kind of kinds) {
      this.notifications.delete(`${appointmentId}::${kind}`);
    }
  }

  async findBookedSlot(
    doctorId: string,
    start: Date,
  ): Promise<Appointment | null> {
    const startMs = start.getTime();
    const found = [...this.appointments.values()].find(
      (a) =>
        a.doctorId === doctorId &&
        a.status === AppointmentStatus.BOOKED &&
        a.start.getTime() === startMs,
    );
    return found ? clone(found) : null;
  }

  async createAppointment(
    input: CreateAppointmentInput,
  ): Promise<Appointment> {
    const now = new Date();
    const appointment: Appointment = {
      id: randomUUID(),
      doctorId: input.doctorId,
      patientId: input.patientId,
      start: input.start,
      end: input.end,
      status: input.status,
      createdAt: now,
      updatedAt: now,
    };
    this.appointments.set(appointment.id, clone(appointment));
    return clone(appointment);
  }

  async updateAppointment(
    id: string,
    patch: UpdateAppointmentInput,
  ): Promise<Appointment> {
    const existing = this.appointments.get(id);
    if (!existing) throw new Error(`Appointment ${id} not found`);
    const updated: Appointment = {
      ...existing,
      ...(patch.start ? { start: patch.start } : {}),
      ...(patch.end ? { end: patch.end } : {}),
      ...(patch.status ? { status: patch.status } : {}),
      updatedAt: new Date(),
    };
    this.appointments.set(id, clone(updated));
    return clone(updated);
  }

  async appendEvent(input: AppendEventInput): Promise<AppointmentEvent> {
    const event: AppointmentEvent = {
      id: randomUUID(),
      appointmentId: input.appointmentId,
      type: input.type,
      at: new Date(),
      metadata: input.metadata,
    };
    this.events.push(clone(event));
    return clone(event);
  }

  async listEvents(appointmentId: string): Promise<AppointmentEvent[]> {
    return this.events
      .filter((e) => e.appointmentId === appointmentId)
      .map(clone);
  }

  async createBroadcast(input: CreateBroadcastInput): Promise<Broadcast> {
    const now = new Date();
    const broadcast: Broadcast = {
      id: randomUUID(),
      ...input,
      createdAt: now,
      updatedAt: now,
    };
    this.broadcasts.set(broadcast.id, clone(broadcast));
    return clone(broadcast);
  }

  async getBroadcast(id: string): Promise<Broadcast | null> {
    const found = this.broadcasts.get(id);
    return found ? clone(found) : null;
  }

  async listBroadcasts(query: ListBroadcastsQuery): Promise<Broadcast[]> {
    const term = query.search?.trim().toLowerCase();
    return [...this.broadcasts.values()]
      .filter((b) => !query.category || b.category === query.category)
      .filter((b) => !query.status || b.status === query.status)
      .filter((b) => !query.priority || b.priority === query.priority)
      .filter(
        (b) =>
          !term ||
          b.title.toLowerCase().includes(term) ||
          b.body.toLowerCase().includes(term),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(clone);
  }

  async updateBroadcast(
    id: string,
    patch: UpdateBroadcastInput,
  ): Promise<Broadcast> {
    const existing = this.broadcasts.get(id);
    if (!existing) throw new Error(`Broadcast ${id} not found`);
    const updated: Broadcast = {
      ...existing,
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.sentAt !== undefined ? { sentAt: patch.sentAt } : {}),
      ...(patch.recipientCount !== undefined
        ? { recipientCount: patch.recipientCount }
        : {}),
      updatedAt: new Date(),
    };
    this.broadcasts.set(id, clone(updated));
    return clone(updated);
  }

  async listDueBroadcasts(now: Date): Promise<Broadcast[]> {
    const nowMs = now.getTime();
    return [...this.broadcasts.values()]
      .filter(
        (b) =>
          b.status === BroadcastStatus.SCHEDULED &&
          b.scheduledAt !== null &&
          b.scheduledAt.getTime() <= nowMs,
      )
      .sort(
        (a, b) =>
          (a.scheduledAt?.getTime() ?? 0) - (b.scheduledAt?.getTime() ?? 0),
      )
      .map(clone);
  }

  async broadcastStats(): Promise<BroadcastStats> {
    let totalSent = 0;
    let totalReached = 0;
    let scheduled = 0;
    for (const b of this.broadcasts.values()) {
      if (b.status === BroadcastStatus.SENT) {
        totalSent++;
        totalReached += b.recipientCount;
      } else if (b.status === BroadcastStatus.SCHEDULED) {
        scheduled++;
      }
    }
    return { totalSent, totalReached, scheduled };
  }

  async transaction<T>(fn: (repo: Repository) => Promise<T>): Promise<T> {
    // Single-threaded, in-memory: running against `this` is effectively atomic.
    return fn(this);
  }
}
