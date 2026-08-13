import type { FastifyInstance } from "fastify";
import { createOrderSchema } from "@devify/validation";
import { apiKeyAuth } from "../middleware/api-key-auth.js";
import { requireIdempotencyKey, storeIdempotentResponse } from "../middleware/idempotency.js";
import { createOrder, getOrderByPublicId, serializeOrder } from "../services/order.service.js";
import { dispatchWebhookEvent } from "../services/webhook.service.js";

export async function orderRoutes(app: FastifyInstance) {
  app.post(
    "/v1/orders",
    { preHandler: [apiKeyAuth, requireIdempotencyKey()] },
    async (req, reply) => {
      const body = createOrderSchema.parse(req.body);
      const order = await createOrder({
        applicationId: req.auth!.applicationId,
        mode: req.auth!.environment,
        body,
      });

      dispatchWebhookEvent({
        applicationId: req.auth!.applicationId,
        eventType: "order.created",
        payload: { order_id: order.publicId, status: order.status },
      }).catch(() => {});

      const responseBody = serializeOrder(order);
      const idem = (req as any).idempotency;
      storeIdempotentResponse({
        key: idem.key,
        requestHash: idem.requestHash,
        applicationId: req.auth!.applicationId,
        statusCode: 201,
        responseBody,
      }).catch(() => {});

      reply.status(201).send(responseBody);
    }
  );

  app.get("/v1/orders/:id", { preHandler: [apiKeyAuth] }, async (req) => {
    const { id } = req.params as { id: string };
    const order = await getOrderByPublicId({ applicationId: req.auth!.applicationId, publicId: id });
    return serializeOrder(order);
  });

  app.get("/v1/orders", { preHandler: [apiKeyAuth] }, async (req) => {
    const { prisma } = await import("@devify/database");
    const orders = await prisma.order.findMany({
      where: { applicationId: req.auth!.applicationId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return { data: orders.map(serializeOrder) };
  });
}
