import { describe, it, expect, beforeEach } from "vitest";

import {
  SchedulingService,
  toQueueDate,
  type Clock,
} from "../domain/scheduling.js";
import { AppointmentStatus } from "../domain/types.js";
import { InMemoryRepository } from "../repository/in-memory.js";
import { ConversationEngine } from "./engine.js";
import { InMemoryConversationStore } from "./conversation-store.js";
import { MockChannelAdapter } from "./mock-channel.js";

const FIXED_NOW = new Date("2026-01-05T06:00:00.000Z");
const clock: Clock = { now: () => FIXED_NOW };
const PHONE = "+919999999999";

function setup() {
  const repo = new InMemoryRepository();
  repo.addDoctor({
    id: "doc1",
    name: "Dr. Test",
    phone: "+910000000003",
    department: "General",
    slotDurationMinutes: 30,
    avgConsultMinutes: 10,
  });
  repo.addAvailability({
    id: "av1",
    doctorId: "doc1",
    dayOfWeek: toQueueDate(FIXED_NOW).getUTCDay(),
    startMinutes: 210,
    endMinutes: 600,
  });
  const scheduling = new SchedulingService(repo, clock);
  const channel = new MockChannelAdapter();
  const store = new InMemoryConversationStore();
  const engine = new ConversationEngine({ repo, scheduling, channel, store, clock });
  return { repo, scheduling, channel, engine };
}

describe("ConversationEngine (queue)", () => {
  let env: ReturnType<typeof setup>;
  const say = async (text: string): Promise<string> => {
    await env.engine.handle(env.channel.parseInbound({ from: PHONE, text }));
    return env.channel.last()?.text ?? "";
  };

  beforeEach(() => {
    env = setup();
  });

  it("handles the emergency flow", async () => {
    expect(await say("hi")).toMatch(/language/i);
    expect(await say("1")).toMatch(/emergency/i); // English
    expect(await say("1")).toMatch(/108|emergency/i); // Yes -> hand-off
  });

  it("joins the queue end to end (patient sees a range, not a token)", async () => {
    expect(await say("hi")).toMatch(/language/i);
    expect(await say("1")).toMatch(/emergency/i); // English
    expect(await say("2")).toContain("Book appointment"); // No -> menu
    expect(await say("1")).toMatch(/name/i); // Book -> ask name (new patient)
    expect(await say("Riya Sharma")).toContain("Dr. Test"); // choose doctor
    expect(await say("1")).toMatch(/when|come now/i); // pick doctor -> ask timing
    expect(await say("1")).toMatch(/min wait|book\?/i); // come now -> quote + confirm
    const joined = await say("1"); // joined
    expect(joined).toMatch(/booked with|min wait/i);
    expect(joined).not.toMatch(/token|#\d/i); // never a token/rank to the patient

    const patient = await env.repo.getPatientByPhone(PHONE);
    expect(patient).not.toBeNull();
    const entries = await env.repo.listQueueEntries("doc1", toQueueDate(FIXED_NOW));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ token: 1, status: AppointmentStatus.WAITING });

    // "arrived" keyword checks them in and reports position/wait.
    expect(await say("arrived")).toMatch(/checked in/i);
    const after = await env.repo.getAppointment(entries[0]!.id);
    expect(after?.status).toBe(AppointmentStatus.ARRIVED);
  });

  it("shows the patient's live token status", async () => {
    // Seed a returning patient with an active token today.
    const patient = await env.repo.createPatient({
      phone: PHONE,
      name: "Riya",
      consentAt: FIXED_NOW,
    });
    await env.scheduling.joinQueue({
      doctorId: "doc1",
      date: FIXED_NOW,
      patientName: patient.name,
      patientPhone: PHONE,
    });

    await say("hi");
    await say("1"); // English
    await say("2"); // No to emergency
    const status = await say("3"); // My appointments -> status
    expect(status).toMatch(/min wait/i);
    expect(status).not.toMatch(/token|#\d/i);
  });

  it("cancels an active token", async () => {
    const patient = await env.repo.createPatient({
      phone: PHONE,
      name: "Riya",
      consentAt: FIXED_NOW,
    });
    const joined = await env.scheduling.joinQueue({
      doctorId: "doc1",
      date: FIXED_NOW,
      patientName: patient.name,
      patientPhone: PHONE,
    });

    await say("hi");
    await say("1"); // English
    await say("2"); // No to emergency
    expect(await say("2")).toMatch(/which|cancel/i); // Cancel -> pick token
    expect(await say("1")).toMatch(/cancelled/i); // confirm cancellation

    const entry = await env.repo.getAppointment(joined.bookingId);
    expect(entry?.status).toBe(AppointmentStatus.CANCELLED);
  });

  it("re-prompts on invalid menu input", async () => {
    await say("hi");
    await say("1"); // English
    await say("2"); // No to emergency
    expect(await say("9")).toMatch(/select an option/i);
  });

  it("books a scheduled token (come at my own time): a window, never a minute or token", async () => {
    await say("hi");
    await say("1"); // English
    await say("2"); // No -> menu
    await say("1"); // Book
    await say("Riya Sharma"); // name
    expect(await say("1")).toMatch(/when|come now/i); // pick doctor -> ask timing
    expect(await say("2")).toMatch(/pick a time|time to come/i); // Pick a time -> options
    const confirm = await say("1"); // choose first offered time
    expect(confirm).toMatch(/come around|arrive by|book\?/i);
    const joined = await say("1"); // confirm
    expect(joined).toMatch(/around|arrive by/i);
    expect(joined).not.toMatch(/token|#\d/i); // never a token to the patient

    const entries = await env.repo.listQueueEntries("doc1", toQueueDate(FIXED_NOW));
    expect(entries).toHaveLength(1);
    expect(entries[0]?.status).toBe(AppointmentStatus.WAITING);
    expect(entries[0]?.isWalkIn).toBe(false);
    expect(entries[0]?.targetTime).not.toBeNull();
  });
});
