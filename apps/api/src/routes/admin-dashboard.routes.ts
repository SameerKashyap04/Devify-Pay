import type { FastifyInstance } from "fastify";
import { prisma } from "@devify/database";
import { adminSessionAuth } from "../middleware/admin-session-auth.js";

export async function adminDashboardRoutes(app: FastifyInstance) {
  app.get("/v1/admin/dashboard/overview", { preHandler: [adminSessionAuth] }, async (req) => {
    const query = req.query as { days?: string };
    const days = Number(query.days ?? 30);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [revenue, successCount, pendingCount, failedCount, refundCount, activeSubs, customerCount] =
      await Promise.all([
        prisma.payment.aggregate({
          where: { status: "SUCCESS", createdAt: { gte: since } },
          _sum: { amount: true },
        }),
        prisma.payment.count({ where: { status: "SUCCESS", createdAt: { gte: since } } }),
        prisma.payment.count({ where: { status: "PENDING_VERIFICATION" } }),
        prisma.payment.count({ where: { status: "FAILED", createdAt: { gte: since } } }),
        prisma.refund.count({ where: { status: "SUCCESS", createdAt: { gte: since } } }),
        prisma.subscription.count({ where: { status: "ACTIVE" } }),
        prisma.customer.count(),
      ]);

    return {
      total_revenue: revenue._sum.amount ?? 0,
      successful_payments: successCount,
      pending_payments: pendingCount,
      failed_payments: failedCount,
      refunds: refundCount,
      active_subscriptions: activeSubs,
      total_customers: customerCount,
      window_days: days,
    };
  });

  app.get("/v1/admin/audit-logs", { preHandler: [adminSessionAuth] }, async (req) => {
    const query = req.query as { resource_type?: string; resource_id?: string };
    const logs = await prisma.auditLog.findMany({
      where: {
        resourceType: query.resource_type,
        resourceId: query.resource_id,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return { data: logs };
  });
}
