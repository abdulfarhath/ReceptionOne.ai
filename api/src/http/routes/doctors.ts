import { Router } from "express";
import { z } from "zod";

import { StaffRole } from "../../auth/staff.js";
import { SchedulingService } from "../../domain/scheduling.js";
import { ah } from "../async-handler.js";
import type { AppDeps } from "../deps.js";
import type { UpdateDoctorInput } from "../../repository/repository.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const createDoctorSchema = z.object({
  name: z.string().min(1),
  department: z.string().min(1),
  slotDurationMinutes: z.number().int().positive().max(480),
});

const updateDoctorSchema = z
  .object({
    name: z.string().min(1).optional(),
    department: z.string().min(1).optional(),
    slotDurationMinutes: z.number().int().positive().max(480).optional(),
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

// A calendar day (UTC) — clinic hours don't cross the UTC/IST date boundary.
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

/** Doctor + availability management. Reads need auth; writes need ADMIN. */
export function doctorsRouter(deps: AppDeps): Router {
  const router = Router();
  const scheduling = new SchedulingService(deps.repo);
  router.use(requireAuth(deps));

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
      res.status(201).json(await deps.repo.createDoctor(body));
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
      if (body.department !== undefined) patch.department = body.department;
      if (body.slotDurationMinutes !== undefined) {
        patch.slotDurationMinutes = body.slotDurationMinutes;
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

  router.get(
    "/:doctorId/slots",
    ah(async (req, res) => {
      const doctorId = z.string().min(1).parse(req.params.doctorId);
      const date = dateSchema.parse(req.query.date);
      const day = new Date(`${date}T00:00:00.000Z`);
      const slots = await scheduling.getAvailableSlots(doctorId, day);
      res.json({ slots: slots.map((s) => s.toISOString()) });
    }),
  );

  return router;
}
