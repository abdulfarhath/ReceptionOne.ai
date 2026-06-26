import { Router } from "express";
import { z } from "zod";

import { StaffRole } from "../../auth/staff.js";
import { NotFoundError } from "../../domain/errors.js";
import { summarizeDoctorDemand } from "../../domain/doctor-insights.js";
import { SchedulingService, toQueueDate } from "../../domain/scheduling.js";
import { ah } from "../async-handler.js";
import type { AppDeps } from "../deps.js";
import type { UpdateDoctorInput } from "../../repository/repository.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const dateQuerySchema = z.object({
  date: z.string().regex(DATE, "Use YYYY-MM-DD").optional(),
});
const queueDateFrom = (date?: string): Date =>
  toQueueDate(date ? new Date(`${date}T00:00:00.000Z`) : new Date());

// The clinic operates in IST; demand is bucketed by IST calendar day/month.
const istDayFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const istDayKey = (d: Date): string => istDayFmt.format(d);
const monthSchema = z.string().regex(/^\d{4}-\d{2}$/, "Use YYYY-MM");

/** UTC bounds + the ordered IST day keys for an IST calendar month "YYYY-MM". */
function monthRange(month: string): { from: Date; to: Date; dayKeys: string[] } {
  const [y, m] = month.split("-").map((n) => Number.parseInt(n, 10));
  const next =
    m === 12 ? `${y! + 1}-01` : `${y}-${String(m! + 1).padStart(2, "0")}`;
  // IST is UTC+5:30; parsing with the offset yields the correct UTC instant.
  const from = new Date(`${month}-01T00:00:00+05:30`);
  const to = new Date(`${next}-01T00:00:00+05:30`);
  const daysInMonth = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  const dayKeys = Array.from(
    { length: daysInMonth },
    (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`,
  );
  return { from, to, dayKeys };
}

const phoneSchema = z.string().min(1).transform(val => {
  let cleaned = val.replace(/[\s()-]/g, "");
  if (cleaned.length === 10 && /^\d+$/.test(cleaned)) {
    cleaned = `+91${cleaned}`;
  }
  return cleaned;
});

const createDoctorSchema = z.object({
  name: z.string().min(1),
  phone: phoneSchema.optional().nullable(),
  department: z.string().min(1),
  // Legacy; still accepted for back-compat but unused by the queue model.
  slotDurationMinutes: z.number().int().positive().max(480).default(30),
  avgConsultMinutes: z.number().int().positive().max(480).default(15),
});

const updateDoctorSchema = z
  .object({
    name: z.string().min(1).optional(),
    phone: phoneSchema.optional().nullable(),
    department: z.string().min(1).optional(),
    slotDurationMinutes: z.number().int().positive().max(480).optional(),
    avgConsultMinutes: z.number().int().positive().max(480).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: "At least one field is required",
  });

const windowSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    startMinutes: z.number().int().min(0).max(1440),
    endMinutes: z.number().int().min(0).max(1440),
  })
  .refine((d) => d.endMinutes > d.startMinutes, {
    message: "endMinutes must be after startMinutes",
  });

const replaceAvailabilitySchema = z.object({
  windows: z.array(windowSchema),
});

/** Doctor + availability management. Reads need auth; writes need ADMIN. */
export function doctorsRouter(deps: AppDeps): Router {
  const router = Router();
  const scheduling = new SchedulingService(deps.repo);
  router.use(requireAuth(deps));

  // Estimate BEFORE booking (people ahead, wait, suggested arrival).
  router.get(
    "/:id/quote",
    ah(async (req, res) => {
      const id = z.string().min(1).parse(req.params.id);
      const { date } = dateQuerySchema.parse(req.query);
      res.json(await scheduling.quote(id, queueDateFrom(date)));
    }),
  );

  // Grouped live queue board for one doctor.
  router.get(
    "/:id/queue",
    ah(async (req, res) => {
      const id = z.string().min(1).parse(req.params.id);
      const { date } = dateQuerySchema.parse(req.query);
      res.json(await scheduling.getQueue(id, queueDateFrom(date)));
    }),
  );

  router.get(
    "/",
    ah(async (_req, res) => {
      res.json(await deps.repo.listDoctors());
    }),
  );

  router.post(
    "/",
    requireRole(StaffRole.ADMIN),
    ah(async (req, res) => {
      const body = createDoctorSchema.parse(req.body);
      res.status(201).json(await deps.repo.createDoctor({ ...body, phone: body.phone ?? null }));
    }),
  );

  router.patch(
    "/:doctorId",
    requireRole(StaffRole.ADMIN),
    ah(async (req, res) => {
      const doctorId = z.string().min(1).parse(req.params.doctorId);
      const body = updateDoctorSchema.parse(req.body);
      const patch: UpdateDoctorInput = {};
      if (body.name !== undefined) patch.name = body.name;
      if (body.phone !== undefined) patch.phone = body.phone;
      if (body.department !== undefined) patch.department = body.department;
      if (body.slotDurationMinutes !== undefined) {
        patch.slotDurationMinutes = body.slotDurationMinutes;
      }
      if (body.avgConsultMinutes !== undefined) {
        patch.avgConsultMinutes = body.avgConsultMinutes;
      }
      res.json(await deps.repo.updateDoctor(doctorId, patch));
    }),
  );

  router.get(
    "/:doctorId/availability",
    ah(async (req, res) => {
      const doctorId = z.string().min(1).parse(req.params.doctorId);
      res.json(await deps.repo.listAvailability(doctorId));
    }),
  );

  router.put(
    "/:doctorId/availability",
    requireRole(StaffRole.ADMIN),
    ah(async (req, res) => {
      const doctorId = z.string().min(1).parse(req.params.doctorId);
      const { windows } = replaceAvailabilitySchema.parse(req.body);
      res.json(await deps.repo.replaceAvailability(doctorId, windows));
    }),
  );

  // Demand analytics for one doctor over an IST calendar month (default: current).
  router.get(
    "/:doctorId/insights",
    ah(async (req, res) => {
      const doctorId = z.string().min(1).parse(req.params.doctorId);
      const month =
        req.query.month === undefined
          ? istDayKey(new Date()).slice(0, 7)
          : monthSchema.parse(req.query.month);

      const doctor = await deps.repo.getDoctor(doctorId);
      if (!doctor) throw new NotFoundError(`Doctor ${doctorId} not found`);

      const { from, to, dayKeys } = monthRange(month);
      const fromMs = from.getTime();
      const toMs = to.getTime();
      const appointments = (await deps.repo.listAllAppointments()).filter(
        (a) =>
          a.doctorId === doctorId &&
          a.queueDate.getTime() >= fromMs &&
          a.queueDate.getTime() < toMs,
      );
      const summary = summarizeDoctorDemand(appointments, dayKeys, istDayKey);

      res.json({
        doctor: {
          id: doctor.id,
          name: doctor.name,
          department: doctor.department,
        },
        month,
        range: { from: from.toISOString(), to: to.toISOString() },
        summary,
      });
    }),
  );

  return router;
}
