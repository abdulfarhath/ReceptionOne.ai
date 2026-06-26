import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import pino from "pino";

import { InMemoryRepository } from "../repository/in-memory.js";
import { hashPassword } from "../auth/passwords.js";
import { StaffRole } from "../auth/staff.js";
import { AppointmentStatus } from "../domain/types.js";
import { createApp } from "./app.js";
import type { AppConfig } from "./deps.js";

const config: AppConfig = {
  jwtSecret: "test-secret",
  jwtExpiresInSeconds: 3600,
  cookieName: "session",
  cookieSecure: false,
};
const logger = pino({ level: "silent" });
const STAFF = { email: "recept@clinic.test", password: "receptpass" };

const PAST = new Date("2020-01-01T09:00:00.000Z");
const FUTURE = new Date("2999-01-01T09:00:00.000Z");

async function buildApp() {
  const repo = new InMemoryRepository();
  await repo.createStaff({
    email: STAFF.email,
    passwordHash: await hashPassword(STAFF.password, 4),
    name: "Reception",
    role: StaffRole.RECEPTIONIST,
  });
  const doctor = repo.addDoctor({
    id: "doc1",
    name: "Dr. Test",
    phone: null,
    department: "General",
    slotDurationMinutes: 30,
    avgConsultMinutes: 10,
  });
  const patient = repo.addPatient({
    id: "pat1",
    phone: "+919999999999",
    name: "Riya Sharma",
    language: "en",
    consentAt: PAST,
  });
  let token = 0;
  const mk = (queueDate: Date, status: AppointmentStatus) =>
    repo.createAppointment({
      doctorId: doctor.id,
      patientId: patient.id,
      queueDate,
      token: ++token,
      isWalkIn: false,
      isPriority: false,
      status,
    });
  await mk(PAST, AppointmentStatus.DONE);
  await mk(FUTURE, AppointmentStatus.WAITING);
  await mk(new Date("2021-05-01T00:00:00.000Z"), AppointmentStatus.CANCELLED);

  return { app: createApp({ repo, config, logger }), patientId: patient.id };
}

describe("patient history endpoints", () => {
  let env: Awaited<ReturnType<typeof buildApp>>;
  let agent: ReturnType<typeof request.agent>;

  beforeEach(async () => {
    env = await buildApp();
    agent = request.agent(env.app);
    await agent.post("/api/auth/login").send(STAFF);
  });

  it("requires auth", async () => {
    const res = await request(env.app).get("/api/patients");
    expect(res.status).toBe(401);
  });

  it("returns the directory with per-patient history counts", async () => {
    const res = await agent.get("/api/patients");
    expect(res.status).toBe(200);
    expect(res.body.patients).toHaveLength(1);
    expect(res.body.patients[0]).toMatchObject({
      name: "Riya Sharma",
      total: 3,
      active: 1,
      completed: 1,
      cancelled: 1,
    });
  });

  it("filters the directory by the q term", async () => {
    expect((await agent.get("/api/patients?q=riya")).body.patients).toHaveLength(1);
    expect((await agent.get("/api/patients?q=nobody")).body.patients).toHaveLength(0);
  });

  it("still supports phone lookup for the booking flow", async () => {
    // %2B is the encoded "+" (raw "+" in a query string decodes to a space).
    const res = await agent.get("/api/patients?phone=%2B919999999999");
    expect(res.status).toBe(200);
    expect(res.body.patient).toMatchObject({ name: "Riya Sharma" });
  });

  it("returns full history + summary for one patient", async () => {
    const res = await agent.get(`/api/patients/${env.patientId}`);
    expect(res.status).toBe(200);
    expect(res.body.patient.name).toBe("Riya Sharma");
    expect(res.body.summary).toMatchObject({ total: 3, completed: 1, cancelled: 1 });
    expect(res.body.history).toHaveLength(3);
    // newest first, joined with the doctor.
    expect(res.body.history[0]).toMatchObject({ doctorName: "Dr. Test" });
  });

  it("404s for an unknown patient", async () => {
    const res = await agent.get("/api/patients/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});
