import { Router } from "express";
import { z } from "zod";

import { ah } from "../async-handler.js";
import type { AppDeps } from "../deps.js";
import { requireAuth } from "../middleware/auth.js";

const E164 = /^\+[1-9]\d{6,14}$/;

const createPatientSchema = z.object({
  phone: z.string().regex(E164, "Phone must be E.164, e.g. +919876543210"),
  name: z.string().min(1),
  consent: z.boolean(),
});

const lookupSchema = z.object({
  phone: z.string().regex(E164, "Phone must be E.164"),
});

/** Patient lookup + creation (write route) — any authenticated staff. */
export function patientsRouter(deps: AppDeps): Router {
  const router = Router();
  router.use(requireAuth(deps));

  // Lookup by phone for the booking flow. Returns { patient: Patient | null }.
  router.get(
    "/",
    ah(async (req, res) => {
      const { phone } = lookupSchema.parse(req.query);
      const patient = await deps.repo.getPatientByPhone(phone);
      res.json({ patient });
    }),
  );

  router.post(
    "/",
    ah(async (req, res) => {
      const { phone, name, consent } = createPatientSchema.parse(req.body);
      const patient = await deps.repo.createPatient({
        phone,
        name,
        consentAt: consent ? new Date() : null,
      });
      res.status(201).json(patient);
    }),
  );

  return router;
}
