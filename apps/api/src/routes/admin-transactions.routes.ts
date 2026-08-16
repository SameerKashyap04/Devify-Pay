import type { FastifyInstance } from "fastify";
import { prisma } from "@devify/database";
import { adminSessionAuth } from "../middleware/admin-session-auth.js";

export async function adminTransactionRoutes(app: FastifyInstance) {
  /**
   * GET /v1/admin/transactions
   * Returns paginated transactions enriched with:
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
      page?: string;
      limit?: string;
    };

    const page = Math.max(1, parseInt(query.page || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || "15", 10)));
    const skip = (page - 1) * limit;

    const days = query.days ? Number(query.days) : undefined;
    const since = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : undefined;

    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    if (query.application_id) where.applicationId = query.application_id;
    if (since) where.createdAt = { gte: since };

    if (query.q) {
      const search = query.q.trim();
      where.OR = [
        { referenceId: { contains: search, mode: "insensitive" } },
        { id: { contains: search, mode: "insensitive" } },
        { application: { name: { contains: search, mode: "insensitive" } } },
        {
          payment: {
            OR: [
              { publicId: { contains: search, mode: "insensitive" } },
              { transactionRef: { contains: search, mode: "insensitive" } },
              {
                customer: {
                  OR: [
                    { name: { contains: search, mode: "insensitive" } },
                    { email: { contains: search, mode: "insensitive" } },
                    { phone: { contains: search, mode: "insensitive" } },
                  ],
                },
              },
            ],
          },
        },
        {
          order: {
            OR: [
              { publicId: { contains: search, mode: "insensitive" } },
              { description: { contains: search, mode: "insensitive" } },
            ],
          },
        },
      ];
    }

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
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
        skip,
        take: limit,
      }),
      prisma.transaction.count({ where }),
    ]);

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

    const data = transactions.map((t: any) => {
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

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
      total,
    };
  });
}
