import { describe, it, expect } from "vitest";

import { SchedulingService, type Clock } from "../domain/scheduling.js";
import { InMemoryRepository } from "../repository/in-memory.js";
import { MockChannelAdapter } from "./mock-channel.js";
import { NotificationService } from "./notifications.js";

const PHONE = "+919999999999";
// 2026-01-05 is a Monday (UTC).
const BASE = Date.UTC(2026, 0, 5, 0, 0, 0);
const APPT_START = new Date(Date.UTC(2026, 0, 5, 10, 0, 0)); // 10h after BASE

function setup(startMs = BASE) {
  const repo = new InMemoryRepository();
  repo.addDoctor({
    id: "doc1",
    name: "Dr. Test",
    department: "General",
    slotDurationMinutes: 30,
  });
  // Open all week, all day (UTC) so any mid-day future time is bookable.
  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
    repo.addAvailability({
      id: `av${dayOfWeek}`,
      doctorId: "doc1",
      dayOfWeek,
      startMinutes: 0,
      endMinutes: 1440,
    });
  }
  let nowMs = startMs;
  const clock: Clock = { now: () => new Date(nowMs) };
  const scheduling = new SchedulingService(repo, clock);
  const channel = new MockChannelAdapter();
  const notifications = new NotificationService({ repo, channel, clock });
  return {
    repo,
    scheduling,
    channel,
    notifications,
    fastForwardTo: (ms: number) => {
      nowMs = ms;
    },
  };
}

const reminders = (channel: MockChannelAdapter) =>
  channel.outbox.filter((m) => /reminder/i.test(m.text));

describe("NotificationService", () => {
  it("sends a confirmation when an appointment is booked", async () => {
    const env = setup();
    const patient = await env.repo.createPatient({
      phone: PHONE,
      name: "Riya",
      consentAt: new Date(BASE),
    });
    const appt = await env.scheduling.book({
      doctorId: "doc1",
      patientId: patient.id,
      start: APPT_START,
    });

    await env.notifications.confirm(appt, "booked");

    expect(env.channel.outbox).toHaveLength(1);
    expect(env.channel.last()?.to).toBe(PHONE);
    expect(env.channel.last()?.text).toMatch(/confirmed/i);
    expect(env.channel.last()?.text).toContain("Dr. Test");
  });

  it("does not message a patient who has not consented", async () => {
    const env = setup();
    const patient = await env.repo.createPatient({
      phone: PHONE,
      name: "Riya",
      consentAt: null,
    });
    const appt = await env.scheduling.book({
      doctorId: "doc1",
      patientId: patient.id,
      start: APPT_START,
    });

    await env.notifications.confirm(appt, "booked");
    expect(env.channel.outbox).toHaveLength(0);
  });

  it("sends a reminder exactly once even if the job runs twice", async () => {
    const env = setup();
    const patient = await env.repo.createPatient({
      phone: PHONE,
      name: "Riya",
      consentAt: new Date(BASE),
    });
    await env.scheduling.book({
      doctorId: "doc1",
      patientId: patient.id,
      start: APPT_START, // ~10h away -> 24h window
    });

    expect((await env.notifications.runReminders()).sent).toBe(1);
    expect((await env.notifications.runReminders()).sent).toBe(0); // re-run is a no-op
    expect(reminders(env.channel)).toHaveLength(1);
    expect(reminders(env.channel)[0]?.text).toMatch(/tomorrow/i);

    // Fast-forward (injectable clock) to ~1h before -> the 2h reminder fires once.
    env.fastForwardTo(Date.UTC(2026, 0, 5, 9, 0, 0));
    expect((await env.notifications.runReminders()).sent).toBe(1);
    expect((await env.notifications.runReminders()).sent).toBe(0);

    const all = reminders(env.channel);
    expect(all).toHaveLength(2);
    expect(all[1]?.text).toMatch(/2 hours/i);
  });

  it("sends no reminder for a cancelled appointment", async () => {
    const env = setup();
    const patient = await env.repo.createPatient({
      phone: PHONE,
      name: "Riya",
      consentAt: new Date(BASE),
    });
    const appt = await env.scheduling.book({
      doctorId: "doc1",
      patientId: patient.id,
      start: APPT_START,
    });
    await env.scheduling.cancel(appt.id);

    expect((await env.notifications.runReminders()).sent).toBe(0);
    expect(reminders(env.channel)).toHaveLength(0);
  });
});
