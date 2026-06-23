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

// Today's clinic (IST) date + weekday, computed the same way the route does.
const istDateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const TODAY = istDateFmt.format(new Date());
const TODAY_WEEKDAY = new Date(`${TODAY}T00:00:00.000Z`).getUTCDay();

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
  });
  // 09:00–11:00 IST today = 03:30–05:30 UTC = minutes 210–330 -> 4 slots capacity.
  repo.addAvailability({
    id: "av1",
    doctorId: doc.id,
    dayOfWeek: TODAY_WEEKDAY,
    startMinutes: 210,
    endMinutes: 330,
  });
  const p1 = repo.addPatient({
    id: "p1",
    phone: "+919000000001",
    name: "Returning",
    language: "en",
    consentAt: new Date("2020-01-01T00:00:00Z"),
  });
  const p2 = repo.addPatient({
    id: "p2",
    phone: "+919000000002",
    name: "New",
    language: "en",
    consentAt: new Date("2020-01-01T00:00:00Z"),
  });
  const mk = (patientId: string, startIso: string, status: AppointmentStatus) =>
    repo.createAppointment({
      doctorId: doc.id,
      patientId,
      start: new Date(startIso),
      end: new Date(new Date(startIso).getTime() + 30 * 60_000),
      status,
    });
  // Two visits dated today at the 09:00 IST hour (COMPLETED so run-time doesn't
  // turn a past BOOKED into a no-show). Historical appts sit at 14:00 IST so they
  // can't collide with today's 09:00 heatmap cell on matching weekdays.
  await mk(p1.id, `${TODAY}T03:30:00.000Z`, AppointmentStatus.COMPLETED); // 09:00 IST today
  await mk(p1.id, "2020-06-01T08:30:00.000Z", AppointmentStatus.COMPLETED); // 14:00 IST, past
  await mk(p1.id, "2019-06-01T08:30:00.000Z", AppointmentStatus.BOOKED); // past BOOKED -> est no-show
  await mk(p2.id, `${TODAY}T04:00:00.000Z`, AppointmentStatus.COMPLETED); // 09:30 IST today

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

  it("computes doctor utilization from real availability + bookings", async () => {
    const res = await agent.get("/api/analytics/dashboard");
    expect(res.status).toBe(200);
    const doc = res.body.doctors[0];
    expect(doc).toMatchObject({
      name: "Dr. Test",
      capacityToday: 4, // 4 thirty-min slots in 09:00–11:00
      bookedToday: 2, // two visits dated today
      utilizationPct: 50, // 2 / 4
      estNoShows: 1, // the 2019 past-BOOKED appointment
      totalBooked: 4, // all four are BOOKED/COMPLETED visits
    });
  });

  it("derives patient new-vs-returning and retention", async () => {
    const { patients } = (await agent.get("/api/analytics/dashboard")).body;
    expect(patients).toMatchObject({
      totalPatients: 2,
      returningPatients: 1, // p1 (3 appts)
      newPatients: 1, // p2 (1 appt)
      returningPct: 50,
      retentionPct: 50, // of {p1,p2} completed, only p1 rebooked
    });
  });

  it("returns fixed-length demand series, weekday/hour breakdowns and a heatmap", async () => {
    const { demand, heatmap } = (await agent.get("/api/analytics/dashboard")).body;
    expect(demand.daily).toHaveLength(30);
    expect(demand.weekly).toHaveLength(12);
    expect(demand.monthly).toHaveLength(12);
    expect(demand.hourly).toHaveLength(13); // 08:00–20:00
    expect(demand.weekday).toHaveLength(7);
    expect(heatmap.cells).toHaveLength(7 * 13);

    // Two visits today land in the 09:00 cell on today's weekday.
    const cell = heatmap.cells.find(
      (c: { weekday: number; hour: number }) =>
        c.weekday === TODAY_WEEKDAY && c.hour === 9,
    );
    expect(cell.bookings).toBe(2);
    expect(heatmap.max).toBeGreaterThanOrEqual(2);
    // The current month bucket (last entry) holds today's two visits.
    expect(demand.monthly.at(-1).bookings).toBeGreaterThanOrEqual(2);
  });
});
