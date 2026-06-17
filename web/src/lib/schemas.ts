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
