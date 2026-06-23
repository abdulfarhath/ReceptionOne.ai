import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import pino from "pino";

import { InMemoryRepository } from "../repository/in-memory.js";
import { hashPassword } from "../auth/passwords.js";
import { StaffRole } from "../auth/staff.js";
import { BroadcastService } from "../messaging/broadcasts.js";
import { MockChannelAdapter } from "../messaging/mock-channel.js";
import { createApp } from "./app.js";
import type { AppConfig } from "./deps.js";

const config: AppConfig = {
  jwtSecret: "test-secret",
  jwtExpiresInSeconds: 3600,
  cookieName: "session",
  cookieSecure: false,
};
const logger = pino({ level: "silent" });
const STAFF = { email: "admin@clinic.test", password: "adminpass" };

async function buildApp() {
  const repo = new InMemoryRepository();
  await repo.createStaff({
    email: STAFF.email,
    passwordHash: await hashPassword(STAFF.password, 4),
    name: "Dr. Admin",
    role: StaffRole.ADMIN,
  });
  // Two consented + one not.
  repo.addPatient({ id: "p1", phone: "+919000000001", name: "A", language: "en", consentAt: new Date() });
  repo.addPatient({ id: "p2", phone: "+919000000002", name: "B", language: "en", consentAt: new Date() });
  repo.addPatient({ id: "p3", phone: "+919000000003", name: "C", language: "en", consentAt: null });
  const channel = new MockChannelAdapter();
  const broadcasts = new BroadcastService({ repo, channel });
  return { app: createApp({ repo, config, logger, broadcasts }), channel };
}

const newBroadcast = {
  title: "Free Health Checkup Camp",
  body: "This Sunday, 10 AM–4 PM. Walk-ins welcome.",
  category: "HEALTH_CAMP",
  priority: "HIGH",
};

describe("broadcast endpoints", () => {
  let env: Awaited<ReturnType<typeof buildApp>>;
  let agent: ReturnType<typeof request.agent>;

  beforeEach(async () => {
    env = await buildApp();
    agent = request.agent(env.app);
    await agent.post("/api/auth/login").send(STAFF);
  });

  it("requires auth", async () => {
    expect((await request(env.app).get("/api/broadcasts")).status).toBe(401);
  });

  it("sends an immediate broadcast to consented patients and records it", async () => {
    const res = await agent.post("/api/broadcasts").send(newBroadcast);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: "SENT",
      recipientCount: 2,
      category: "HEALTH_CAMP",
      createdByName: "Dr. Admin",
    });
    expect(res.body.sentAt).not.toBeNull();
    expect(env.channel.outbox).toHaveLength(2);

    const stats = await agent.get("/api/broadcasts/stats");
    expect(stats.body).toMatchObject({ totalSent: 1, totalReached: 2 });
  });

  it("schedules a future broadcast without sending", async () => {
    const future = new Date(Date.now() + 3_600_000).toISOString();
    const res = await agent
      .post("/api/broadcasts")
      .send({ ...newBroadcast, category: "BOOTCAMP", scheduledAt: future });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("SCHEDULED");
    expect(env.channel.outbox).toHaveLength(0);

    const stats = await agent.get("/api/broadcasts/stats");
    expect(stats.body).toMatchObject({ totalSent: 0, scheduled: 1 });
  });

  it("validates the payload", async () => {
    const bad = await agent.post("/api/broadcasts").send({ title: "", body: "", category: "NOPE" });
    expect(bad.status).toBe(400);
  });

  it("lists with search + filters and fetches one by id", async () => {
    const created = (await agent.post("/api/broadcasts").send(newBroadcast)).body;
    await agent
      .post("/api/broadcasts")
      .send({ ...newBroadcast, title: "Blood Donation Drive", category: "BLOOD_DONATION" });

    const all = await agent.get("/api/broadcasts");
    expect(all.body).toHaveLength(2);

    const filtered = await agent.get("/api/broadcasts?category=BLOOD_DONATION");
    expect(filtered.body).toHaveLength(1);
    expect(filtered.body[0].title).toBe("Blood Donation Drive");

    const searched = await agent.get("/api/broadcasts?search=checkup");
    expect(searched.body).toHaveLength(1);

    const one = await agent.get(`/api/broadcasts/${created.id}`);
    expect(one.body.id).toBe(created.id);
    expect((await agent.get("/api/broadcasts/nope")).status).toBe(404);
  });
});
