import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import pino from "pino";

import { InMemoryRepository } from "../repository/in-memory.js";
import { hashPassword } from "../auth/passwords.js";
import { StaffRole } from "../auth/staff.js";
import { createApp } from "./app.js";
import type { AppConfig } from "./deps.js";

const config: AppConfig = {
  jwtSecret: "test-secret",
  jwtExpiresInSeconds: 3600,
  cookieName: "session",
  cookieSecure: false,
};

const logger = pino({ level: "silent" });

const ADMIN = { email: "admin@clinic.test", password: "adminpass" };
const RECEPTIONIST = { email: "recept@clinic.test", password: "receptpass" };

async function buildApp() {
  const repo = new InMemoryRepository();
  // Low bcrypt cost keeps tests fast.
  await repo.createStaff({
    email: ADMIN.email,
    passwordHash: await hashPassword(ADMIN.password, 4),
    name: "Admin",
    role: StaffRole.ADMIN,
  });
  await repo.createStaff({
    email: RECEPTIONIST.email,
    passwordHash: await hashPassword(RECEPTIONIST.password, 4),
    name: "Reception",
    role: StaffRole.RECEPTIONIST,
  });
  return createApp({ repo, config, logger });
}

describe("staff auth", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    app = await buildApp();
  });

  it("logs in with valid credentials and sets an httpOnly cookie", async () => {
    const res = await request(app).post("/api/auth/login").send(ADMIN);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email: ADMIN.email, role: "ADMIN" });
    expect(res.body.passwordHash).toBeUndefined();

    const cookies = res.headers["set-cookie"] as unknown as string[];
    expect(cookies?.[0]).toMatch(/session=/);
    expect(cookies[0]).toMatch(/HttpOnly/i);
  });

  it("rejects a wrong password with 401", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: ADMIN.email, password: "wrong" });
    expect(res.status).toBe(401);
  });

  it("rejects an unknown email with 401", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@clinic.test", password: "whatever" });
    expect(res.status).toBe(401);
  });

  it("returns 400 for a malformed login body", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "not-an-email" });
    expect(res.status).toBe(400);
  });

  it("GET /api/auth/me is 401 without a cookie and 200 with one", async () => {
    const noCookie = await request(app).get("/api/auth/me");
    expect(noCookie.status).toBe(401);

    const agent = request.agent(app);
    await agent.post("/api/auth/login").send(ADMIN);
    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ email: ADMIN.email, role: "ADMIN" });
  });

  it("logout clears the cookie", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send(ADMIN);
    const out = await agent.post("/api/auth/logout");
    expect(out.status).toBe(200);
    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(401);
  });
});

describe("protected routes", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    app = await buildApp();
  });

  it("GET /api/doctors is 401 without auth and 200 with auth", async () => {
    const anon = await request(app).get("/api/doctors");
    expect(anon.status).toBe(401);

    const agent = request.agent(app);
    await agent.post("/api/auth/login").send(RECEPTIONIST);
    const ok = await agent.get("/api/doctors");
    expect(ok.status).toBe(200);
    expect(Array.isArray(ok.body)).toBe(true);
  });

  it("forbids a RECEPTIONIST from creating a doctor (403)", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send(RECEPTIONIST);
    const res = await agent
      .post("/api/doctors")
      .send({ name: "Dr. X", department: "ENT", slotDurationMinutes: 30 });
    expect(res.status).toBe(403);
  });

  it("allows an ADMIN to create a doctor (201)", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send(ADMIN);
    const res = await agent
      .post("/api/doctors")
      .send({ name: "Dr. X", department: "ENT", slotDurationMinutes: 30 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: "Dr. X", department: "ENT" });
  });

  it("requires auth to create a doctor at all (401)", async () => {
    const res = await request(app)
      .post("/api/doctors")
      .send({ name: "Dr. Y", department: "ENT", slotDurationMinutes: 30 });
    expect(res.status).toBe(401);
  });
});
