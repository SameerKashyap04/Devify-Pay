import type { FastifyInstance } from "fastify";
import { prisma } from "@devify/database";
import { createSubscriptionSchema } from "@devify/validation";
import { apiKeyAuth } from "../middleware/api-key-auth.js";
import { requireIdempotencyKey, storeIdempotentResponse } from "../middleware/idempotency.js";
import { dispatchWebhookEvent } from "../services/webhook.service.js";
import { getOrCreateCustomer } from "../services/customer.service.js";
import { ApiError } from "../middleware/error-handler.js";

export async function subscriptionRoutes(app: FastifyInstance) {
  app.get("/v1/plans", { preHandler: [apiKeyAuth] }, async (req) => {
    const plans = await prisma.plan.findMany({
      where: { applicationId: req.auth!.applicationId, active: true },
      orderBy: { createdAt: "desc" },
    });
    return { data: plans };
  });

  // --- Subscriptions (V1: manual renewal, no automatic recurring UPI collection) ---
  app.post(
    "/v1/subscriptions",
    { preHandler: [apiKeyAuth, requireIdempotencyKey()] },
    async (req, reply) => {
      const body = createSubscriptionSchema.parse(req.body);

      const plan = await prisma.plan.findFirst({
        where: { id: body.plan_id, applicationId: req.auth!.applicationId, active: true },
      });
      if (!plan) throw new ApiError(404, "PLAN_NOT_FOUND", "Plan not found");

      let customer = await getOrCreateCustomer({
        applicationId: req.auth!.applicationId,
        name: body.customer.name,
        email: body.customer.email,
        phone: body.customer.phone,
      });

      if (!customer) {
        customer = await prisma.customer.create({
          data: {
            applicationId: req.auth!.applicationId,
            name: body.customer.name,
            email: body.customer.email,
            phone: body.customer.phone,
          },
        });
      }

      const subscription = await prisma.subscription.create({
        data: {
          applicationId: req.auth!.applicationId,
          customerId: customer.id,
          planId: plan.id,
          status: "TRIALING",
          metadata: body.metadata as any,
        },
      });

      await dispatchWebhookEvent({
        applicationId: req.auth!.applicationId,
        eventType: "subscription.created",
        payload: { subscription_id: subscription.id, plan_id: plan.id, status: subscription.status },
      });

      const responseBody = subscription;
      const idem = (req as any).idempotency;
      await storeIdempotentResponse({
        key: idem.key,
        requestHash: idem.requestHash,
        applicationId: req.auth!.applicationId,
        statusCode: 201,
        responseBody,
      });

      reply.status(201).send(responseBody);
    }
  );

  app.get("/v1/subscriptions/:id", { preHandler: [apiKeyAuth] }, async (req) => {
    const { id } = req.params as { id: string };
    const sub = await prisma.subscription.findFirst({
      where: { id, applicationId: req.auth!.applicationId },
    });
    if (!sub) throw new ApiError(404, "SUBSCRIPTION_NOT_FOUND", "Subscription not found");
    return sub;
  });



  app.post("/v1/subscriptions/:id/cancel", { preHandler: [apiKeyAuth] }, async (req) => {
    const { id } = req.params as { id: string };
    const sub = await prisma.subscription.update({
      where: { id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });

    await dispatchWebhookEvent({
      applicationId: sub.applicationId,
      eventType: "subscription.cancelled",
      payload: { subscription_id: sub.id, status: sub.status },
    });

    return sub;
  });
}
