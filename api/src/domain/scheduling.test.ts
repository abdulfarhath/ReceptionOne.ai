import { describe, it, expect, beforeEach } from "vitest";

import { InMemoryRepository } from "../repository/in-memory.js";
import { SchedulingService, toQueueDate, type Clock } from "./scheduling.js";
import { AppointmentStatus } from "./types.js";

const NOW = new Date("2026-06-24T06:00:00.000Z"); // 11:30 IST
const clock: Clock = { now: () => NOW };

function setup() {
  const repo = new InMemoryRepository();
  repo.addDoctor({
    id: "doc1",
    name: "Dr A",
    phone: null,
    department: "General",
    slotDurationMinutes: 30,
    avgConsultMinutes: 10,
  });
  repo.addDoctor({
    id: "doc2",
    name: "Dr B",
    phone: null,
    department: "ENT",
    slotDurationMinutes: 30,
    avgConsultMinutes: 10,
  });
  const queueDate = toQueueDate(NOW);
  repo.addAvailability({
    id: "av1",
    doctorId: "doc1",
    dayOfWeek: queueDate.getUTCDay(),
    startMinutes: 210, // 09:00 IST
    endMinutes: 600,
  });
  const svc = new SchedulingService(repo, clock);
  return { repo, svc };
}

let env: ReturnType<typeof setup>;
beforeEach(() => {
  env = setup();
});

const join = (
  doctorId: string,
  phone: string,
  opts: { isPriority?: boolean; isWalkIn?: boolean } = {},
) =>
  env.svc.joinQueue({
    doctorId,
    date: NOW,
    patientName: `P-${phone}`,
    patientPhone: phone,
    ...opts,
  });

const tokenOf = async (bookingId: string) =>
  (await env.repo.getAppointment(bookingId))?.token;

describe("token assignment (internal)", () => {
  it("increments per doctor per day, independently across doctors", async () => {
    expect(await tokenOf((await join("doc1", "+910000000001")).bookingId)).toBe(1);
    expect(await tokenOf((await join("doc1", "+910000000002")).bookingId)).toBe(2);
    expect(await tokenOf((await join("doc1", "+910000000003")).bookingId)).toBe(3);
    // doc2's queue starts fresh at 1.
    expect(await tokenOf((await join("doc2", "+910000000004")).bookingId)).toBe(1);
  });
});

describe("patient-facing payloads (range, never rank)", () => {
  it("quote returns a range + arrival (and staff-only peopleAhead)", async () => {
    await join("doc1", "+910000000001");
    await join("doc1", "+910000000002");

    const q = await env.svc.quote("doc1", NOW);
    expect(q.estimateMinMinutes).toBe(10); // 2*10 - 10 buffer
    expect(q.estimateMaxMinutes).toBe(30); // 2*10 + 10 buffer
    expect(q.peopleAhead).toBe(2); // staff/internal only
    expect(q.suggestedArrival).toBeInstanceOf(Date);

    const entries = await env.repo.listQueueEntries("doc1", toQueueDate(NOW));
    expect(entries).toHaveLength(2); // quote added no one
  });

  it("joinQueue returns a range and NOT token/position", async () => {
    await join("doc1", "+910000000001");
    const r = await join("doc1", "+910000000002");
    expect(r.estimateMinMinutes).toBe(0); // 1*10 - 10 (clamped)
    expect(r.estimateMaxMinutes).toBe(20); // 1*10 + 10
    expect(r).not.toHaveProperty("token");
    expect(r).not.toHaveProperty("position");
  });

  it("statusOf returns a range and NOT token/position", async () => {
    await join("doc1", "+910000000001");
    const second = await join("doc1", "+910000000002");
    const s = await env.svc.statusOf(second.bookingId);
    expect(s.estimateMinMinutes).toBe(0);
    expect(s.estimateMaxMinutes).toBe(20);
    expect(s.suggestedArrival).toBeInstanceOf(Date);
    expect(s).not.toHaveProperty("token");
    expect(s).not.toHaveProperty("position");
  });

  it("a walk-in is ARRIVED immediately", async () => {
    const r = await join("doc1", "+910000000001", { isWalkIn: true });
    const entry = await env.repo.getAppointment(r.bookingId);
    expect(entry?.status).toBe(AppointmentStatus.ARRIVED);
    expect(entry?.arrivedAt).not.toBeNull();
  });

  it("present-first: an ARRIVED walk-in is served before earlier WAITING", async () => {
    await join("doc1", "+910000000001"); // token 1, WAITING (travelling)
    await join("doc1", "+910000000002"); // token 2, WAITING
    await join("doc1", "+910000000003", { isWalkIn: true }); // token 3, ARRIVED

    const board = await env.svc.getQueue("doc1", NOW);
    // ARRIVED (token 3) is position 1, ahead of the travelling WAITING tokens.
    expect(board.waitingHere.map((e) => e.token)).toEqual([3]);
    expect(board.waitingHere[0]?.position).toBe(1);
    expect(board.traveling.map((e) => e.token)).toEqual([1, 2]);
    expect(board.traveling.find((e) => e.token === 1)?.position).toBe(2);
  });

  it("a priority ARRIVED jumps ahead of non-priority ARRIVED", async () => {
    const a = await join("doc1", "+910000000001", { isWalkIn: true });
    const vip = await join("doc1", "+910000000009", {
      isWalkIn: true,
      isPriority: true,
    });
    const board = await env.svc.getQueue("doc1", NOW);
    expect(board.waitingHere[0]?.id).toBe(vip.bookingId);
    expect(board.waitingHere[1]?.id).toBe(a.bookingId);
  });
});

describe("lifecycle transitions", () => {
  it("walks a token through WAITING -> ARRIVED -> IN_PROGRESS -> DONE", async () => {
    const { bookingId } = await join("doc1", "+910000000001");
    expect((await env.svc.checkIn(bookingId)).status).toBe(AppointmentStatus.ARRIVED);
    const started = await env.svc.startVisit(bookingId);
    expect(started.status).toBe(AppointmentStatus.IN_PROGRESS);
    expect(started.startedAt).not.toBeNull();
    const done = await env.svc.complete(bookingId);
    expect(done.status).toBe(AppointmentStatus.DONE);
    expect(done.doneAt).not.toBeNull();
  });

  it("allows WAITING -> NO_SHOW and WAITING -> CANCELLED", async () => {
    const a = await join("doc1", "+910000000001");
    const b = await join("doc1", "+910000000002");
    expect((await env.svc.markNoShow(a.bookingId)).status).toBe(AppointmentStatus.NO_SHOW);
    expect((await env.svc.cancel(b.bookingId)).status).toBe(AppointmentStatus.CANCELLED);
  });

  it("rejects illegal transitions with INVALID_TRANSITION", async () => {
    const { bookingId } = await join("doc1", "+910000000001"); // WAITING
    await expect(env.svc.startVisit(bookingId)).rejects.toMatchObject({
      code: "INVALID_TRANSITION",
    });
    await expect(env.svc.complete(bookingId)).rejects.toMatchObject({
      code: "INVALID_TRANSITION",
    });
  });

  it("hold flags a WAITING entry without changing its status", async () => {
    const { bookingId } = await join("doc1", "+910000000001");
    const held = await env.svc.hold(bookingId);
    expect(held.status).toBe(AppointmentStatus.WAITING);
    expect(held.onHold).toBe(true);
  });
});

describe("getQueue", () => {
  it("groups entries and computes per-entry position + estimate", async () => {
    const a = await join("doc1", "+910000000001");
    await join("doc1", "+910000000002");
    await join("doc1", "+910000000003");
    await env.svc.checkIn(a.bookingId);
    await env.svc.startVisit(a.bookingId); // token 1 now IN_PROGRESS

    const board = await env.svc.getQueue("doc1", NOW);
    expect(board.inProgress.map((e) => e.token)).toEqual([1]);
    expect(board.traveling.map((e) => e.token)).toEqual([2, 3]);
    expect(board.waitingHere).toHaveLength(0);
    expect(board.done).toHaveLength(0);

    const t3 = board.traveling.find((e) => e.token === 3)!;
    expect(t3.position).toBe(3);
    expect(t3.estimateWaitMinutes).toBe(20); // 2 ahead * 10
  });
});

describe("reinstate", () => {
  it("requires a non-empty reason", async () => {
    const a = await join("doc1", "+910000000001");
    await env.svc.markNoShow(a.bookingId);
    await expect(env.svc.reinstate(a.bookingId, "back", "  ")).rejects.toThrow();
  });

  it("'back' brings a NO_SHOW to ARRIVED with a fresh token at the end", async () => {
    const a = await join("doc1", "+910000000001"); // token 1
    await join("doc1", "+910000000002"); // token 2
    await env.svc.markNoShow(a.bookingId);

    const r = await env.svc.reinstate(a.bookingId, "back", "stuck in traffic");
    expect(r.status).toBe(AppointmentStatus.ARRIVED);
    expect(r.arrivedAt).not.toBeNull();
    expect(r.token).toBe(3); // fresh token, not the old #1
    expect(r.isPriority).toBe(false);

    const events = await env.repo.listEvents(a.bookingId);
    const ev = events.find((e) => e.type === "REINSTATED");
    expect(ev?.metadata).toMatchObject({ mode: "back", reason: "stuck in traffic" });
  });

  it("'priority' brings a NO_SHOW to ARRIVED with the priority flag", async () => {
    const a = await join("doc1", "+910000000001");
    await env.svc.markNoShow(a.bookingId);
    const r = await env.svc.reinstate(a.bookingId, "priority", "elderly patient");
    expect(r.status).toBe(AppointmentStatus.ARRIVED);
    expect(r.isPriority).toBe(true);
    expect(r.token).toBe(1); // keeps its token; priority flag does the reordering
  });
});

describe("priority discipline", () => {
  it("captures the priority reason in the JOINED event", async () => {
    const j = await env.svc.joinQueue({
      doctorId: "doc1",
      date: NOW,
      patientName: "VIP",
      patientPhone: "+910000000050",
      isPriority: true,
      priorityReason: "doctor's relative",
    });
    const events = await env.repo.listEvents(j.bookingId);
    expect(events.find((e) => e.type === "JOINED")?.metadata).toMatchObject({
      isPriority: true,
      priorityReason: "doctor's relative",
    });
  });

  it("warns (does not block) past the soft daily priority cap", async () => {
    const repo = new InMemoryRepository();
    repo.addDoctor({
      id: "doc1",
      name: "Dr A",
      phone: null,
      department: "General",
      slotDurationMinutes: 30,
      avgConsultMinutes: 10,
    });
    const svc = new SchedulingService(repo, clock, { maxPriorityPerDay: 1 });
    const join2 = (phone: string) =>
      svc.joinQueue({ doctorId: "doc1", date: NOW, patientName: "P", patientPhone: phone, isPriority: true, priorityReason: "x" });

    const first = await join2("+910000000001");
    expect(first.priorityWarning).toBeUndefined(); // 1st priority is within cap
    const second = await join2("+910000000002");
    expect(second.priorityWarning).toMatch(/cap/i); // 2nd exceeds cap -> warn
    // …but it was still created (not blocked).
    expect(await repo.getAppointment(second.bookingId)).not.toBeNull();
  });
});

describe("sweepNoShows", () => {
  // NOW (06:00 UTC) is past the session end (05:00 UTC) + 30 min grace.
  function sweepSetup() {
    const repo = new InMemoryRepository();
    repo.addDoctor({
      id: "doc1",
      name: "Dr A",
      phone: null,
      department: "General",
      slotDurationMinutes: 30,
      avgConsultMinutes: 10,
    });
    repo.addAvailability({
      id: "av1",
      doctorId: "doc1",
      dayOfWeek: toQueueDate(NOW).getUTCDay(),
      startMinutes: 210,
      endMinutes: 300, // 05:00 UTC
    });
    return { repo, svc: new SchedulingService(repo, clock) };
  }

  it("flips only still-WAITING tokens to NO_SHOW, skipping arrived/cancelled", async () => {
    const { repo, svc } = sweepSetup();
    const a = await svc.joinQueue({ doctorId: "doc1", date: NOW, patientName: "A", patientPhone: "+910000000001" });
    const b = await svc.joinQueue({ doctorId: "doc1", date: NOW, patientName: "B", patientPhone: "+910000000002" });
    const c = await svc.joinQueue({ doctorId: "doc1", date: NOW, patientName: "C", patientPhone: "+910000000003" });
    await svc.checkIn(b.bookingId); // ARRIVED — should be left alone
    await svc.cancel(c.bookingId); // CANCELLED — should be left alone

    const first = await svc.sweepNoShows(30);
    expect(first.swept).toBe(1); // only a (WAITING)
    expect((await repo.getAppointment(a.bookingId))?.status).toBe(AppointmentStatus.NO_SHOW);
    expect((await repo.getAppointment(b.bookingId))?.status).toBe(AppointmentStatus.ARRIVED);
    expect((await repo.getAppointment(c.bookingId))?.status).toBe(AppointmentStatus.CANCELLED);

    // Idempotent: running again sweeps nothing.
    expect((await svc.sweepNoShows(30)).swept).toBe(0);
  });

  it("does nothing before session end + grace", async () => {
    const { repo, svc } = sweepSetup();
    const a = await svc.joinQueue({ doctorId: "doc1", date: NOW, patientName: "A", patientPhone: "+910000000001" });
    // A huge grace pushes the cutoff past NOW.
    expect((await svc.sweepNoShows(600)).swept).toBe(0);
    expect((await repo.getAppointment(a.bookingId))?.status).toBe(AppointmentStatus.WAITING);
  });
});
