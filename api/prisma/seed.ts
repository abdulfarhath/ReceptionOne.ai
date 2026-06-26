// Development seed: fills every table with realistic queue-model data so the
// dashboard, queue board, patients, analytics and broadcasts all have something
// to show. Idempotent-ish — staff/doctors/patients are upserted; the
// transactional tables (appointments, events, notifications, conversations,
// broadcasts) are wiped and recreated each run.
//
// Availability is stored as minutes-from-midnight in UTC (the domain's time
// policy). The clinic operates in Asia/Kolkata (UTC+5:30).
//
// Run with: npm run db:seed

import { PrismaClient } from "@prisma/client";

import { hashPassword } from "../src/auth/passwords.js";
import { StaffRole } from "../src/auth/staff.js";

const prisma = new PrismaClient();

const IST_OFFSET_MIN = 330; // UTC+5:30
const MIN = 60_000;
const DAY = 86_400_000;

/** Convert an Asia/Kolkata wall-clock hour to minutes-from-midnight UTC. */
function istToUtc(hour: number, minute = 0): number {
  return hour * 60 + minute - IST_OFFSET_MIN;
}

// UTC midnight of today, and helpers to walk back days.
const now = new Date();
const todayUtc = new Date(
  Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
);
const dayMinus = (n: number): Date => new Date(todayUtc.getTime() - n * DAY);

interface Window {
  dayOfWeek: number;
  startMinutes: number;
  endMinutes: number;
}
function weekdayWindows(
  days: number[],
  blocks: Array<[number, number]>,
): Window[] {
  return days.flatMap((dayOfWeek) =>
    blocks.map(([startHour, endHour]) => ({
      dayOfWeek,
      startMinutes: istToUtc(startHour),
      endMinutes: istToUtc(endHour),
    })),
  );
}

const doctors = [
  {
    id: "seed_doctor_asha",
    name: "Dr. Asha Rao",
    phone: "+919059790010",
    department: "General Medicine",
    avgConsultMinutes: 12,
    windows: weekdayWindows(
      [1, 2, 3, 4, 5],
      [
        [9, 13],
        [14, 17],
      ],
    ),
  },
  {
    id: "seed_doctor_vikram",
    name: "Dr. Vikram Singh",
    phone: null,
    department: "Pediatrics",
    avgConsultMinutes: 10,
    windows: weekdayWindows([1, 3, 5], [[10, 16]]),
  },
  {
    id: "seed_doctor_faisal",
    name: "Dr. Faisal Ahmed",
    phone: "+919059790011",
    department: "Dentistry",
    avgConsultMinutes: 20,
    windows: weekdayWindows([1, 2, 3, 4, 5, 6], [[10, 18]]),
  },
];

const patients = [
  { phone: "+919000000001", name: "Riya Sharma", language: "en" },
  { phone: "+919000000002", name: "Arjun Mehta", language: "hi" },
  { phone: "+919000000003", name: "Lakshmi Nair", language: "te" },
  { phone: "+919000000004", name: "Imran Khan", language: "en" },
  { phone: "+919000000005", name: "Sneha Patil", language: "hi" },
  { phone: "+919000000006", name: "Vivaan Gupta", language: "en" },
];

// Per-day status patterns. Past days are mostly seen; today is a live mix.
const PAST = ["DONE", "DONE", "DONE", "NO_SHOW", "CANCELLED"] as const;
const TODAY = [
  "DONE",
  "DONE",
  "IN_PROGRESS",
  "ARRIVED",
  "WAITING",
  "WAITING",
] as const;

type Status = (typeof PAST)[number] | (typeof TODAY)[number];

async function seedEntry(args: {
  doctorId: string;
  patientId: string;
  queueDate: Date;
  token: number;
  status: Status;
  avgConsult: number;
  isWalkIn?: boolean;
  isPriority?: boolean;
}): Promise<void> {
  const { doctorId, patientId, queueDate, token, status, avgConsult } = args;
  // A plausible join time mid-morning IST for that day.
  const joinedAt = new Date(queueDate.getTime() + istToUtc(9, 30) * MIN + token * 6 * MIN);
  const arrivedAt = new Date(joinedAt.getTime() + 25 * MIN);
  const startedAt = new Date(arrivedAt.getTime() + 8 * MIN);
  const doneAt = new Date(startedAt.getTime() + avgConsult * MIN);

  const ts = {
    arrivedAt:
      status === "ARRIVED" || status === "IN_PROGRESS" || status === "DONE"
        ? arrivedAt
        : null,
    startedAt: status === "IN_PROGRESS" || status === "DONE" ? startedAt : null,
    doneAt: status === "DONE" ? doneAt : null,
  };

  const appt = await prisma.appointment.create({
    data: {
      doctorId,
      patientId,
      queueDate,
      token,
      isWalkIn: args.isWalkIn ?? false,
      isPriority: args.isPriority ?? false,
      status,
      createdAt: joinedAt,
      ...ts,
    },
  });

  const events: { type: string; at: Date }[] = [{ type: "JOINED", at: joinedAt }];
  if (ts.arrivedAt) events.push({ type: "ARRIVED", at: ts.arrivedAt });
  if (ts.startedAt) events.push({ type: "STARTED", at: ts.startedAt });
  if (ts.doneAt) events.push({ type: "DONE", at: ts.doneAt });
  if (status === "NO_SHOW") {
    events.push({ type: "NO_SHOW", at: new Date(joinedAt.getTime() + 90 * MIN) });
  }
  if (status === "CANCELLED") {
    events.push({ type: "CANCELLED", at: new Date(joinedAt.getTime() + 30 * MIN) });
  }
  await prisma.appointmentEvent.createMany({
    data: events.map((e) => ({ appointmentId: appt.id, type: e.type, at: e.at })),
  });

  // A couple of vestigial reminder-ledger rows on completed visits.
  if (status === "DONE" && token === 1) {
    await prisma.notification.create({
      data: { appointmentId: appt.id, kind: "REMINDER_24H", sentAt: arrivedAt },
    });
  }
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
        id: doc.id,
        name: doc.name,
        phone: doc.phone,
        department: doc.department,
        slotDurationMinutes: 30,
        avgConsultMinutes: doc.avgConsultMinutes,
      },
      update: {
        name: doc.name,
        phone: doc.phone,
        department: doc.department,
        avgConsultMinutes: doc.avgConsultMinutes,
      },
    });
    await prisma.availability.deleteMany({ where: { doctorId: doc.id } });
    await prisma.availability.createMany({
      data: doc.windows.map((w) => ({ doctorId: doc.id, ...w })),
    });
  }

  // --- Patients ----------------------------------------------------------
  const patientIds: string[] = [];
  for (const [i, p] of patients.entries()) {
    const patient = await prisma.patient.upsert({
      where: { phone: p.phone },
      create: {
        phone: p.phone,
        name: p.name,
        language: p.language,
        consentAt: new Date(todayUtc.getTime() - (30 + i) * DAY),
      },
      update: { name: p.name, language: p.language },
    });
    patientIds.push(patient.id);
  }

  // --- Wipe transactional tables (FK-safe order) -------------------------
  await prisma.notification.deleteMany({});
  await prisma.appointmentEvent.deleteMany({});
  await prisma.appointment.deleteMany({});
  await prisma.conversation.deleteMany({});
  await prisma.broadcast.deleteMany({});

  // --- Queue entries: last 5 days per doctor ----------------------------
  let entryCount = 0;
  for (const off of [4, 3, 2, 1, 0]) {
    const queueDate = dayMinus(off);
    const pattern = off === 0 ? TODAY : PAST;
    for (const [di, doc] of doctors.entries()) {
      let token = 0;
      for (const [pi, status] of pattern.entries()) {
        token += 1;
        await seedEntry({
          doctorId: doc.id,
          patientId: patientIds[(off + di + pi) % patientIds.length]!,
          queueDate,
          token,
          status,
          avgConsult: doc.avgConsultMinutes,
          isWalkIn: pi === pattern.length - 1, // last joiner is a walk-in
          isPriority: off === 0 && pi === 3, // one priority in today's queue
        });
        entryCount += 1;
      }
    }
  }

  // --- Conversations (in-progress chats) --------------------------------
  await prisma.conversation.createMany({
    data: [
      {
        phone: "+919000000777",
        state: "CHOOSE_DOCTOR",
        context: {
          action: "book",
          language: "en",
          patientName: "New Caller",
          offeredDoctorIds: doctors.map((d) => d.id),
        },
      },
      {
        phone: "+919000000888",
        state: "CHECK_EMERGENCY",
        context: { language: "hi" },
      },
    ],
  });

  // --- Broadcasts --------------------------------------------------------
  await prisma.broadcast.createMany({
    data: [
      {
        title: "Free Health Checkup Camp",
        body: "Join our free checkup camp this Sunday, 10 AM–4 PM. Walk-ins welcome.",
        category: "HEALTH_CAMP",
        priority: "HIGH",
        status: "SENT",
        sentAt: dayMinus(2),
        recipientCount: patients.length,
        createdById: adminId,
        createdByName: "Aanya Admin",
      },
      {
        title: "Blood Donation Drive",
        body: "Donate blood and save lives — Saturday at the clinic. Register at reception.",
        category: "BLOOD_DONATION",
        priority: "NORMAL",
        status: "SENT",
        sentAt: dayMinus(1),
        recipientCount: patients.length - 1,
        createdById: adminId,
        createdByName: "Aanya Admin",
      },
      {
        title: "Dr. Faisal on leave Friday",
        body: "Dentistry OPD will be closed this Friday. We'll resume Saturday morning.",
        category: "DOCTOR_UPDATE",
        priority: "NORMAL",
        status: "SCHEDULED",
        scheduledAt: new Date(todayUtc.getTime() + 2 * DAY + istToUtc(9) * MIN),
        recipientCount: 0,
        createdById: adminId,
        createdByName: "Aanya Admin",
      },
    ],
  });

  console.log(
    [
      `Seeded:`,
      `  ${staffSeed.length} staff (admin@clinic.test / admin1234)`,
      `  ${doctors.length} doctors + availability`,
      `  ${patients.length} patients`,
      `  ${entryCount} queue entries (last 5 days, incl. a live queue today)`,
      `  2 conversations, 3 broadcasts, reminder ledger rows`,
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
