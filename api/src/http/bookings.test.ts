import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import pino from "pino";

import { InMemoryRepository } from "../repository/in-memory.js";
import { hashPassword } from "../auth/passwords.js";
import { StaffRole } from "../auth/staff.js";
import { toQueueDate } from "../domain/scheduling.js";
import { MockChannelAdapter } from "../messaging/mock-channel.js";
import { QueueNotifier } from "../messaging/queue-notifier.js";
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
  repo.addDoctor({
    id: "doc1",
    name: "Dr. Test",
    phone: null,
    department: "General",
    slotDurationMinutes: 30,
    avgConsultMinutes: 10,
  });
  repo.addAvailability({
    id: "av1",
    doctorId: "doc1",
    dayOfWeek: toQueueDate(new Date()).getUTCDay(),
    startMinutes: 210,
    endMinutes: 600,
  });
  const channel = new MockChannelAdapter();
  const queueNotifier = new QueueNotifier({ repo, channel });
  return { app: createApp({ repo, config, logger, queueNotifier }), channel };
}

const joinBody = (phone: string) => ({
  doctorId: "doc1",
  patientName: `P-${phone}`,
  patientPhone: phone,
});

describe("queue over HTTP", () => {
  let env: Awaited<ReturnType<typeof buildApp>>;
  let agent: ReturnType<typeof request.agent>;

  beforeEach(async () => {
    env = await buildApp();
    agent = request.agent(env.app);
    await agent.post("/api/auth/login").send(STAFF);
  });

  it("requires auth on bookings + quote + queue", async () => {
    expect((await request(env.app).post("/api/bookings").send(joinBody("+919000000001"))).status).toBe(401);
    expect((await request(env.app).get("/api/doctors/doc1/quote")).status).toBe(401);
    expect((await request(env.app).get("/api/doctors/doc1/queue")).status).toBe(401);
  });

  it("quotes a wait without creating an entry", async () => {
    await agent.post("/api/bookings").send(joinBody("+919000000001"));
    const quote = await agent.get("/api/doctors/doc1/quote");
    expect(quote.status).toBe(200);
    expect(quote.body).toMatchObject({ estimateMinMinutes: 0, estimateMaxMinutes: 20 });
    expect(typeof quote.body.suggestedArrival).toBe("string");

    const board = await agent.get("/api/doctors/doc1/queue");
    expect(board.body.traveling).toHaveLength(1); // quote added no one
  });

  it("patient join/status return a RANGE (no token/position); board keeps them", async () => {
    const res = await agent.post("/api/bookings").send(joinBody("+919000000001"));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ estimateMinMinutes: 0, estimateMaxMinutes: 10 });
    expect(typeof res.body.bookingId).toBe("string");
    expect(res.body).not.toHaveProperty("token");
    expect(res.body).not.toHaveProperty("position");

    // GET /api/bookings/:id (patient) -> range, never token/position.
    const status = await agent.get(`/api/bookings/${res.body.bookingId}`);
    expect(status.body).toMatchObject({ estimateMinMinutes: 0, estimateMaxMinutes: 10 });
    expect(status.body).not.toHaveProperty("token");
    expect(status.body).not.toHaveProperty("position");

    // GET /api/doctors/:id/queue (staff board) -> token + position kept.
    const board = await agent.get("/api/doctors/doc1/queue");
    expect(board.body.traveling[0]).toMatchObject({ token: 1, position: 1 });

    // The lone joiner is the front -> a one-time "you're next" went out.
    expect(env.channel.outbox.filter((m) => /next/i.test(m.text))).toHaveLength(1);
  });

  it("runs the full lifecycle and rejects illegal transitions (409)", async () => {
    const a = (await agent.post("/api/bookings").send(joinBody("+919000000001"))).body;
    const b = (await agent.post("/api/bookings").send(joinBody("+919000000002"))).body;

    // Illegal: complete a WAITING booking.
    const bad = await agent.post(`/api/bookings/${a.bookingId}/complete`);
    expect(bad.status).toBe(409);
    expect(bad.body.error.code).toBe("INVALID_TRANSITION");

    expect((await agent.post(`/api/bookings/${a.bookingId}/checkin`)).body.status).toBe("ARRIVED");
    expect((await agent.post(`/api/bookings/${a.bookingId}/start`)).body.status).toBe("IN_PROGRESS");
    expect((await agent.post(`/api/bookings/${a.bookingId}/complete`)).body.status).toBe("DONE");

    // b can be cancelled.
    expect((await agent.post(`/api/bookings/${b.bookingId}/cancel`)).body.status).toBe("CANCELLED");

    // "You're next" is one-shot per booking: a (1), then b when a started (2). No more.
    expect(env.channel.outbox.filter((m) => /next/i.test(m.text))).toHaveLength(2);
  });

  it("supports no-show and hold transitions", async () => {
    const a = (await agent.post("/api/bookings").send(joinBody("+919000000001"))).body;
    expect((await agent.post(`/api/bookings/${a.bookingId}/hold`)).body.onHold).toBe(true);
    expect((await agent.post(`/api/bookings/${a.bookingId}/no-show`)).body.status).toBe("NO_SHOW");
  });

  it("reinstates a no-show (reason required); 'back' gives a fresh token", async () => {
    const a = (await agent.post("/api/bookings").send(joinBody("+919000000001"))).body;
    await agent.post("/api/bookings").send(joinBody("+919000000002")); // token 2
    await agent.post(`/api/bookings/${a.bookingId}/no-show`);

    // Reason required -> 400.
    const bad = await agent.post(`/api/bookings/${a.bookingId}/reinstate`).send({ mode: "back" });
    expect(bad.status).toBe(400);

    const ok = await agent
      .post(`/api/bookings/${a.bookingId}/reinstate`)
      .send({ mode: "back", reason: "stuck in traffic" });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ status: "ARRIVED", token: 3 });
  });
});
