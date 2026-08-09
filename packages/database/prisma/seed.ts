import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { hashSecret } from "@devify/crypto";

const prisma = new PrismaClient();

function genSecret(prefix: string) {
  const raw = randomBytes(24).toString("hex");
  return `${prefix}_${raw}`;
}

async function main() {
  console.log("Seeding Devify Pay dev data...");

  // --- Admin account (dev only, change password immediately) ---
  const adminPasswordHash = await hashSecret("ChangeMe123!");
  const admin = await prisma.admin.upsert({
    where: { email: "admin@devify.local" },
    update: {},
    create: {
      email: "admin@devify.local",
      passwordHash: adminPasswordHash,
      name: "Devify Admin",
    },
  });

  // --- Test application: AirMate ---
  const airmate = await prisma.application.upsert({
    where: { slug: "airmate" },
    update: {},
    create: {
      name: "AirMate",
      slug: "airmate",
      description: "AirMate mobile application (test)",
      status: "ACTIVE",
      webhookUrl: "https://api.airmate.example.com/webhooks/devify-pay",
      webhookSecret: randomBytes(24).toString("hex"),
    },
  });

  // --- Test API key ---
  const rawTestKey = genSecret("sk_test");
  const hashedTestKey = await hashSecret(rawTestKey);
  await prisma.apiKey.create({
    data: {
      applicationId: airmate.id,
      environment: "TEST",
      keyPrefix: rawTestKey.slice(0, 14),
      hashedSecret: hashedTestKey,
      status: "ACTIVE",
    },
  });

  // --- Test plan ---
  const plan = await prisma.plan.upsert({
    where: { id: "seed-plan-airmate-pro" },
    update: {},
    create: {
      id: "seed-plan-airmate-pro",
      applicationId: airmate.id,
      name: "AirMate Pro",
      description: "Monthly Pro subscription",
      amount: 19900,
      currency: "INR",
      interval: "MONTH",
      intervalCount: 1,
      active: true,
    },
  });

  // --- Test customer ---
  const customer = await prisma.customer.create({
    data: {
      applicationId: airmate.id,
      name: "Test Customer",
      email: "customer@example.com",
      phone: "9999999999",
    },
  });

  // --- Manual UPI provider row ---
  await prisma.provider.upsert({
    where: { name: "MANUAL_UPI" },
    update: {},
    create: { name: "MANUAL_UPI", isConfigured: true },
  });
  for (const name of ["PHONEPE", "PAYTM", "RAZORPAY"] as const) {
    await prisma.provider.upsert({
      where: { name },
      update: {},
      create: { name, isConfigured: false },
    });
  }

  console.log("Seed complete.");
  console.log("----------------------------------------------------");
  console.log("Admin login: admin@devify.local / ChangeMe123! (CHANGE THIS)");
  console.log(`AirMate TEST secret key (save now, shown once): ${rawTestKey}`);
  console.log(`Plan: ${plan.name}, Customer: ${customer.email}`);
  console.log("----------------------------------------------------");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
