import { Router } from "express";
import { z } from "zod";

import { SchedulingService } from "../../domain/scheduling.js";
import type { Appointment } from "../../domain/types.js";
import { ah } from "../async-handler.js";
import type { AppDeps } from "../deps.js";
import { requireAuth } from "../middleware/auth.js";

const DAY_MS = 86_400_000;

const bookSchema = z.object({
  doctorId: z.string().min(1),
  patientId: z.string().min(1),
  start: z.coerce.date(),
});

const rescheduleSchema = z.object({
  start: z.coerce.date(),
});

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const listQuerySchema = z.object({
  date: z.string().regex(DATE, "Use YYYY-MM-DD"),
  // Optional inclusive range end (UTC day). When given, returns date..to.
  to: z.string().regex(DATE, "Use YYYY-MM-DD").optional(),
  doctorId: z.string().min(1).optional(),
});

/** Appointment read + write routes — any authenticated staff. */
export function appointmentsRouter(deps: AppDeps): Router {
  const router = Router();
  const service = new SchedulingService(deps.repo);
  router.use(requireAuth(deps));

  router.get(
    "/",
    ah(async (req, res) => {
      const { date, to, doctorId } = listQuerySchema.parse(req.query);
      const from = new Date(`${date}T00:00:00.000Z`);
      // `to` is an inclusive end day, so add a day to make the upper bound exclusive.
      const end = to
        ? new Date(new Date(`${to}T00:00:00.000Z`).getTime() + DAY_MS)
        : new Date(from.getTime() + DAY_MS);
      const views = await deps.repo.listAppointmentViews({
        from,
        to: end,
        ...(doctorId ? { doctorId } : {}),
      });
      res.json(views);
    }),
  );

  // Fire a confirmation without blocking the HTTP response or failing the op.
  const notify = (
    appointment: Appointment,
    kind: "booked" | "rescheduled" | "cancelled",
  ): void => {
    deps.notifications
      ?.confirm(appointment, kind)
      .catch((err) => deps.logger.error({ err }, "confirmation failed"));
  };

  router.post(
    "/",
    ah(async (req, res) => {
      const { doctorId, patientId, start } = bookSchema.parse(req.body);
      const appointment = await service.book({ doctorId, patientId, start });
      notify(appointment, "booked");
      res.status(201).json(appointment);
    }),
  );

  router.post(
    "/:id/reschedule",
    ah(async (req, res) => {
      const id = z.string().min(1).parse(req.params.id);
      const { start } = rescheduleSchema.parse(req.body);
      const appointment = await service.reschedule({
        appointmentId: id,
        newStart: start,
      });
      notify(appointment, "rescheduled");
      res.json(appointment);
    }),
  );

  router.post(
    "/:id/cancel",
    ah(async (req, res) => {
      const id = z.string().min(1).parse(req.params.id);
      const appointment = await service.cancel(id);
      notify(appointment, "cancelled");
      res.json(appointment);
    }),
  );

  return router;
}
