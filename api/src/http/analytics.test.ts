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

const istDateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const TODAY = istDateFmt.format(new Date());
const TODAY_QUEUE_DATE = new Date(`${TODAY}T00:00:00.000Z`);

async function buildApp() {
  const repo = new InMemoryRepository();
  await repo.createStaff({
    email: STAFF.email,
    passwordHash: await hashPassword(STAFF.password, 4),
    name: "Reception",
    role: StaffRole.RECEPTIONIST,
  });
  const doc = repo.addDoctor({
    id: "doc1",
    name: "Dr. Test",
    phone: null,
    department: "General",
    slotDurationMinutes: 30,
    avgConsultMinutes: 10,
  });
  repo.addPatient({ id: "p1", phone: "+919000000001", name: "Returning", language: "en", consentAt: new Date("2020-01-01T00:00:00Z") });
  repo.addPatient({ id: "p2", phone: "+919000000002", name: "New", language: "en", consentAt: new Date("2020-01-01T00:00:00Z") });

  let token = 0;
  const mk = async (
    patientId: string,
    queueDate: Date,
    status: AppointmentStatus,
    consult?: { startedAt: string; doneAt: string },
  ) => {
    const e = await repo.createAppointment({
      doctorId: doc.id,
      patientId,
      queueDate,
      token: ++token,
      isWalkIn: false,
      isPriority: false,
      status,
    });
    if (consult) {
      await repo.updateAppointment(e.id, {
        startedAt: new Date(consult.startedAt),
        doneAt: new Date(consult.doneAt),
      });
    }
  };
  // Two completed today, with consult durations 10 + 20 min -> avg 15.
  await mk("p1", TODAY_QUEUE_DATE, AppointmentStatus.DONE, {
    startedAt: `${TODAY}T04:00:00.000Z`,
    doneAt: `${TODAY}T04:10:00.000Z`,
  });
  await mk("p2", TODAY_QUEUE_DATE, AppointmentStatus.DONE, {
    startedAt: `${TODAY}T05:00:00.000Z`,
    doneAt: `${TODAY}T05:20:00.000Z`,
  });
  // History: one more DONE and one NO_SHOW.
  await mk("p1", new Date("2026-05-10T00:00:00.000Z"), AppointmentStatus.DONE);
  await mk("p1", new Date("2026-05-11T00:00:00.000Z"), AppointmentStatus.NO_SHOW);

  return createApp({ repo, config, logger });
}

describe("analytics dashboard endpoint", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let agent: ReturnType<typeof request.agent>;

  beforeEach(async () => {
    app = await buildApp();
    agent = request.agent(app);
    await agent.post("/api/auth/login").send(STAFF);
  });

  it("requires auth", async () => {
    expect((await request(app).get("/api/analytics/dashboard")).status).toBe(401);
  });

  it("computes per-doctor queue activity incl. real no-shows + avg consult", async () => {
    const res = await agent.get("/api/analytics/dashboard");
    expect(res.status).toBe(200);
    expect(res.body.doctors[0]).toMatchObject({
      name: "Dr. Test",
      joinedToday: 2,
      doneToday: 2,
      noShowToday: 0,
      totalDone: 3, // 2 today + 1 historical
      noShows: 1, // the real NO_SHOW status
      avgConsultMinutes: 15, // (10 + 20) / 2
    });
  });

  it("derives patient new-vs-returning and retention", async () => {
    const { patients } = (await agent.get("/api/analytics/dashboard")).body;
    expect(patients).toMatchObject({
      totalPatients: 2,
      returningPatients: 1, // p1 (3 entries)
      newPatients: 1, // p2 (1 entry)
      returningPct: 50,
      retentionPct: 50,
    });
  });

  it("returns fixed-length demand series, weekday/hour breakdowns and a heatmap", async () => {
    const { demand, heatmap } = (await agent.get("/api/analytics/dashboard")).body;
    expect(demand.daily).toHaveLength(30);
    expect(demand.weekly).toHaveLength(12);
    expect(demand.monthly).toHaveLength(12);
    expect(demand.hourly).toHaveLength(13);
    expect(demand.weekday).toHaveLength(7);
    expect(heatmap.cells).toHaveLength(7 * 13);
    // Today's two tokens fall in the current month bucket.
    expect(demand.monthly.at(-1).bookings).toBeGreaterThanOrEqual(2);
  });
});
