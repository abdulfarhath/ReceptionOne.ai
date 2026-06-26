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
    name: "Riya",
    language: "en",
    consentAt: new Date("2026-06-01T00:00:00Z"),
  });
  let token = 0;
  const mk = (dayIso: string, status: AppointmentStatus) =>
    repo.createAppointment({
      doctorId: doctor.id,
      patientId: patient.id,
      queueDate: new Date(dayIso),
      token: ++token,
      isWalkIn: false,
      isPriority: false,
      status,
    });
  // Three tokens on 23 Jun (done, no-show, cancelled).
  await mk("2026-06-23T00:00:00.000Z", AppointmentStatus.DONE);
  await mk("2026-06-23T00:00:00.000Z", AppointmentStatus.NO_SHOW);
  await mk("2026-06-23T00:00:00.000Z", AppointmentStatus.CANCELLED);
  // One token on 10 Jun.
  await mk("2026-06-10T00:00:00.000Z", AppointmentStatus.DONE);
  // One in a different month — must be excluded from the June query.
  await mk("2026-07-01T00:00:00.000Z", AppointmentStatus.DONE);

  return createApp({ repo, config, logger });
}

describe("doctor insights endpoint", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let agent: ReturnType<typeof request.agent>;

  beforeEach(async () => {
    app = await buildApp();
    agent = request.agent(app);
    await agent.post("/api/auth/login").send(STAFF);
  });

  it("requires auth", async () => {
    const res = await request(app).get("/api/doctors/doc1/insights?month=2026-06");
    expect(res.status).toBe(401);
  });

  it("aggregates monthly demand bucketed by IST day", async () => {
    const res = await agent.get("/api/doctors/doc1/insights?month=2026-06");
    expect(res.status).toBe(200);
    expect(res.body.doctor).toMatchObject({ name: "Dr. Test" });
    expect(res.body.summary).toMatchObject({
      totalJoined: 4, // 3 on the 23rd + 1 on the 10th (July excluded)
      totalDone: 2,
      totalNoShow: 1,
      totalCancelled: 1,
      busiestDate: "2026-06-23",
      busiestCount: 3,
    });
    // 30 day buckets for June, zero-filled.
    expect(res.body.summary.perDay).toHaveLength(30);
    const d23 = res.body.summary.perDay.find(
      (d: { date: string }) => d.date === "2026-06-23",
    );
    expect(d23).toMatchObject({ joined: 3, done: 1, noShow: 1, cancelled: 1 });
  });

  it("400s on a malformed month", async () => {
    const res = await agent.get("/api/doctors/doc1/insights?month=June");
    expect(res.status).toBe(400);
  });

  it("404s for an unknown doctor", async () => {
    const res = await agent.get("/api/doctors/ghost/insights?month=2026-06");
    expect(res.status).toBe(404);
  });
});
