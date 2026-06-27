// DEMO SEED — a full, realistic dataset for pitching/demoing the product end to
// end. Run it right before a demo to reset to a known, rich state:
//
//     cd api && npm run db:seed:demo
//
// It deterministically (re)builds everything you need to show off:
//   • Staff logins (admin + receptionist)
//   • 5 doctors, each open every day (so the live queue works on any demo day)
//   • ~200 patients (a believable new-vs-returning mix for analytics)
//   • ~10 weeks of history so Demand / Heatmap / Busiest hours / Leaderboard /
//     Doctor insights all have shape (and a gentle "we're growing" ramp)
//   • TODAY's live queue covering EVERY state + action you can demo:
//       Upcoming (scheduled) · Traveling (WAITING) · Waiting here (ARRIVED) ·
//       In consultation (IN_PROGRESS, live timer) · Done · No-show · Cancelled ·
//       Priority · On-hold · a scheduled "come at my own time" token
//   • Broadcasts (sent + scheduled) and a couple of in-progress WhatsApp chats
//
// Idempotent: staff/doctors are upserted; patients + all transactional tables are
// wiped and rebuilt each run, so repeated runs always give the same clean demo.
//
// Time policy: availability + instants are UTC; the clinic runs Asia/Kolkata.

import { randomUUID } from "node:crypto";

import { Prisma, PrismaClient } from "@prisma/client";

import { hashPassword } from "../src/auth/passwords.js";
import { StaffRole } from "../src/auth/staff.js";

const prisma = new PrismaClient();

const IST_OFFSET_MIN = 330; // UTC+5:30
const MIN = 60_000;
const DAY = 86_400_000;
const HISTORY_DAYS = 72; // ~10 weeks of past demand

/** Asia/Kolkata wall-clock time -> minutes-from-midnight UTC. */
const istToUtc = (hour: number, minute = 0): number =>
  hour * 60 + minute - IST_OFFSET_MIN;

const now = new Date();
const todayUtc = new Date(
  Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
);
const dayMinus = (n: number): Date => new Date(todayUtc.getTime() - n * DAY);
/** A UTC instant at an IST clock time on a given queue day. */
const at = (queueDate: Date, hour: number, minute = 0): Date =>
  new Date(queueDate.getTime() + istToUtc(hour, minute) * MIN);
const minsAgo = (m: number): Date => new Date(now.getTime() - m * MIN);
const minsAhead = (m: number): Date => new Date(now.getTime() + m * MIN);

// --- Deterministic PRNG (mulberry32) so every demo run is identical ---------
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = makeRng(20260627);
const randInt = (lo: number, hi: number): number =>
  lo + Math.floor(rng() * (hi - lo + 1));
const chance = (p: number): boolean => rng() < p;
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

// --- Doctors (open every weekday so the demo works on any day) --------------
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
function everyDay(blocks: Array<[number, number]>) {
  return ALL_DAYS.flatMap((dayOfWeek) =>
    blocks.map(([s, e]) => ({
      dayOfWeek,
      startMinutes: istToUtc(s),
      endMinutes: istToUtc(e),
    })),
  );
}

const doctors = [
  { id: "demo_doc_asha", name: "Dr. Asha Rao", phone: "+919059790010", department: "General Medicine", avg: 12, base: 9 },
  { id: "demo_doc_priya", name: "Dr. Priya Iyer", phone: "+919059790012", department: "Cardiology", avg: 15, base: 7 },
  { id: "demo_doc_vikram", name: "Dr. Vikram Singh", phone: null, department: "Pediatrics", avg: 10, base: 6 },
  { id: "demo_doc_sanjay", name: "Dr. Sanjay Roy", phone: "+919059790013", department: "Dermatology", avg: 9, base: 6 },
  { id: "demo_doc_faisal", name: "Dr. Faisal Ahmed", phone: "+919059790011", department: "Dentistry", avg: 20, base: 4 },
];
const sessionBlocks: Array<[number, number]> = [
  [9, 13],
  [15, 19],
];

// --- Patient name pools (combined into ~200 unique patients) ----------------
const FIRST = [
  "Aarav", "Vivaan", "Aditya", "Arjun", "Sai", "Reyansh", "Krishna", "Ishaan", "Rohan", "Kabir",
  "Ananya", "Diya", "Aadhya", "Saanvi", "Pari", "Anika", "Navya", "Riya", "Myra", "Aisha",
  "Fatima", "Zoya", "Imran", "Faisal", "Mohan", "Suresh", "Ramesh", "Priya", "Lakshmi", "Sita",
  "Kavya", "Sneha", "Pooja", "Neha", "Deepak", "Rahul", "Sanjay", "Anil", "Sunil", "Rajesh",
  "Kiran", "Asha", "Meena", "Latha", "Vikram", "Nikhil", "Tara", "Ravi", "Geeta", "Manish",
];
const LAST = [
  "Sharma", "Verma", "Gupta", "Reddy", "Rao", "Naidu", "Iyer", "Nair", "Menon", "Pillai",
  "Khan", "Shaikh", "Ahmed", "Das", "Bose", "Singh", "Patel", "Shah", "Mehta", "Joshi",
  "Kulkarni", "Desai", "Bhat", "Kamath", "Hegde", "Gowda", "Banerjee", "Mukherjee", "Chowdhury", "Kapoor",
];
const LANGS = ["en", "en", "en", "hi", "hi", "te"]; // weighted toward en
const PATIENT_COUNT = 200;

interface SeedPatient {
  id: string;
  phone: string;
  name: string;
  language: string;
}

function buildAppt(
  o: Partial<Prisma.AppointmentCreateManyInput> &
    Pick<Prisma.AppointmentCreateManyInput, "doctorId" | "patientId" | "queueDate" | "token" | "status" | "createdAt">,
): Prisma.AppointmentCreateManyInput {
  return {
    isWalkIn: false,
    isPriority: false,
    onHold: false,
    arrivedAt: null,
    startedAt: null,
    doneAt: null,
    targetTime: null,
    ...o,
  };
}

async function main(): Promise<void> {
  // --- Staff -------------------------------------------------------------
  const staffSeed = [
    { email: "admin@clinic.test", name: "Aanya Admin", role: StaffRole.ADMIN, password: "admin1234" },
    { email: "reception@clinic.test", name: "Ravi Reception", role: StaffRole.RECEPTIONIST, password: "reception1234" },
  ];
  let adminId = "";
  for (const s of staffSeed) {
    const passwordHash = await hashPassword(s.password);
    const staff = await prisma.staff.upsert({
      where: { email: s.email },
      create: { email: s.email, passwordHash, name: s.name, role: s.role, active: true },
      update: { passwordHash, name: s.name, role: s.role, active: true },
    });
    if (s.role === StaffRole.ADMIN) adminId = staff.id;
  }

  // --- Doctors + availability -------------------------------------------
  for (const doc of doctors) {
    await prisma.doctor.upsert({
      where: { id: doc.id },
      create: {
        id: doc.id, name: doc.name, phone: doc.phone, department: doc.department,
        slotDurationMinutes: 30, avgConsultMinutes: doc.avg,
      },
      update: { name: doc.name, phone: doc.phone, department: doc.department, avgConsultMinutes: doc.avg },
    });
    await prisma.availability.deleteMany({ where: { doctorId: doc.id } });
    await prisma.availability.createMany({
      data: everyDay(sessionBlocks).map((w) => ({ doctorId: doc.id, ...w })),
    });
  }

  // --- Wipe transactional tables + patients (FK-safe order) --------------
  await prisma.notification.deleteMany({});
  await prisma.appointmentEvent.deleteMany({});
  await prisma.appointment.deleteMany({});
  await prisma.conversation.deleteMany({});
  await prisma.broadcast.deleteMany({});
  await prisma.patient.deleteMany({});

  // --- Patients (~200, unique names/phones; batched for speed) -----------
  const patients: SeedPatient[] = [];
  const usedNames = new Set<string>();
  for (let i = 0; i < PATIENT_COUNT; i++) {
    let name = `${pick(FIRST)} ${pick(LAST)}`;
    while (usedNames.has(name)) name = `${pick(FIRST)} ${pick(LAST)}`;
    usedNames.add(name);
    patients.push({ id: randomUUID(), phone: `+${919000000000 + i}`, name, language: pick(LANGS) });
  }
  await prisma.patient.createMany({
    data: patients.map((p) => ({
      id: p.id,
      phone: p.phone,
      name: p.name,
      language: p.language,
      // Most patients have consented to be messaged; ~12% have not yet.
      consentAt: chance(0.88) ? new Date(todayUtc.getTime() - randInt(5, 120) * DAY) : null,
    })),
  });
  // A "frequent" subset that drives repeat visits (returning patients).
  const frequent = patients.slice(0, 60);
  const pickPatient = (): SeedPatient =>
    chance(0.55) ? pick(frequent) : pick(patients);

  // --- Clinic-hour bias for createdAt (nice heatmap / busiest hours) ------
  // Morning + late-afternoon peaks, within the 08–19 IST chart window.
  const HOUR_WEIGHTS: Array<[number, number]> = [
    [8, 1], [9, 4], [10, 6], [11, 6], [12, 4], [13, 2],
    [15, 4], [16, 6], [17, 5], [18, 3], [19, 1],
  ];
  const hourBag: number[] = HOUR_WEIGHTS.flatMap(([h, w]) => Array<number>(w).fill(h));
  const pickHour = (): number => pick(hourBag);

  const doneTimes = (createdAt: Date, avg: number) => {
    const arrivedAt = new Date(createdAt.getTime() + randInt(8, 30) * MIN);
    const startedAt = new Date(arrivedAt.getTime() + randInt(3, 18) * MIN);
    const doneAt = new Date(startedAt.getTime() + Math.max(4, avg + randInt(-3, 5)) * MIN);
    return { arrivedAt, startedAt, doneAt };
  };

  // --- History: ~10 weeks of past demand ---------------------------------
  const rows: Prisma.AppointmentCreateManyInput[] = [];
  for (let off = HISTORY_DAYS; off >= 1; off--) {
    const queueDate = dayMinus(off);
    // Gentle growth ramp: older days are quieter than recent ones.
    const ramp = 0.55 + 0.45 * (1 - off / HISTORY_DAYS);
    for (const doc of doctors) {
      const volume = Math.max(0, Math.round(doc.base * ramp * (0.7 + rng() * 0.6)));
      for (let token = 1; token <= volume; token++) {
        const createdAt = at(queueDate, pickHour(), randInt(0, 59));
        // Past outcomes: mostly seen, some no-shows / cancellations.
        const roll = rng();
        const patient = pickPatient();
        if (roll < 0.78) {
          rows.push(
            buildAppt({
              doctorId: doc.id, patientId: patient.id, queueDate, token,
              status: "DONE", createdAt, isWalkIn: chance(0.4),
              ...doneTimes(createdAt, doc.avg),
            }),
          );
        } else if (roll < 0.9) {
          rows.push(
            buildAppt({ doctorId: doc.id, patientId: patient.id, queueDate, token, status: "NO_SHOW", createdAt }),
          );
        } else {
          rows.push(
            buildAppt({ doctorId: doc.id, patientId: patient.id, queueDate, token, status: "CANCELLED", createdAt }),
          );
        }
      }
    }
  }

  // --- TODAY: a curated live queue covering every state + action ---------
  // Primary doctor (Asha) gets the full board; others get a lighter mix.
  const today = todayUtc;
  type Spec = {
    status: string;
    isPriority?: boolean;
    onHold?: boolean;
    isWalkIn?: boolean;
    createdAt: Date;
    arrivedAt?: Date;
    startedAt?: Date;
    doneAt?: Date;
    targetTime?: Date;
  };

  const fullBoard = (avg: number): Spec[] => [
    // Done earlier today
    { status: "DONE", createdAt: at(today, 9, 5), ...doneTimes(at(today, 9, 5), avg) },
    { status: "DONE", createdAt: at(today, 9, 50), isWalkIn: true, ...doneTimes(at(today, 9, 50), avg) },
    { status: "DONE", createdAt: at(today, 10, 35), ...doneTimes(at(today, 10, 35), avg) },
    { status: "DONE", createdAt: at(today, 11, 20), ...doneTimes(at(today, 11, 20), avg) },
    // Didn't show / withdrew
    { status: "NO_SHOW", createdAt: at(today, 9, 30) },
    { status: "CANCELLED", createdAt: at(today, 10, 5) },
    // With the doctor right now (live elapsed timer)
    { status: "IN_PROGRESS", createdAt: minsAgo(45), arrivedAt: minsAgo(28), startedAt: minsAgo(7) },
    // Waiting here (checked in) — one is priority
    { status: "ARRIVED", isPriority: true, createdAt: minsAgo(38), arrivedAt: minsAgo(20) },
    { status: "ARRIVED", createdAt: minsAgo(33), arrivedAt: minsAgo(15) },
    { status: "ARRIVED", createdAt: minsAgo(26), arrivedAt: minsAgo(10) },
    // Traveling (have a token, on the way) — one is on hold
    { status: "WAITING", createdAt: minsAgo(22) },
    { status: "WAITING", onHold: true, createdAt: minsAgo(18) },
    // Upcoming scheduled tokens ("come at my own time") — not active yet
    { status: "WAITING", createdAt: minsAgo(55), targetTime: minsAhead(80) },
    { status: "WAITING", createdAt: minsAgo(50), targetTime: minsAhead(150) },
  ];

  const lightBoard = (avg: number): Spec[] => [
    { status: "DONE", createdAt: at(today, 9, 40), ...doneTimes(at(today, 9, 40), avg) },
    { status: "DONE", createdAt: at(today, 10, 50), isWalkIn: true, ...doneTimes(at(today, 10, 50), avg) },
    { status: "IN_PROGRESS", createdAt: minsAgo(35), arrivedAt: minsAgo(22), startedAt: minsAgo(4) },
    { status: "ARRIVED", createdAt: minsAgo(24), arrivedAt: minsAgo(9) },
    { status: "WAITING", createdAt: minsAgo(15) },
    { status: "NO_SHOW", createdAt: at(today, 9, 15) },
    { status: "WAITING", createdAt: minsAgo(40), targetTime: minsAhead(110) },
  ];

  doctors.forEach((doc, di) => {
    const specs = di === 0 ? fullBoard(doc.avg) : lightBoard(doc.avg);
    specs.forEach((s, idx) => {
      rows.push(
        buildAppt({
          doctorId: doc.id,
          patientId: pickPatient().id,
          queueDate: today,
          token: idx + 1,
          status: s.status,
          createdAt: s.createdAt,
          isWalkIn: s.isWalkIn ?? false,
          isPriority: s.isPriority ?? false,
          onHold: s.onHold ?? false,
          arrivedAt: s.arrivedAt ?? null,
          startedAt: s.startedAt ?? null,
          doneAt: s.doneAt ?? null,
          targetTime: s.targetTime ?? null,
        }),
      );
    });
  });

  // --- Bulk insert appointments (chunked for Neon) -----------------------
  for (let i = 0; i < rows.length; i += 500) {
    await prisma.appointment.createMany({ data: rows.slice(i, i + 500) });
  }

  // --- Broadcasts --------------------------------------------------------
  await prisma.broadcast.createMany({
    data: [
      { title: "Free eye check-up camp", body: "This Saturday 8am–1pm at the clinic. Walk in — no booking needed.", category: "HEALTH_CAMP", priority: "NORMAL", status: "SENT", sentAt: dayMinus(13), recipientCount: 312, createdById: adminId, createdByName: "Aanya Admin" },
      { title: "Blood donation drive", body: "Donate this Saturday — every unit helps. Refreshments provided.", category: "BLOOD_DONATION", priority: "HIGH", status: "SENT", sentAt: dayMinus(17), recipientCount: 287, createdById: adminId, createdByName: "Aanya Admin" },
      { title: "Dr. Faisal on leave Thursday", body: "Dentistry OPD is closed this Thursday. Other doctors are available.", category: "DOCTOR_UPDATE", priority: "HIGH", status: "SENT", sentAt: dayMinus(6), recipientCount: 156, createdById: adminId, createdByName: "Aanya Admin" },
      { title: "Monsoon flu vaccination", body: "Book your flu shot before the season — slots filling fast.", category: "HEALTH_CAMP", priority: "NORMAL", status: "SCHEDULED", scheduledAt: new Date(todayUtc.getTime() + 2 * DAY + istToUtc(8) * MIN), recipientCount: 0, createdById: adminId, createdByName: "Aanya Admin" },
      { title: "Clinic closed for Diwali", body: "We'll be closed on the festival day and reopen the morning after.", category: "REMINDER", priority: "NORMAL", status: "SCHEDULED", scheduledAt: new Date(todayUtc.getTime() + 5 * DAY + istToUtc(9) * MIN), recipientCount: 0, createdById: adminId, createdByName: "Aanya Admin" },
    ],
  });

  // --- A couple of in-progress WhatsApp chats (for the chat CLI demo) ----
  await prisma.conversation.createMany({
    data: [
      { phone: "+919876500111", state: "CHOOSE_DOCTOR", context: { action: "book", language: "en", patientName: "New Caller", offeredDoctorIds: doctors.map((d) => d.id) } },
      { phone: "+919876500222", state: "CHECK_EMERGENCY", context: { language: "hi" } },
    ],
  });

  const todayCount = doctors.reduce((n, _d, i) => n + (i === 0 ? fullBoard(0).length : lightBoard(0).length), 0);
  console.log(
    [
      "✅ Demo data seeded.",
      "",
      "  Logins:",
      "    admin@clinic.test / admin1234        (ADMIN — sees Doctors + Analytics)",
      "    reception@clinic.test / reception1234 (RECEPTIONIST)",
      "",
      `  ${doctors.length} doctors (open every day), ${patients.length} patients`,
      `  ${rows.length} appointments total — ${todayCount} live today, ~${HISTORY_DAYS} days of history`,
      "  5 broadcasts (3 sent, 2 scheduled), 2 in-progress chats",
      "",
      "  Demo the Live Queue on Dr. Asha Rao — every state is on the board:",
      "    Upcoming(scheduled) · Traveling · Waiting here(+priority) · In consultation",
      "    · Done · No-show · Cancelled · On-hold.",
    ].join("\n"),
  );
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
