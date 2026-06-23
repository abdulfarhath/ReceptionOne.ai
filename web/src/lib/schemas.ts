// Zod schemas for API responses. Responses are external input to the web app,
// so we validate them before use.
import { z } from "zod";

export const staffRoleSchema = z.enum(["ADMIN", "RECEPTIONIST"]);
export type StaffRole = z.infer<typeof staffRoleSchema>;

export const staffProfileSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role: staffRoleSchema,
  active: z.boolean(),
});
export type StaffProfile = z.infer<typeof staffProfileSchema>;

export const doctorSchema = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string().nullable().optional(),
  department: z.string(),
  slotDurationMinutes: z.number(),
});
export type Doctor = z.infer<typeof doctorSchema>;

export const availabilitySchema = z.object({
  id: z.string(),
  doctorId: z.string(),
  dayOfWeek: z.number(),
  startMinutes: z.number(),
  endMinutes: z.number(),
});
export type Availability = z.infer<typeof availabilitySchema>;

export const patientSchema = z.object({
  id: z.string(),
  phone: z.string(),
  name: z.string(),
  consentAt: z.string().nullable(),
});
export type Patient = z.infer<typeof patientSchema>;

export const appointmentStatusSchema = z.enum([
  "BOOKED",
  "CANCELLED",
  "COMPLETED",
]);
export type AppointmentStatus = z.infer<typeof appointmentStatusSchema>;

export const appointmentSchema = z.object({
  id: z.string(),
  doctorId: z.string(),
  patientId: z.string(),
  start: z.string(),
  end: z.string(),
  status: appointmentStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Appointment = z.infer<typeof appointmentSchema>;

export const appointmentViewSchema = z.object({
  id: z.string(),
  doctorId: z.string(),
  patientId: z.string(),
  start: z.string(),
  end: z.string(),
  status: appointmentStatusSchema,
  createdAt: z.string(),
  doctorName: z.string(),
  department: z.string(),
  patientName: z.string(),
  patientPhone: z.string(),
});
export type AppointmentView = z.infer<typeof appointmentViewSchema>;

export const slotsResponseSchema = z.object({ slots: z.array(z.string()) });
export const patientLookupSchema = z.object({
  patient: patientSchema.nullable(),
});

// --- Patient history -----------------------------------------------------
export const patientHistorySummarySchema = z.object({
  total: z.number(),
  upcoming: z.number(),
  completed: z.number(),
  cancelled: z.number(),
  firstVisitAt: z.string().nullable(),
  lastVisitAt: z.string().nullable(),
  nextAppointmentAt: z.string().nullable(),
});
export type PatientHistorySummary = z.infer<typeof patientHistorySummarySchema>;

/** A row in the patient directory: identity + history counts. */
export const patientSummarySchema = patientHistorySummarySchema.extend({
  id: z.string(),
  name: z.string(),
  phone: z.string(),
  consentAt: z.string().nullable(),
});
export type PatientSummary = z.infer<typeof patientSummarySchema>;

export const patientsDirectorySchema = z.object({
  patients: z.array(patientSummarySchema),
});

/** One appointment in a patient's timeline (joined with doctor). */
export const patientAppointmentSchema = z.object({
  id: z.string(),
  doctorId: z.string(),
  doctorName: z.string(),
  department: z.string(),
  start: z.string(),
  end: z.string(),
  status: appointmentStatusSchema,
  createdAt: z.string(),
});
export type PatientAppointment = z.infer<typeof patientAppointmentSchema>;

export const patientDetailSchema = z.object({
  patient: patientSchema.extend({ language: z.string().optional() }),
  summary: patientHistorySummarySchema,
  history: z.array(patientAppointmentSchema),
});
export type PatientDetail = z.infer<typeof patientDetailSchema>;

// --- Doctor insights -----------------------------------------------------
export const doctorDayDemandSchema = z.object({
  date: z.string(),
  booked: z.number(),
  completed: z.number(),
  cancelled: z.number(),
  visits: z.number(),
});
export type DoctorDayDemand = z.infer<typeof doctorDayDemandSchema>;

export const doctorDemandSummarySchema = z.object({
  totalBooked: z.number(),
  totalCompleted: z.number(),
  totalCancelled: z.number(),
  totalVisits: z.number(),
  busiestDate: z.string().nullable(),
  busiestCount: z.number(),
  averagePerDay: z.number(),
  perDay: z.array(doctorDayDemandSchema),
});
export type DoctorDemandSummary = z.infer<typeof doctorDemandSummarySchema>;

export const doctorInsightsSchema = z.object({
  doctor: z.object({
    id: z.string(),
    name: z.string(),
    department: z.string(),
  }),
  month: z.string(),
  range: z.object({ from: z.string(), to: z.string() }),
  summary: doctorDemandSummarySchema,
});
export type DoctorInsights = z.infer<typeof doctorInsightsSchema>;

// --- Analytics dashboard -------------------------------------------------
export const doctorUtilizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  department: z.string(),
  bookedToday: z.number(),
  capacityToday: z.number(),
  utilizationPct: z.number(),
  openToday: z.number(),
  openThisWeek: z.number(),
  totalBooked: z.number(),
  estNoShows: z.number(),
});
export type DoctorUtilization = z.infer<typeof doctorUtilizationSchema>;

export const demandPointSchema = z.object({
  key: z.string(),
  label: z.string(),
  bookings: z.number(),
});
export type DemandPoint = z.infer<typeof demandPointSchema>;

export const heatmapCellSchema = z.object({
  weekday: z.number(),
  hour: z.number(),
  bookings: z.number(),
});
export type HeatmapCell = z.infer<typeof heatmapCellSchema>;

export const analyticsSchema = z.object({
  generatedAt: z.string(),
  today: z.string(),
  doctors: z.array(doctorUtilizationSchema),
  demand: z.object({
    daily: z.array(demandPointSchema),
    weekly: z.array(demandPointSchema),
    monthly: z.array(demandPointSchema),
    hourly: z.array(z.object({ hour: z.number(), bookings: z.number() })),
    weekday: z.array(z.object({ weekday: z.number(), bookings: z.number() })),
  }),
  heatmap: z.object({
    hours: z.array(z.number()),
    max: z.number(),
    cells: z.array(heatmapCellSchema),
  }),
  patients: z.object({
    totalPatients: z.number(),
    newPatients: z.number(),
    returningPatients: z.number(),
    returningPct: z.number(),
    retentionPct: z.number(),
  }),
});
export type Analytics = z.infer<typeof analyticsSchema>;

// --- Broadcasts ----------------------------------------------------------
export const broadcastCategorySchema = z.enum([
  "MARKETING",
  "BOOTCAMP",
  "BLOOD_DONATION",
  "HEALTH_CAMP",
  "PROMOTION",
  "DOCTOR_UPDATE",
  "REMINDER",
  "EMERGENCY_NOTICE",
  "CUSTOM",
]);
export type BroadcastCategory = z.infer<typeof broadcastCategorySchema>;

export const broadcastPrioritySchema = z.enum([
  "LOW",
  "NORMAL",
  "HIGH",
  "URGENT",
]);
export type BroadcastPriority = z.infer<typeof broadcastPrioritySchema>;

export const broadcastStatusSchema = z.enum(["SCHEDULED", "SENT"]);
export type BroadcastStatus = z.infer<typeof broadcastStatusSchema>;

export const broadcastSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  category: broadcastCategorySchema,
  priority: broadcastPrioritySchema,
  status: broadcastStatusSchema,
  scheduledAt: z.string().nullable(),
  sentAt: z.string().nullable(),
  recipientCount: z.number(),
  createdById: z.string(),
  createdByName: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Broadcast = z.infer<typeof broadcastSchema>;

export const broadcastStatsSchema = z.object({
  totalSent: z.number(),
  totalReached: z.number(),
  scheduled: z.number(),
});
export type BroadcastStats = z.infer<typeof broadcastStatsSchema>;
