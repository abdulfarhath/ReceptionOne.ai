import { Router } from "express";
import { z } from "zod";

import type { Appointment } from "../../domain/types.js";
import { SchedulingService, toQueueDate } from "../../domain/scheduling.js";
import { ah } from "../async-handler.js";
import type { AppDeps } from "../deps.js";
import { requireAuth } from "../middleware/auth.js";

const E164 = /^\+[1-9]\d{6,14}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Resolve an optional YYYY-MM-DD to the queue day; default to today. */
function queueDateFrom(date?: string): Date {
  return toQueueDate(date ? new Date(`${date}T00:00:00.000Z`) : new Date());
}

/** Scheduled-token tunables shared across routes (env, with defaults). */
export function schedulingTuning(): {
  scheduledLeadMin?: number;
  arrivalBufferMin?: number;
} {
  const lead = Number(process.env.SCHEDULED_LEAD_MIN);
  const buffer = Number(process.env.ARRIVAL_BUFFER_MIN);
  return {
    ...(Number.isFinite(lead) ? { scheduledLeadMin: lead } : {}),
    ...(Number.isFinite(buffer) ? { arrivalBufferMin: buffer } : {}),
  };
}

const joinSchema = z.object({
  doctorId: z.string().min(1),
  date: z.string().regex(DATE, "Use YYYY-MM-DD").optional(),
  patientName: z.string().trim().min(1),
  patientPhone: z.string().regex(E164, "Phone must be E.164"),
  isPriority: z.boolean().optional(),
  isWalkIn: z.boolean().optional(),
  priorityReason: z.string().trim().min(1).optional(),
  /** "Come at my own time": optional preferred target (ISO datetime, UTC). */
  targetTime: z.string().datetime().optional(),
});

const reinstateSchema = z.object({
  mode: z.enum(["back", "priority"]),
  reason: z.string().trim().min(1, "A reason is required"),
});

/** Booking (queue entry) lifecycle routes — any authenticated staff. */
export function bookingsRouter(deps: AppDeps): Router {
  const router = Router();
  const maxPriority = Number(process.env.MAX_PRIORITY_PER_DAY);
  const service = new SchedulingService(deps.repo, undefined, {
    ...(Number.isFinite(maxPriority) ? { maxPriorityPerDay: maxPriority } : {}),
    ...schedulingTuning(),
  });
  router.use(requireAuth(deps));

  // After any change that can move the front of the queue, nudge the next person.
  const nudge = (appt: Appointment): void => {
    deps.queueNotifier?.notifyFront(appt.doctorId, appt.queueDate);
  };

  // Join the queue (take the next token).
  router.post(
    "/",
    ah(async (req, res) => {
      const input = joinSchema.parse(req.body);
      const target = input.targetTime ? new Date(input.targetTime) : null;
      const result = await service.joinQueue({
        doctorId: input.doctorId,
        // A scheduled token's queue day follows its target; else the given date/today.
        date: target ?? queueDateFrom(input.date),
        patientName: input.patientName,
        patientPhone: input.patientPhone,
        ...(input.isPriority !== undefined ? { isPriority: input.isPriority } : {}),
        ...(input.isWalkIn !== undefined ? { isWalkIn: input.isWalkIn } : {}),
        ...(input.priorityReason ? { priorityReason: input.priorityReason } : {}),
        ...(target ? { targetTime: target } : {}),
      });
      const entry = await deps.repo.getAppointment(result.bookingId);
      if (entry) nudge(entry);
      res.status(201).json(result);
    }),
  );

  // Reinstate a late no-show: fresh token ("back") or priority. Reason required.
  router.post(
    "/:id/reinstate",
    ah(async (req, res) => {
      const id = z.string().min(1).parse(req.params.id);
      const { mode, reason } = reinstateSchema.parse(req.body);
      const appt = await service.reinstate(id, mode, reason);
      nudge(appt);
      res.json(appt);
    }),
  );

  router.get(
    "/:id",
    ah(async (req, res) => {
      const id = z.string().min(1).parse(req.params.id);
      res.json(await service.statusOf(id));
    }),
  );

  // Lifecycle transitions: run, then nudge the new front.
  const transition = (
    path: string,
    fn: (id: string) => Promise<Appointment>,
  ): void => {
    router.post(
      path,
      ah(async (req, res) => {
        const id = z.string().min(1).parse(req.params.id);
        const appt = await fn(id);
        nudge(appt);
        res.json(appt);
      }),
    );
  };
  transition("/:id/checkin", (id) => service.checkIn(id));
  transition("/:id/start", (id) => service.startVisit(id));
  transition("/:id/complete", (id) => service.complete(id));
  transition("/:id/no-show", (id) => service.markNoShow(id));
  transition("/:id/cancel", (id) => service.cancel(id));
  transition("/:id/hold", (id) => service.hold(id));

  return router;
}
