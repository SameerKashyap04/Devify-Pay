import type { FastifyInstance } from "fastify";
import { prisma } from "@devify/database";
import { adminSessionAuth } from "../middleware/admin-session-auth.js";

export async function adminCustomerRoutes(app: FastifyInstance) {
  app.get("/v1/admin/customers", { preHandler: [adminSessionAuth] }, async (req) => {
    const query = req.query as { q?: string; application_id?: string };

    const customers = await prisma.customer.findMany({
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
      take: 100,
    });

    return {
      data: customers.map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        application: c.application.name,
        orders: c._count.orders,
        payments: c._count.payments,
        subscriptions: c._count.subscriptions,
        created_at: c.createdAt,
      })),
    };
  });
}
