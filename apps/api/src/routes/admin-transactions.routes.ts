import type { FastifyInstance } from "fastify";
import { prisma } from "@devify/database";
import { adminSessionAuth } from "../middleware/admin-session-auth.js";

export async function adminTransactionRoutes(app: FastifyInstance) {
  /**
   * GET /v1/admin/transactions
   * Returns all transactions enriched with:
   *   - customer name / email / phone
   *   - application name
   *   - amount + currency
   *   - subscription plan name + description (looked up via customer + application)
   *   - payment method & transaction reference
   */
  app.get("/v1/admin/transactions", { preHandler: [adminSessionAuth] }, async (req) => {
    const query = req.query as {
      status?: string;
      type?: string;
      application_id?: string;
      q?: string;
      days?: string;
      limit?: string;
    };

    const days = query.days ? Number(query.days) : undefined;
    const since = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : undefined;
    const limit = Math.min(Number(query.limit ?? 200), 500);

    const transactions = await prisma.transaction.findMany({
      where: {
        ...(query.status ? { status: query.status as any } : {}),
        ...(query.type ? { type: query.type as any } : {}),
        ...(query.application_id ? { applicationId: query.application_id } : {}),
        ...(since ? { createdAt: { gte: since } } : {}),
      },
      include: {
        application: { select: { id: true, name: true } },
        payment: {
          select: {
            publicId: true,
            method: true,
            transactionRef: true,
            customerId: true,
            customer: {
              select: { name: true, email: true, phone: true },
            },
          },
        },
        order: {
          select: {
            publicId: true,
            customerId: true,
            description: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    // Collect unique (customerId, applicationId) pairs for subscription lookup
    const customerAppPairs: { customerId: string; applicationId: string }[] = [];
    for (const t of transactions) {
      const cid = t.payment?.customerId ?? null;
      if (cid) {
        customerAppPairs.push({ customerId: cid, applicationId: t.applicationId });
      }
    }

    // Bulk fetch active subscriptions + their plans
    let subMap = new Map<string, { planName: string; planDescription: string | null; interval: string }>();
    if (customerAppPairs.length > 0) {
      const subs = await prisma.subscription.findMany({
        where: {
          OR: customerAppPairs.map((p) => ({
            customerId: p.customerId,
            applicationId: p.applicationId,
          })),
        },
        include: { plan: { select: { name: true, description: true, interval: true, intervalCount: true } } },
      });
      for (const s of subs) {
        const key = `${s.customerId}::${s.applicationId}`;
        if (!subMap.has(key)) {
          subMap.set(key, {
            planName: s.plan.name,
            planDescription: s.plan.description ?? null,
            interval: `${s.plan.intervalCount} × ${s.plan.interval}`,
          });
        }
      }
    }

    let data = transactions.map((t: any) => {
      const customer = t.payment?.customer ?? null;
      const customerName = customer?.name ?? customer?.email ?? customer?.phone ?? "Unknown";
      const customerEmail = customer?.email ?? null;
      const customerPhone = customer?.phone ?? null;
      const customerId = t.payment?.customerId ?? null;

      const subKey = `${customerId}::${t.applicationId}`;
      const sub = subMap.get(subKey);

      return {
        id: t.id,
        type: t.type,
        status: t.status,
        amount: t.amount,
        currency: t.currency,
        reference_id: t.referenceId ?? null,
        provider: t.provider,
        created_at: t.createdAt.toISOString(),

        // Application
        application_id: t.applicationId,
        application_name: t.application.name,

        // Customer
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,

        // Payment link
        payment_id: t.payment?.publicId ?? null,
        payment_method: t.payment?.method ?? null,
        payment_transaction_ref: t.payment?.transactionRef ?? null,

        // Order description (one-time payment note)
        order_id: t.order?.publicId ?? null,
        order_description: t.order?.description ?? null,

        // Subscription / plan description
        plan_name: sub?.planName ?? null,
        plan_description: sub?.planDescription ?? null,
        plan_interval: sub?.interval ?? null,
      };
    });

    // Apply search filter (post-DB for cross-field searching)
    if (query.q) {
      const q = query.q.toLowerCase();
      data = data.filter(
        (row: any) =>
          row.customer_name?.toLowerCase().includes(q) ||
          row.customer_email?.toLowerCase().includes(q) ||
          row.customer_phone?.includes(q) ||
          row.application_name?.toLowerCase().includes(q) ||
          row.reference_id?.toLowerCase().includes(q) ||
          row.plan_name?.toLowerCase().includes(q) ||
          row.payment_id?.toLowerCase().includes(q) ||
          row.order_id?.toLowerCase().includes(q)
      );
    }

    return { data, total: data.length };
  });
}
