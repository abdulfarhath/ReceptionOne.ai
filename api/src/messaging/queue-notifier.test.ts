import { describe, it, expect, beforeEach } from "vitest";

import { InMemoryRepository } from "../repository/in-memory.js";
import { SchedulingService, toQueueDate, type Clock } from "../domain/scheduling.js";
import { MockChannelAdapter } from "./mock-channel.js";
import { QueueNotifier } from "./queue-notifier.js";

const NOW = new Date("2026-06-24T06:00:00.000Z");
const clock: Clock = { now: () => NOW };
const QDATE = toQueueDate(NOW);

function setup() {
  const repo = new InMemoryRepository();
  repo.addDoctor({
    id: "doc1",
    name: "Dr. Test",
    phone: null,
    department: "General",
    slotDurationMinutes: 30,
    avgConsultMinutes: 10,
  });
  const channel = new MockChannelAdapter();
  const svc = new SchedulingService(repo, clock);
  const notifier = new QueueNotifier({
    repo,
    channel,
    slipMin: 20,
    scheduledLeadMin: 15,
    clock,
  });
  const join = (phone: string, isWalkIn = false) =>
    svc.joinQueue({ doctorId: "doc1", date: NOW, patientName: `P-${phone}`, patientPhone: phone, isWalkIn });
  return { repo, channel, svc, notifier, join };
}

describe("QueueNotifier", () => {
  let env: ReturnType<typeof setup>;
  beforeEach(() => {
    env = setup();
  });

  it("sends 'you're next' to the next PRESENT patient, not a travelling one", async () => {
    await env.join("+919000000001"); // token 1, WAITING (still travelling)
    const b = await env.join("+919000000002"); // token 2, WAITING
    await env.svc.checkIn(b.bookingId); // token 2 now ARRIVED (present)

    await env.notifier.notifyFront("doc1", QDATE);

    const nextMsgs = env.channel.outbox.filter((m) => /next/i.test(m.text));
    expect(nextMsgs).toHaveLength(1);
    // The present patient (token 2) is told, not the travelling token 1.
    expect(nextMsgs[0]?.to).toBe("+919000000002");
  });

  it("sends a slip update ONCE when a waiting patient's max grows past SLIP_MIN", async () => {
    // A is travelling (WAITING); three walk-ins arrive ahead of them.
    await env.join("+919000000001"); // A: token 1, WAITING — told max ~10
    await env.join("+919000000002", true); // ARRIVED
    await env.join("+919000000003", true); // ARRIVED
    await env.join("+919000000004", true); // ARRIVED  -> A now ~3 ahead, max ~40

    await env.notifier.notifyFront("doc1", QDATE);
    let slips = env.channel.outbox.filter((m) => /behind/i.test(m.text));
    expect(slips).toHaveLength(1);
    expect(slips[0]?.to).toBe("+919000000001"); // only A slipped

    // Running again does not re-send (baseline updated).
    await env.notifier.notifyFront("doc1", QDATE);
    slips = env.channel.outbox.filter((m) => /behind/i.test(m.text));
    expect(slips).toHaveLength(1);
  });

  it("fires the SCHEDULED_DUE nudge once when a scheduled token crosses its lead window", async () => {
    // NOW = 06:00 UTC, lead 15 -> a token targeting 06:10 is active (06:10-15=05:55).
    const consented = await env.repo.createPatient({
      phone: "+919000000010",
      name: "Sched",
      consentAt: NOW,
    });
    await env.svc.joinQueue({
      doctorId: "doc1",
      date: NOW,
      patientName: consented.name,
      patientPhone: consented.phone,
      targetTime: new Date("2026-06-24T06:10:00.000Z"),
    });

    await env.notifier.notifyFront("doc1", QDATE);
    let due = env.channel.outbox.filter((m) => /head to the clinic|coming up/i.test(m.text));
    expect(due).toHaveLength(1);
    expect(due[0]?.to).toBe(consented.phone);

    // Idempotent: a second pass does not re-send.
    await env.notifier.notifyFront("doc1", QDATE);
    due = env.channel.outbox.filter((m) => /head to the clinic|coming up/i.test(m.text));
    expect(due).toHaveLength(1);
  });

  it("does not nudge a scheduled token that is still upcoming (before its lead window)", async () => {
    const consented = await env.repo.createPatient({
      phone: "+919000000011",
      name: "Later",
      consentAt: NOW,
    });
    await env.svc.joinQueue({
      doctorId: "doc1",
      date: new Date("2026-06-24T09:00:00.000Z"),
      patientName: consented.name,
      patientPhone: consented.phone,
      targetTime: new Date("2026-06-24T09:00:00.000Z"), // activates 08:45 > NOW
    });
    await env.notifier.notifyFront("doc1", QDATE);
    const due = env.channel.outbox.filter((m) => /head to the clinic|coming up/i.test(m.text));
    expect(due).toHaveLength(0);
  });
});
