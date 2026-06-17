// Create (or reset) the initial admin staff account from environment variables.
// Idempotent: upserts by email. Run with: npm run db:seed:admin
//
// Required env: SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD
// Optional env: SEED_ADMIN_NAME (defaults to "Administrator")

import { PrismaClient } from "@prisma/client";

import { hashPassword } from "../src/auth/passwords.js";
import { StaffRole } from "../src/auth/staff.js";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME ?? "Administrator";

  if (!email || !password) {
    console.error(
      "Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD before running this script.",
    );
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);
  const staff = await prisma.staff.upsert({
    where: { email },
    create: {
      email,
      passwordHash,
      name,
      role: StaffRole.ADMIN,
      active: true,
    },
    update: { passwordHash, role: StaffRole.ADMIN, active: true },
  });

  console.log(`Admin ready: ${staff.email} (role=${staff.role}).`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
