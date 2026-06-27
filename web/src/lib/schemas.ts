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
  avgConsultMinutes: z.number(),
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
  "WAITING",
  "ARRIVED",
  "IN_PROGRESS",
  "DONE",
  "NO_SHOW",
  "CANCELLED",
]);
export type AppointmentStatus = z.infer<typeof appointmentStatusSchema>;

/** Day-board read model: a queue entry joined with doctor + patient. */
export const appointmentViewSchema = z.object({
  id: z.string(),
  doctorId: z.string(),
  patientId: z.string(),
  queueDate: z.string(),
  token: z.number(),
  isWalkIn: z.boolean(),
  isPriority: z.boolean(),
  onHold: z.boolean(),
  status: appointmentStatusSchema,
  arrivedAt: z.string().nullable(),
  startedAt: z.string().nullable(),
  doneAt: z.string().nullable(),
  createdAt: z.string(),
  doctorName: z.string(),
  department: z.string(),
  patientName: z.string(),
  patientPhone: z.string(),
});
export type AppointmentView = z.infer<typeof appointmentViewSchema>;

export const patientLookupSchema = z.object({
  patient: patientSchema.nullable(),
});

// --- Live queue ----------------------------------------------------------
export const queueEntryViewSchema = z.object({
  id: z.string(),
  token: z.number(),
  status: appointmentStatusSchema,
  isWalkIn: z.boolean(),
  isPriority: z.boolean(),
  onHold: z.boolean(),
  patientName: z.string(),
  patientPhone: z.string(),
  position: z.number(),
  estimateWaitMinutes: z.number(),
  /** Scheduled-token target (ISO, UTC); null for immediate tokens. */
  targetTime: z.string().nullable(),
  arrivedAt: z.string().nullable(),
  startedAt: z.string().nullable(),
  doneAt: z.string().nullable(),
});
export type QueueEntryView = z.infer<typeof queueEntryViewSchema>;

export const queueBoardSchema = z.object({
  /** Scheduled ("come at my own time") tokens not yet activated. */
  upcoming: z.array(queueEntryViewSchema),
  traveling: z.array(queueEntryViewSchema),
  waitingHere: z.array(queueEntryViewSchema),
  inProgress: z.array(queueEntryViewSchema),
  done: z.array(queueEntryViewSchema),
  noShow: z.array(queueEntryViewSchema),
});
export type QueueBoard = z.infer<typeof queueBoardSchema>;

export const quoteResultSchema = z.object({
  peopleAhead: z.number(),
  estimateWaitMinutes: z.number(),
  estimateMinMinutes: z.number(),
  estimateMaxMinutes: z.number(),
  suggestedArrival: z.string(),
});
export type QuoteResult = z.infer<typeof quoteResultSchema>;

/** A scheduled-token window estimate: a band around the target, never a minute. */
export const scheduledQuoteResultSchema = z.object({
  aroundTime: z.string(),
  windowMinMinutes: z.number(),
  windowMaxMinutes: z.number(),
  comeBy: z.string(),
  alreadyScheduledInWindow: z.number(),
  likelySeenBy: z.string().optional(),
});
export type ScheduledQuoteResult = z.infer<typeof scheduledQuoteResultSchema>;

/** Patient-facing join result: an honest range/window, never token/position. */
export const joinResultSchema = z.object({
  bookingId: z.string(),
  estimateMinMinutes: z.number(),
  estimateMaxMinutes: z.number(),
  suggestedArrival: z.string(),
  priorityWarning: z.string().optional(),
  /** Scheduled ("come at my own time") token: a window + come-by time. */
  scheduled: z.boolean().optional(),
  aroundTime: z.string().optional(),
  comeBy: z.string().optional(),
});
export type JoinResult = z.infer<typeof joinResultSchema>;

/** A single queue entry (a write/transition result). */
export const queueEntrySchema = z.object({
  id: z.string(),
  doctorId: z.string(),
  patientId: z.string(),
  queueDate: z.string(),
  token: z.number(),
  isWalkIn: z.boolean(),
  isPriority: z.boolean(),
  onHold: z.boolean(),
  status: appointmentStatusSchema,
  targetTime: z.string().nullable().optional(),
  arrivedAt: z.string().nullable(),
  startedAt: z.string().nullable(),
  doneAt: z.string().nullable(),
  lastNotifiedMaxMinutes: z.number().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type QueueEntry = z.infer<typeof queueEntrySchema>;

// --- Patient history -----------------------------------------------------
export const patientHistorySummarySchema = z.object({
  total: z.number(),
  active: z.number(),
  completed: z.number(),
  cancelled: z.number(),
  noShow: z.number(),
  firstVisitAt: z.string().nullable(),
  lastVisitAt: z.string().nullable(),
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

/** One queue entry in a patient's timeline (joined with doctor). */
export const patientAppointmentSchema = z.object({
  id: z.string(),
  doctorId: z.string(),
  doctorName: z.string(),
  department: z.string(),
  queueDate: z.string(),
  token: z.number(),
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
  joined: z.number(),
  done: z.number(),
  noShow: z.number(),
  cancelled: z.number(),
});
export type DoctorDayDemand = z.infer<typeof doctorDayDemandSchema>;

export const doctorDemandSummarySchema = z.object({
  totalJoined: z.number(),
  totalDone: z.number(),
  totalNoShow: z.number(),
  totalCancelled: z.number(),
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
export const doctorActivitySchema = z.object({
  id: z.string(),
  name: z.string(),
  department: z.string(),
  joinedToday: z.number(),
  doneToday: z.number(),
  noShowToday: z.number(),
  totalDone: z.number(),
  noShows: z.number(),
  avgConsultMinutes: z.number().nullable(),
});
export type DoctorActivity = z.infer<typeof doctorActivitySchema>;

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
  doctors: z.array(doctorActivitySchema),
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
