import { describe, it, expect, beforeEach } from "vitest";

import { InMemoryRepository } from "../repository/in-memory.js";
import { BroadcastCategory, BroadcastPriority, BroadcastStatus } from "../domain/types.js";
import type { Clock } from "../domain/scheduling.js";
import { MockChannelAdapter } from "./mock-channel.js";
import { BroadcastService } from "./broadcasts.js";

const NOW = new Date("2026-06-23T10:00:00.000Z");
const clock: Clock = { now: () => NOW };
const SENDER = { id: "staff1", name: "Dr. Admin" };

function setup() {
  const repo = new InMemoryRepository();
  // Two consented patients + one without consent (must NOT be messaged).
  repo.addPatient({ id: "p1", phone: "+919000000001", name: "A", language: "en", consentAt: NOW });
  repo.addPatient({ id: "p2", phone: "+919000000002", name: "B", language: "en", consentAt: NOW });
  repo.addPatient({ id: "p3", phone: "+919000000003", name: "C", language: "en", consentAt: null });
  const channel = new MockChannelAdapter();
  const service = new BroadcastService({ repo, channel, clock });
  return { repo, channel, service };
}

describe("BroadcastService", () => {
  let env: ReturnType<typeof setup>;
  beforeEach(() => {
    env = setup();
  });

  const base = {
    title: "Blood Donation Camp",
    body: "Join us this Saturday at 9 AM.",
    category: BroadcastCategory.BLOOD_DONATION,
    priority: BroadcastPriority.HIGH,
  };

  it("sends an immediate broadcast only to consented patients", async () => {
    const result = await env.service.create({ ...base, scheduledAt: null }, SENDER);

    expect(result.status).toBe(BroadcastStatus.SENT);
    expect(result.recipientCount).toBe(2); // p1 + p2, not p3
    expect(result.sentAt).not.toBeNull();
    expect(env.channel.outbox).toHaveLength(2);
    expect(env.channel.outbox[0]?.text).toContain("Blood Donation Camp");
    // The non-consented patient's number was never messaged.
    expect(env.channel.outbox.some((m) => m.to === "+919000000003")).toBe(false);
  });

  it("stores a future broadcast as SCHEDULED without sending", async () => {
    const later = new Date(NOW.getTime() + 60 * 60_000);
    const result = await env.service.create({ ...base, scheduledAt: later }, SENDER);

    expect(result.status).toBe(BroadcastStatus.SCHEDULED);
    expect(result.scheduledAt?.toISOString()).toBe(later.toISOString());
    expect(result.recipientCount).toBe(0);
    expect(env.channel.outbox).toHaveLength(0);
  });

  it("dispatches due scheduled broadcasts via runDue, once", async () => {
    const past = new Date(NOW.getTime() - 60 * 60_000);
    // Seed a scheduled-in-the-past broadcast directly.
    await env.repo.createBroadcast({
      ...base,
      status: BroadcastStatus.SCHEDULED,
      scheduledAt: past,
      sentAt: null,
      recipientCount: 0,
      createdById: SENDER.id,
      createdByName: SENDER.name,
    });

    const first = await env.service.runDue();
    expect(first.dispatched).toBe(1);
    expect(env.channel.outbox).toHaveLength(2);

    // Running again does nothing — it is already SENT.
    const second = await env.service.runDue();
    expect(second.dispatched).toBe(0);
    expect(env.channel.outbox).toHaveLength(2);
  });

  it("treats a past scheduledAt as an immediate send", async () => {
    const past = new Date(NOW.getTime() - 1000);
    const result = await env.service.create({ ...base, scheduledAt: past }, SENDER);
    expect(result.status).toBe(BroadcastStatus.SENT);
    expect(result.recipientCount).toBe(2);
  });
});
