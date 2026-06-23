// Typed API client. All requests send the httpOnly auth cookie via
// credentials: "include". Responses are validated with zod.
import type { z } from "zod";

import {
  analyticsSchema,
  appointmentSchema,
  appointmentViewSchema,
  availabilitySchema,
  broadcastSchema,
  broadcastStatsSchema,
  doctorInsightsSchema,
  doctorSchema,
  patientDetailSchema,
  patientLookupSchema,
  patientSchema,
  patientsDirectorySchema,
  slotsResponseSchema,
  staffProfileSchema,
  type Analytics,
  type Appointment,
  type AppointmentView,
  type Availability,
  type Broadcast,
  type BroadcastCategory,
  type BroadcastPriority,
  type BroadcastStats,
  type BroadcastStatus,
  type Doctor,
  type DoctorInsights,
  type Patient,
  type PatientDetail,
  type PatientSummary,
  type StaffProfile,
} from "./schemas";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// A single place to react to a 401 (session expired) from anywhere in the app.
// Providers registers a handler that clears the cached auth state.
let unauthorizedHandler: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | undefined>;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  options: RequestOptions = {},
): Promise<T> {
  const res = await fetch(buildUrl(path, options.query), {
    method: options.method ?? "GET",
    credentials: "include",
    headers: options.body ? { "Content-Type": "application/json" } : {},
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    let code = "ERROR";
    let message = res.statusText;
    try {
      const data = (await res.json()) as { error?: { code?: string; message?: string } };
      code = data.error?.code ?? code;
      message = data.error?.message ?? message;
    } catch {
      // non-JSON error body; keep the status text
    }
    if (res.status === 401) unauthorizedHandler?.();
    throw new ApiError(res.status, code, message);
  }

  if (res.status === 204) return schema.parse(undefined);
  return schema.parse(await res.json());
}

// --- Auth ----------------------------------------------------------------
export function login(email: string, password: string): Promise<StaffProfile> {
  return request("/api/auth/login", staffProfileSchema, {
    method: "POST",
    body: { email, password },
  });
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
}

/** Returns the signed-in staff, or null if not authenticated. */
export async function getMe(): Promise<StaffProfile | null> {
  try {
    return await request("/api/auth/me", staffProfileSchema);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
}

// --- Doctors & availability ---------------------------------------------
export function listDoctors(): Promise<Doctor[]> {
  return request("/api/doctors", doctorSchema.array());
}

export function createDoctor(input: {
  name: string;
  phone?: string | null;
  department: string;
  slotDurationMinutes: number;
}): Promise<Doctor> {
  return request("/api/doctors", doctorSchema, { method: "POST", body: input });
}

export function updateDoctor(
  id: string,
  patch: { name?: string; phone?: string | null; department?: string; slotDurationMinutes?: number },
): Promise<Doctor> {
  return request(`/api/doctors/${id}`, doctorSchema, {
    method: "PATCH",
    body: patch,
  });
}

export function getAvailability(doctorId: string): Promise<Availability[]> {
  return request(`/api/doctors/${doctorId}/availability`, availabilitySchema.array());
}

export function replaceAvailability(
  doctorId: string,
  windows: Array<{ dayOfWeek: number; startMinutes: number; endMinutes: number }>,
): Promise<Availability[]> {
  return request(`/api/doctors/${doctorId}/availability`, availabilitySchema.array(), {
    method: "PUT",
    body: { windows },
  });
}

export async function getSlots(doctorId: string, date: string): Promise<string[]> {
  const res = await request(`/api/doctors/${doctorId}/slots`, slotsResponseSchema, {
    query: { date },
  });
  return res.slots;
}

/** Monthly demand analytics for a doctor. `month` is "YYYY-MM" (default: current). */
export function getDoctorInsights(
  doctorId: string,
  month?: string,
): Promise<DoctorInsights> {
  return request(`/api/doctors/${doctorId}/insights`, doctorInsightsSchema, {
    query: { month },
  });
}

// --- Analytics -----------------------------------------------------------
/** The full operational analytics dashboard payload. */
export function getAnalytics(): Promise<Analytics> {
  return request("/api/analytics/dashboard", analyticsSchema);
}

// --- Broadcasts ----------------------------------------------------------
export interface BroadcastFilters {
  search?: string;
  category?: BroadcastCategory;
  status?: BroadcastStatus;
  priority?: BroadcastPriority;
}

export function listBroadcasts(
  filters: BroadcastFilters = {},
): Promise<Broadcast[]> {
  return request("/api/broadcasts", broadcastSchema.array(), {
    query: {
      search: filters.search?.trim() ? filters.search.trim() : undefined,
      category: filters.category,
      status: filters.status,
      priority: filters.priority,
    },
  });
}

export function getBroadcastStats(): Promise<BroadcastStats> {
  return request("/api/broadcasts/stats", broadcastStatsSchema);
}

export function createBroadcast(input: {
  title: string;
  body: string;
  category: BroadcastCategory;
  priority: BroadcastPriority;
  /** ISO string to schedule for later; null/omitted sends immediately. */
  scheduledAt?: string | null;
}): Promise<Broadcast> {
  return request("/api/broadcasts", broadcastSchema, {
    method: "POST",
    body: input,
  });
}

// --- Appointments --------------------------------------------------------
export function listAppointments(
  date: string,
  doctorId?: string,
  to?: string,
): Promise<AppointmentView[]> {
  return request("/api/appointments", appointmentViewSchema.array(), {
    query: { date, to, doctorId },
  });
}

export function bookAppointment(input: {
  doctorId: string;
  patientId: string;
  start: string;
}): Promise<Appointment> {
  return request("/api/appointments", appointmentSchema, {
    method: "POST",
    body: input,
  });
}

export function cancelAppointment(id: string): Promise<Appointment> {
  return request(`/api/appointments/${id}/cancel`, appointmentSchema, {
    method: "POST",
  });
}

export function rescheduleAppointment(
  id: string,
  startIso: string,
): Promise<Appointment> {
  return request(`/api/appointments/${id}/reschedule`, appointmentSchema, {
    method: "POST",
    body: { start: startIso },
  });
}

// --- Patients ------------------------------------------------------------
export async function findPatientByPhone(phone: string): Promise<Patient | null> {
  const res = await request("/api/patients", patientLookupSchema, {
    query: { phone },
  });
  return res.patient;
}

export function createPatient(input: {
  phone: string;
  name: string;
  consent: boolean;
}): Promise<Patient> {
  return request("/api/patients", patientSchema, { method: "POST", body: input });
}

/** Patient directory with per-patient history counts. `q` filters name/phone. */
export async function listPatients(q?: string): Promise<PatientSummary[]> {
  const res = await request("/api/patients", patientsDirectorySchema, {
    query: { q: q?.trim() ? q.trim() : undefined },
  });
  return res.patients;
}

/** A single patient's full appointment history + summary stats. */
export function getPatientDetail(id: string): Promise<PatientDetail> {
  return request(`/api/patients/${id}`, patientDetailSchema);
}
