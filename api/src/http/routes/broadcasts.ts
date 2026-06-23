import { Router } from "express";
import { z } from "zod";

import { NotFoundError } from "../../domain/errors.js";
import type { BroadcastService } from "../../messaging/broadcasts.js";
import { ah } from "../async-handler.js";
import type { AppDeps } from "../deps.js";
import type { ListBroadcastsQuery } from "../../repository/repository.js";
import { requireAuth } from "../middleware/auth.js";

const CATEGORY_VALUES = [
  "MARKETING",
  "BOOTCAMP",
  "BLOOD_DONATION",
  "HEALTH_CAMP",
  "PROMOTION",
  "DOCTOR_UPDATE",
  "REMINDER",
  "EMERGENCY_NOTICE",
  "CUSTOM",
] as const;
const PRIORITY_VALUES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
const STATUS_VALUES = ["SCHEDULED", "SENT"] as const;

const createSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(120),
  body: z.string().trim().min(1, "Message is required").max(2000),
  category: z.enum(CATEGORY_VALUES),
  priority: z.enum(PRIORITY_VALUES).default("NORMAL"),
  // Omit/null = send now; an ISO string schedules it for later.
  scheduledAt: z.coerce.date().nullable().optional(),
});

const listQuerySchema = z.object({
  search: z.string().trim().optional(),
  category: z.enum(CATEGORY_VALUES).optional(),
  status: z.enum(STATUS_VALUES).optional(),
  priority: z.enum(PRIORITY_VALUES).optional(),
});

/** Broadcast messaging: compose/send, history with filters, and stats. */
export function broadcastsRouter(
  deps: AppDeps,
  broadcasts: BroadcastService,
): Router {
  const router = Router();
  router.use(requireAuth(deps));

  router.post(
    "/",
    ah(async (req, res) => {
      const input = createSchema.parse(req.body);
      const sender = { id: req.staff!.id, name: req.staff!.name };
      const broadcast = await broadcasts.create(
        {
          title: input.title,
          body: input.body,
          category: input.category,
          priority: input.priority,
          scheduledAt: input.scheduledAt ?? null,
        },
        sender,
      );
      res.status(201).json(broadcast);
    }),
  );

  router.get(
    "/",
    ah(async (req, res) => {
      const q = listQuerySchema.parse(req.query);
      const query: ListBroadcastsQuery = {
        ...(q.search ? { search: q.search } : {}),
        ...(q.category ? { category: q.category } : {}),
        ...(q.status ? { status: q.status } : {}),
        ...(q.priority ? { priority: q.priority } : {}),
      };
      res.json(await deps.repo.listBroadcasts(query));
    }),
  );

  router.get(
    "/stats",
    ah(async (_req, res) => {
      res.json(await deps.repo.broadcastStats());
    }),
  );

  router.get(
    "/:id",
    ah(async (req, res) => {
      const id = z.string().min(1).parse(req.params.id);
      const broadcast = await deps.repo.getBroadcast(id);
      if (!broadcast) throw new NotFoundError(`Broadcast ${id} not found`);
      res.json(broadcast);
    }),
  );

  return router;
}
