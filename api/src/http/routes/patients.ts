import { Router } from "express";
import { z } from "zod";

import { NotFoundError } from "../../domain/errors.js";
import { summarizePatientHistory } from "../../domain/patient-history.js";
import type { Appointment } from "../../domain/types.js";
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

const directoryQuerySchema = z.object({
  // Free-text filter over name / phone for the directory.
  q: z.string().trim().optional(),
});

/** Patient directory, history, lookup + creation — any authenticated staff. */
export function patientsRouter(deps: AppDeps): Router {
  const router = Router();
  router.use(requireAuth(deps));

  // GET /api/patients
  //   ?phone=…  -> { patient }     (booking-flow lookup, unchanged)
  //   otherwise -> { patients: [] } (directory with per-patient history stats)
  router.get(
    "/",
    ah(async (req, res) => {
      if (typeof req.query.phone === "string") {
        const { phone } = lookupSchema.parse(req.query);
        const patient = await deps.repo.getPatientByPhone(phone);
        res.json({ patient });
        return;
      }

      const { q } = directoryQuerySchema.parse(req.query);
      const [patients, appointments] = await Promise.all([
        deps.repo.listPatients(),
        deps.repo.listAllAppointments(),
      ]);

      const byPatient = new Map<string, Appointment[]>();
      for (const appt of appointments) {
        const list = byPatient.get(appt.patientId);
        if (list) list.push(appt);
        else byPatient.set(appt.patientId, [appt]);
      }

      const now = new Date();
      const term = q?.toLowerCase();
      const directory = patients
        .filter(
          (p) =>
            !term ||
            p.name.toLowerCase().includes(term) ||
            p.phone.includes(term),
        )
        .map((p) => ({
          id: p.id,
          name: p.name,
          phone: p.phone,
          consentAt: p.consentAt,
          ...summarizePatientHistory(byPatient.get(p.id) ?? [], now),
        }));

      res.json({ patients: directory });
    }),
  );

  // Full history + stats for one patient.
  router.get(
    "/:id",
    ah(async (req, res) => {
      const id = z.string().min(1).parse(req.params.id);
      const patient = await deps.repo.getPatient(id);
      if (!patient) throw new NotFoundError(`Patient ${id} not found`);

      const [appointments, doctors] = await Promise.all([
        deps.repo.listAppointmentsForPatient(id),
        deps.repo.listDoctors(),
      ]);
      const doctorById = new Map(doctors.map((d) => [d.id, d]));
      const summary = summarizePatientHistory(appointments, new Date());
      const history = appointments.map((a) => ({
        id: a.id,
        doctorId: a.doctorId,
        doctorName: doctorById.get(a.doctorId)?.name ?? "Unknown",
        department: doctorById.get(a.doctorId)?.department ?? "",
        start: a.start,
        end: a.end,
        status: a.status,
        createdAt: a.createdAt,
      }));

      res.json({ patient, summary, history });
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
