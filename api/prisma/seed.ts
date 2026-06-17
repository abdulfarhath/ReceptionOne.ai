// Database seed: two doctors with weekly availability. Idempotent — safe to
// re-run (doctors are upserted by id; their availability is replaced).
//
// Availability is stored as minutes-from-midnight in UTC (the domain's time
// policy). The clinic operates in Asia/Kolkata (UTC+5:30), so local hours are
// converted to UTC here via istToUtc().
//
// Run with: npm run db:seed

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const IST_OFFSET_MIN = 330; // UTC+5:30

/** Convert an Asia/Kolkata wall-clock time to minutes-from-midnight UTC. */
function istToUtc(hour: number, minute = 0): number {
  return hour * 60 + minute - IST_OFFSET_MIN;
}

interface Window {
  dayOfWeek: number; // 0=Sun .. 6=Sat
  startMinutes: number;
  endMinutes: number;
}

interface SeedDoctor {
  id: string;
  name: string;
  department: string;
  slotDurationMinutes: number;
  windows: Window[];
}

/** Mon–Fri morning + afternoon clinic, with the same IST hours each day. */
function weekdayWindows(
  days: number[],
  blocks: Array<[number, number]>, // [startIstHour, endIstHour]
): Window[] {
  return days.flatMap((dayOfWeek) =>
    blocks.map(([startHour, endHour]) => ({
      dayOfWeek,
      startMinutes: istToUtc(startHour),
      endMinutes: istToUtc(endHour),
    })),
  );
}

const doctors: SeedDoctor[] = [
  {
    id: "seed_doctor_asha",
    name: "Dr. Asha Rao",
    department: "General Medicine",
    slotDurationMinutes: 30,
    // Mon–Fri, 09:00–13:00 and 14:00–17:00 IST.
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
    department: "Pediatrics",
    slotDurationMinutes: 20,
    // Mon, Wed, Fri, 10:00–16:00 IST.
    windows: weekdayWindows([1, 3, 5], [[10, 16]]),
  },
];

async function main(): Promise<void> {
  for (const doc of doctors) {
    await prisma.doctor.upsert({
      where: { id: doc.id },
      create: {
        id: doc.id,
        name: doc.name,
        department: doc.department,
        slotDurationMinutes: doc.slotDurationMinutes,
      },
      update: {
        name: doc.name,
        department: doc.department,
        slotDurationMinutes: doc.slotDurationMinutes,
      },
    });

    // Replace availability so re-seeding stays idempotent.
    await prisma.availability.deleteMany({ where: { doctorId: doc.id } });
    await prisma.availability.createMany({
      data: doc.windows.map((w) => ({ doctorId: doc.id, ...w })),
    });

    console.log(
      `Seeded ${doc.name} (${doc.department}) with ${doc.windows.length} availability windows.`,
    );
  }
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
