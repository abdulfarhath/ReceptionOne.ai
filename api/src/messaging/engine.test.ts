import { describe, it, expect, beforeEach } from "vitest";

import { SchedulingService, type Clock } from "../domain/scheduling.js";
import { AppointmentStatus } from "../domain/types.js";
import { InMemoryRepository } from "../repository/in-memory.js";
import { ConversationEngine } from "./engine.js";
import { InMemoryConversationStore } from "./conversation-store.js";
import { MockChannelAdapter } from "./mock-channel.js";
import { NotificationService } from "./notifications.js";

// 2026-01-05 is a Monday (UTC). Doctor works Mon 09:00–11:00 UTC -> 4 x 30min slots.
const FIXED_NOW = new Date("2026-01-05T00:00:00.000Z");
const clock: Clock = { now: () => FIXED_NOW };
const PHONE = "+919999999999";
const FIRST_SLOT = "2026-01-05T09:00:00.000Z";
const SECOND_SLOT = "2026-01-05T09:30:00.000Z";

function setup() {
  const repo = new InMemoryRepository();
  repo.addDoctor({
    id: "doc1",
    name: "Dr. Test",
    phone: "+910000000003",
    department: "General",
    slotDurationMinutes: 30,
  });
  repo.addAvailability({
    id: "av1",
    doctorId: "doc1",
    dayOfWeek: 1,
    startMinutes: 540,
    endMinutes: 660,
  });
  const scheduling = new SchedulingService(repo, clock);
  const channel = new MockChannelAdapter();
  const store = new InMemoryConversationStore();
  const notifications = new NotificationService({ repo, channel, clock });
  const engine = new ConversationEngine({ repo, scheduling, channel, store, notifications, clock });
  return { repo, scheduling, channel, engine };
}

describe("ConversationEngine", () => {
  let env: ReturnType<typeof setup>;
  const say = async (text: string): Promise<string> => {
    await env.engine.handle(env.channel.parseInbound({ from: PHONE, text }));
    return env.channel.last()?.text ?? "";
  };

  beforeEach(() => {
    env = setup();
  });

  it("handles emergency flow", async () => {
    expect(await say("hi")).toMatch(/emergency/i);
    expect(await say("1")).toMatch(/911|emergency room/i); // Yes
  });

  it("books an appointment end to end", async () => {
    expect(await say("hi")).toMatch(/emergency/i);
    expect(await say("2")).toContain("Book an appointment"); // No
    expect(await say("1")).toMatch(/name/i); // new patient -> ask name
    expect(await say("Riya Sharma")).toContain("Dr. Test"); // doctor list
    const slots = await say("1"); // choose doctor -> slot list
    expect(slots).toContain("1."); // numbered options present
    expect(await say("1")).toMatch(/confirm/i); // confirm prompt
    expect(await say("1")).toMatch(/booked/i); // confirmed

    const patient = await env.repo.getPatientByPhone(PHONE);
    expect(patient).not.toBeNull();
    expect(patient?.consentAt).not.toBeNull(); // consent captured on first contact
    const appts = await env.repo.listUpcomingAppointmentsForPatient(
      patient!.id,
      FIXED_NOW,
    );
    expect(appts).toHaveLength(1);
    expect(appts[0]?.start.toISOString()).toBe(FIRST_SLOT);
    expect(appts[0]?.status).toBe(AppointmentStatus.BOOKED);
  });

  it("rejects booking a slot that was taken after it was offered", async () => {
    await say("hi");
    await say("2"); // No to emergency
    await say("1");
    await say("Riya Sharma");
    await say("1"); // doctor chosen, slots offered (option 1 = 09:00)

    // Someone else grabs the 09:00 slot before this patient confirms.
    const other = await env.repo.createPatient({
      phone: "+918888888888",
      name: "Other",
      consentAt: FIXED_NOW,
    });
    await env.scheduling.book({
      doctorId: "doc1",
      patientId: other.id,
      start: new Date(FIRST_SLOT),
    });

    await say("1"); // select 09:00
    await say("1"); // confirm -> SlotUnavailable

    expect(env.channel.outbox.some((m) => /just taken/i.test(m.text))).toBe(true);
    const patient = await env.repo.getPatientByPhone(PHONE);
    const mine = await env.repo.listUpcomingAppointmentsForPatient(
      patient!.id,
      FIXED_NOW,
    );
    expect(mine).toHaveLength(0); // the patient did NOT get the taken slot
  });

  it("reschedules an existing appointment", async () => {
    const patient = await env.repo.createPatient({
      phone: PHONE,
      name: "Riya",
      consentAt: FIXED_NOW,
    });
    await env.scheduling.book({
      doctorId: "doc1",
      patientId: patient.id,
      start: new Date(FIRST_SLOT),
    });

    await say("hi");
    await say("2"); // No to emergency
    expect(await say("2")).toMatch(/which appointment/i); // reschedule -> list
    await say("1"); // pick the appointment -> slots (09:00 now free again is excluded? it's the user's own booked slot)
    await say("1"); // pick the first offered new slot
    expect(await say("1")).toMatch(/now/i); // confirmed reschedule

    const appts = await env.repo.listUpcomingAppointmentsForPatient(
      patient.id,
      FIXED_NOW,
    );
    expect(appts).toHaveLength(1);
    // First free slot for reschedule is 09:30 (the patient's own 09:00 is booked).
    expect(appts[0]?.start.toISOString()).toBe(SECOND_SLOT);
  });

  it("cancels an existing appointment and frees the slot", async () => {
    const patient = await env.repo.createPatient({
      phone: PHONE,
      name: "Riya",
      consentAt: FIXED_NOW,
    });
    const appt = await env.scheduling.book({
      doctorId: "doc1",
      patientId: patient.id,
      start: new Date(FIRST_SLOT),
    });

    await say("hi");
    await say("2"); // No to emergency
    expect(await say("3")).toMatch(/which appointment/i); // cancel -> list
    expect(await say("1")).toMatch(/cancel/i); // confirm prompt
    expect(await say("1")).toMatch(/cancelled/i); // confirmed

    const after = await env.repo.getAppointment(appt.id);
    expect(after?.status).toBe(AppointmentStatus.CANCELLED);
    const upcoming = await env.repo.listUpcomingAppointmentsForPatient(
      patient.id,
      FIXED_NOW,
    );
    expect(upcoming).toHaveLength(0);
  });

  it("re-prompts on invalid input", async () => {
    await say("hi");
    await say("2"); // No to emergency
    expect(await say("9")).toMatch(/didn't catch|tap one of the options/i);
  });
});
