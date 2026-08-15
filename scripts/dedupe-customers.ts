if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://devify:devify@localhost:5432/devify_pay?schema=public";
}

import { prisma } from "@devify/database";

async function dedupeCustomers() {
  console.log("Starting customer deduplication process...");

  const allCustomers = await prisma.customer.findMany({
    orderBy: { createdAt: "asc" },
  });

  console.log(`Found ${allCustomers.length} total customer records in database.`);

  // Group by applicationId and key (normalized email or phone)
  const groups = new Map<string, typeof allCustomers>();

  for (const c of allCustomers) {
    const normEmail = c.email?.trim().toLowerCase();
    const normPhone = c.phone?.trim();

    // Key format: appId:email or appId:phone
    let key: string | null = null;
    if (normEmail) {
      key = `${c.applicationId}:email:${normEmail}`;
    } else if (normPhone) {
      key = `${c.applicationId}:phone:${normPhone}`;
    }

    if (!key) continue; // Skip anonymous customers with neither email nor phone

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(c);
  }

  let mergedGroupsCount = 0;
  let deletedCustomersCount = 0;

  for (const [key, customerList] of groups.entries()) {
    if (customerList.length <= 1) continue;

    mergedGroupsCount++;
    const [primary, ...duplicates] = customerList;
    const dupIds = duplicates.map((d) => d.id);

    console.log(`Merging ${duplicates.length} duplicate customer(s) for key "${key}" into primary customer ID: ${primary.id}`);

    // Consolidate non-null fields into primary customer
    const updateData: Record<string, any> = {};
    for (const dup of duplicates) {
      if (!primary.name && dup.name) {
        updateData.name = dup.name;
        primary.name = dup.name;
      }
      if (!primary.phone && dup.phone) {
        updateData.phone = dup.phone;
        primary.phone = dup.phone;
      }
      if (!primary.email && dup.email) {
        updateData.email = dup.email;
        primary.email = dup.email;
      }
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.customer.update({
        where: { id: primary.id },
        data: updateData,
      });
    }

    // Re-link Orders
    const updatedOrders = await prisma.order.updateMany({
      where: { customerId: { in: dupIds } },
      data: { customerId: primary.id },
    });
    if (updatedOrders.count > 0) {
      console.log(`  Re-linked ${updatedOrders.count} order(s) to primary customer.`);
    }

    // Re-link Payments
    const updatedPayments = await prisma.payment.updateMany({
      where: { customerId: { in: dupIds } },
      data: { customerId: primary.id },
    });
    if (updatedPayments.count > 0) {
      console.log(`  Re-linked ${updatedPayments.count} payment(s) to primary customer.`);
    }

    // Re-link Subscriptions
    const updatedSubs = await prisma.subscription.updateMany({
      where: { customerId: { in: dupIds } },
      data: { customerId: primary.id },
    });
    if (updatedSubs.count > 0) {
      console.log(`  Re-linked ${updatedSubs.count} subscription(s) to primary customer.`);
    }

    // Delete duplicate customer records
    const deleted = await prisma.customer.deleteMany({
      where: { id: { in: dupIds } },
    });
    deletedCustomersCount += deleted.count;
    console.log(`  Deleted ${deleted.count} duplicate customer record(s).`);
  }

  console.log("--------------------------------------------------");
  console.log(`Deduplication complete.`);
  console.log(`Processed ${mergedGroupsCount} customer group(s) with duplicates.`);
  console.log(`Removed ${deletedCustomersCount} duplicate customer record(s).`);
}

dedupeCustomers()
  .catch((err) => {
    console.error("Deduplication failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
