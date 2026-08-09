import type { FastifyInstance } from "fastify";
import { createPaymentSchema, paymentConfirmationSchema } from "@devify/validation";
import { apiKeyAuth } from "../middleware/api-key-auth.js";
import { requireIdempotencyKey, storeIdempotentResponse } from "../middleware/idempotency.js";
import {
  createPayment,
  getPaymentByPublicId,
  serializePayment,
  submitPaymentConfirmation,
} from "../services/payment.service.js";

export async function paymentRoutes(app: FastifyInstance) {
  app.post(
    "/v1/payments",
    { preHandler: [apiKeyAuth, requireIdempotencyKey()] },
    async (req, reply) => {
      const body = createPaymentSchema.parse(req.body);
      const payment = await createPayment({
        applicationId: req.auth!.applicationId,
        mode: req.auth!.environment,
        orderPublicId: body.order_id,
        method: body.method,
      });

      const { env } = await import("../config/env.js");
      const responseBody = {
        ...serializePayment(payment),
        checkout_url: `${env.CHECKOUT_URL}/${payment.publicId}`,
      };

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

  app.get("/v1/payments/:id", { preHandler: [apiKeyAuth] }, async (req) => {
    const { id } = req.params as { id: string };
    const payment = await getPaymentByPublicId({ applicationId: req.auth!.applicationId, publicId: id });
    return serializePayment(payment);
  });

  app.get("/v1/payments", { preHandler: [apiKeyAuth] }, async (req) => {
    const { prisma } = await import("@devify/database");
    const payments = await prisma.payment.findMany({
      where: { applicationId: req.auth!.applicationId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return { data: payments.map(serializePayment) };
  });

  // Public endpoint used by the hosted checkout page (no API key — the
  // payment's own unguessable public ID is the access control here).
  app.post("/v1/payments/:id/confirmation", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = paymentConfirmationSchema.parse(req.body);
    const payment = await submitPaymentConfirmation({ publicId: id, transactionId: body.transaction_id });
    reply.status(200).send(serializePayment(payment));
  });

  // Public: fetch payment details for rendering the checkout page (limited fields).
  app.get("/v1/checkout/:id", async (req) => {
    const { id } = req.params as { id: string };
    const payment = await getPaymentByPublicId({ publicId: id });
    return {
      id: payment.publicId,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      upi_uri: payment.upiUri,
      qr_image: payment.qrImageUrl,
      expires_at: payment.expiresAt,
      order_id: payment.order.publicId,
      description: payment.order.description,
    };
  });
}
