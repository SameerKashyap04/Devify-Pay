import type { FastifyInstance } from "fastify";
import { prisma } from "@devify/database";
import { adminSessionAuth } from "../middleware/admin-session-auth.js";
import { calculateNextBillingDate } from "../services/subscription.service.js";
import { dispatchWebhookEvent } from "../services/webhook.service.js";
import { createPlanSchema } from "@devify/validation";
import { ApiError } from "../middleware/error-handler.js";

export async function adminSubscriptionRoutes(app: FastifyInstance) {
  /**
   * GET /v1/admin/subscriptions
   * Returns paginated subscriptions enriched with application, customer, and plan details.
   */
  app.get("/v1/admin/subscriptions", { preHandler: [adminSessionAuth] }, async (req) => {
    const query = req.query as {
      status?: string;
      application_id?: string;
      plan_id?: string;
      q?: string;
      page?: string;
      limit?: string;
    };

    const page = Math.max(1, parseInt(query.page || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || "15", 10)));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.application_id) where.applicationId = query.application_id;
    if (query.plan_id) where.planId = query.plan_id;

    if (query.q) {
      const search = query.q.trim();
      where.OR = [
        { id: { contains: search, mode: "insensitive" } },
        { application: { name: { contains: search, mode: "insensitive" } } },
        { plan: { name: { contains: search, mode: "insensitive" } } },
        {
          customer: {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { phone: { contains: search, mode: "insensitive" } },
            ],
          },
        },
      ];
    }

    const [subs, total, allActive] = await Promise.all([
      prisma.subscription.findMany({
        where,
        include: {
          application: { select: { id: true, name: true, slug: true } },
          customer: { select: { id: true, name: true, email: true, phone: true } },
          plan: {
            select: {
              id: true,
              name: true,
              description: true,
              amount: true,
              currency: true,
              interval: true,
              intervalCount: true,
              active: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.subscription.count({ where }),
      prisma.subscription.findMany({
        where: { status: "ACTIVE" },
        include: { plan: { select: { amount: true, interval: true, intervalCount: true } } },
      }),
    ]);

    // Calculate approximate Monthly Recurring Revenue (MRR)
    let mrrPaise = 0;
    for (const s of allActive) {
      if (!s.plan) continue;
      const count = Math.max(1, s.plan.intervalCount);
      if (s.plan.interval === "MONTH") {
        mrrPaise += Math.round(s.plan.amount / count);
      } else if (s.plan.interval === "YEAR") {
        mrrPaise += Math.round(s.plan.amount / (12 * count));
      } else if (s.plan.interval === "WEEK") {
        mrrPaise += Math.round((s.plan.amount * 4.33) / count);
      } else if (s.plan.interval === "DAY") {
        mrrPaise += Math.round((s.plan.amount * 30) / count);
      }
    }

    const data = subs.map((s: any) => ({
      subscription_id: s.id,
      status: s.status,
      start_date: s.startDate?.toISOString() ?? null,
      end_date: s.endDate?.toISOString() ?? null,
      cancelled_at: s.cancelledAt?.toISOString() ?? null,
      created_at: s.createdAt.toISOString(),
      updated_at: s.updatedAt.toISOString(),
      metadata: s.metadata,

      // Application
      application_id: s.application.id,
      application_name: s.application.name,

      // Customer
      customer_id: s.customer.id,
      customer_name: s.customer.name ?? s.customer.email ?? s.customer.phone ?? "Unknown",
      customer_email: s.customer.email ?? null,
      customer_phone: s.customer.phone ?? null,

      // Plan
      plan_id: s.plan.id,
      plan_name: s.plan.name,
      plan_description: s.plan.description ?? null,
      plan_amount: s.plan.amount,
      plan_currency: s.plan.currency,
      plan_interval: s.plan.interval,
      plan_interval_count: s.plan.intervalCount,
    }));

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
      stats: {
        total,
        active_count: allActive.length,
        mrr_paise: mrrPaise,
      },
    };
  });

  /**
   * POST /v1/admin/subscriptions/:id/activate
   * Manually activate a subscription from the admin dashboard.
   */
  app.post("/v1/admin/subscriptions/:id/activate", { preHandler: [adminSessionAuth] }, async (req) => {
    const { id } = req.params as { id: string };
    const sub = await prisma.subscription.findUnique({
      where: { id },
      include: { plan: true },
    });

    if (!sub) throw new ApiError(404, "SUBSCRIPTION_NOT_FOUND", "Subscription not found");

    const now = new Date();
    const endDate = calculateNextBillingDate(now, sub.plan.interval, sub.plan.intervalCount);

    const updated = await prisma.subscription.update({
      where: { id },
      data: {
        status: "ACTIVE",
        startDate: sub.startDate ?? now,
        endDate,
        cancelledAt: null,
      },
      include: { application: true, customer: true, plan: true },
    });

    await dispatchWebhookEvent({
      applicationId: updated.applicationId,
      eventType: "subscription.activated",
      payload: {
        subscription_id: updated.id,
        status: updated.status,
        start_date: updated.startDate?.toISOString(),
        end_date: updated.endDate?.toISOString(),
      },
    });

    return updated;
  });

  /**
   * POST /v1/admin/subscriptions/:id/cancel
   * Manually cancel a subscription from the admin dashboard.
   */
  app.post("/v1/admin/subscriptions/:id/cancel", { preHandler: [adminSessionAuth] }, async (req) => {
    const { id } = req.params as { id: string };
    const sub = await prisma.subscription.update({
      where: { id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
      },
      include: { application: true, customer: true, plan: true },
    });

    await dispatchWebhookEvent({
      applicationId: sub.applicationId,
      eventType: "subscription.cancelled",
      payload: {
        subscription_id: sub.id,
        status: sub.status,
        cancelled_at: sub.cancelledAt?.toISOString(),
      },
    });

    return sub;
  });

  /**
   * GET /v1/admin/plans
   * List all plans across all applications for selection/management.
   */
  app.get("/v1/admin/plans", { preHandler: [adminSessionAuth] }, async (req) => {
    const query = req.query as { application_id?: string };
    const plans = await prisma.plan.findMany({
      where: {
        ...(query.application_id ? { applicationId: query.application_id } : {}),
      },
      include: {
        application: { select: { id: true, name: true } },
        _count: { select: { subscriptions: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return { data: plans };
  });

  /**
   * POST /v1/admin/plans
   * Create a new plan from admin.
   */
  app.post("/v1/admin/plans", { preHandler: [adminSessionAuth] }, async (req, reply) => {
    const body = req.body as {
      application_id: string;
      name: string;
      description?: string;
      amount: number;
      currency?: string;
      interval: "DAY" | "WEEK" | "MONTH" | "YEAR";
      interval_count?: number;
    };

    if (!body.application_id || !body.name || !body.amount || !body.interval) {
      throw new ApiError(400, "INVALID_PLAN_DATA", "Application ID, name, amount and interval are required");
    }

    const plan = await prisma.plan.create({
      data: {
        applicationId: body.application_id,
        name: body.name,
        description: body.description,
        amount: body.amount,
        currency: body.currency ?? "INR",
        interval: body.interval,
        intervalCount: body.interval_count ?? 1,
      },
      include: { application: true },
    });

    reply.status(201).send(plan);
  });

  /**
   * POST /v1/admin/subscriptions
   * Manually create a subscription for a customer and plan from admin.
   */
  app.post("/v1/admin/subscriptions", { preHandler: [adminSessionAuth] }, async (req, reply) => {
    const body = req.body as {
      application_id: string;
      plan_id: string;
      customer_name?: string;
      customer_email?: string;
      customer_phone?: string;
      status?: "ACTIVE" | "TRIALING";
    };

    if (!body.application_id || !body.plan_id) {
      throw new ApiError(400, "MISSING_REQUIRED_FIELDS", "Application ID and Plan ID are required");
    }

    const plan = await prisma.plan.findFirst({
      where: { id: body.plan_id, applicationId: body.application_id },
    });
    if (!plan) throw new ApiError(404, "PLAN_NOT_FOUND", "Plan not found for this application");

    // Find or create customer
    let customer: any = null;
    if (body.customer_email || body.customer_phone) {
      customer = await prisma.customer.findFirst({
        where: {
          applicationId: body.application_id,
          OR: [
            ...(body.customer_email ? [{ email: body.customer_email }] : []),
            ...(body.customer_phone ? [{ phone: body.customer_phone }] : []),
          ],
        },
      });
    }

    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          applicationId: body.application_id,
          name: body.customer_name ?? "Admin Customer",
          email: body.customer_email,
          phone: body.customer_phone,
        },
      });
    }

    const now = new Date();
    const status = body.status ?? "ACTIVE";
    const startDate = status === "ACTIVE" ? now : null;
    const endDate = status === "ACTIVE" ? calculateNextBillingDate(now, plan.interval, plan.intervalCount) : null;

    const sub = await prisma.subscription.create({
      data: {
        applicationId: body.application_id,
        customerId: customer.id,
        planId: plan.id,
        status,
        startDate,
        endDate,
        metadata: { created_by: "admin" },
      },
      include: { application: true, customer: true, plan: true },
    });

    await dispatchWebhookEvent({
      applicationId: sub.applicationId,
      eventType: "subscription.created",
      payload: { subscription_id: sub.id, plan_id: plan.id, status: sub.status },
    });

    reply.status(201).send(sub);
  });
}
