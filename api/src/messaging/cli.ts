// Local WhatsApp simulator. Chat as a patient in the terminal; the bot's replies
// print to the console via the Mock channel. No Twilio, no database.
//
//   npm run chat
//   # or scripted (2 = no emergency):  printf '2\n1\nRiya Sharma\n1\n1\n1\n' | npm run chat

import * as readline from "node:readline";

import { SchedulingService } from "../domain/scheduling.js";
import { InMemoryRepository } from "../repository/in-memory.js";
import { ConversationEngine } from "./engine.js";
import { InMemoryConversationStore } from "./conversation-store.js";
import { MockChannelAdapter } from "./mock-channel.js";
import { NotificationService } from "./notifications.js";

const DEMO_PHONE = "+910000000001";

function seedRepo(): InMemoryRepository {
  const repo = new InMemoryRepository();
  const doctors = [
    { id: "demo-asha", name: "Dr. Asha Rao", phone: "+910000000002", department: "General Medicine", slotDurationMinutes: 30 },
    { id: "demo-vikram", name: "Dr. Vikram Singh", department: "Pediatrics", slotDurationMinutes: 20 },
  ];
  for (const d of doctors) {
    repo.addDoctor(d);
    // Open every day 09:00–17:00 IST (= 210–690 minutes-from-midnight UTC).
    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
      repo.addAvailability({
        id: `${d.id}-${dayOfWeek}`,
        doctorId: d.id,
        dayOfWeek,
        startMinutes: 210,
        endMinutes: 690,
      });
    }
  }
  return repo;
}

async function main(): Promise<void> {
  const repo = seedRepo();
  const channel = new MockChannelAdapter((line) => {
    process.stdout.write(`\n🤖 Clinic: ${line.replace(/\n/g, "\n           ")}\n\n`);
  });
  const notifications = new NotificationService({ repo, channel });
  const engine = new ConversationEngine({
    repo,
    scheduling: new SchedulingService(repo),
    channel,
    store: new InMemoryConversationStore(),
    notifications,
  });

  process.stdout.write(
    "WhatsApp simulator — type a message (or 'menu' to restart, 'exit' to quit).\n",
  );
  // First contact greets the patient.
  await engine.handle({ from: DEMO_PHONE, text: "hi" });

  const rl = readline.createInterface({ input: process.stdin });

  // for-await processes one line at a time, awaiting each reply before the next
  // — this serialises correctly for both interactive and piped input.
  for await (const line of rl) {
    const text = line.trim();
    process.stdout.write(`👤 You: ${text}\n`);
    if (text === "exit" || text === "quit") break;
    await engine.handle(channel.parseInbound({ from: DEMO_PHONE, text }));
  }
  rl.close();
}

void main();
