import type { FastifyInstance } from "fastify";
import { prisma } from "@devify/database";
import { adminSessionAuth } from "../middleware/admin-session-auth.js";

export async function adminCustomerRoutes(app: FastifyInstance) {
  app.get("/v1/admin/customers", { preHandler: [adminSessionAuth] }, async (req) => {
    const query = req.query as { q?: string; application_id?: string };

    const rawCustomers = await prisma.customer.findMany({
      where: {
        applicationId: query.application_id,
        ...(query.q
          ? {
              OR: [
                { email: { contains: query.q, mode: "insensitive" } },
                { phone: { contains: query.q } },
                { name: { contains: query.q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: {
        application: true,
        _count: { select: { orders: true, payments: true, subscriptions: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    // Aggregate duplicate customers by applicationId + (email or phone)
    const aggregatedMap = new Map<string, any>();

    for (const c of rawCustomers) {
      const emailKey = c.email?.trim().toLowerCase();
      const phoneKey = c.phone?.trim();
      const groupKey = emailKey
        ? `${c.applicationId}:email:${emailKey}`
        : phoneKey
        ? `${c.applicationId}:phone:${phoneKey}`
        : `id:${c.id}`;

      if (!aggregatedMap.has(groupKey)) {
        aggregatedMap.set(groupKey, {
          id: c.id,
          name: c.name,
          email: c.email,
          phone: c.phone,
          application: c.application.name,
          orders: c._count.orders,
          payments: c._count.payments,
          subscriptions: c._count.subscriptions,
          created_at: c.createdAt,
        });
      } else {
        const existing = aggregatedMap.get(groupKey);
        existing.orders += c._count.orders;
        existing.payments += c._count.payments;
        existing.subscriptions += c._count.subscriptions;
        if (!existing.name && c.name) existing.name = c.name;
        if (!existing.email && c.email) existing.email = c.email;
        if (!existing.phone && c.phone) existing.phone = c.phone;
      }
    }

    return {
      data: Array.from(aggregatedMap.values()),
    };
  });

  app.post("/v1/admin/customers/dedupe", { preHandler: [adminSessionAuth] }, async () => {
    const allCustomers = await prisma.customer.findMany({
      orderBy: { createdAt: "asc" },
    });

    const groups = new Map<string, typeof allCustomers>();

    for (const c of allCustomers) {
      const normEmail = c.email?.trim().toLowerCase();
      const normPhone = c.phone?.trim();

      let key: string | null = null;
      if (normEmail) {
        key = `${c.applicationId}:email:${normEmail}`;
      } else if (normPhone) {
        key = `${c.applicationId}:phone:${normPhone}`;
      }

      if (!key) continue;

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(c);
    }

    let mergedGroupsCount = 0;
    let deletedCustomersCount = 0;

    for (const [key, customerList] of groups.entries()) {
      if (customerList.length <= 1) continue;
      const primary = customerList[0];
      if (!primary) continue;

      const duplicates = customerList.slice(1);
      mergedGroupsCount++;
      const dupIds = duplicates.map((d) => d.id);

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

      await prisma.order.updateMany({
        where: { customerId: { in: dupIds } },
        data: { customerId: primary.id },
      });

      await prisma.payment.updateMany({
        where: { customerId: { in: dupIds } },
        data: { customerId: primary.id },
      });

      await prisma.subscription.updateMany({
        where: { customerId: { in: dupIds } },
        data: { customerId: primary.id },
      });

      const deleted = await prisma.customer.deleteMany({
        where: { id: { in: dupIds } },
      });
      deletedCustomersCount += deleted.count;
    }

    return {
      success: true,
      merged_groups: mergedGroupsCount,
      deleted_records: deletedCustomersCount,
    };
  });
}
