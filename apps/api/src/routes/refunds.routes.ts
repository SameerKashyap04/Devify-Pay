import type { FastifyInstance } from "fastify";
import { prisma } from "@devify/database";
import { createRefundSchema } from "@devify/validation";
import { apiKeyAuth } from "../middleware/api-key-auth.js";
import { adminSessionAuth } from "../middleware/admin-session-auth.js";
import { requireIdempotencyKey, storeIdempotentResponse } from "../middleware/idempotency.js";
import { createRefund, recordRefundOutcome } from "../services/refund.service.js";
import { ApiError } from "../middleware/error-handler.js";

export async function refundRoutes(app: FastifyInstance) {
  app.post("/v1/refunds", { preHandler: [apiKeyAuth, requireIdempotencyKey()] }, async (req, reply) => {
    const body = createRefundSchema.parse(req.body);
    const refund = await createRefund({
      applicationId: req.auth!.applicationId,
      paymentPublicId: body.payment_id,
      amount: body.amount,
      reason: body.reason,
    });

    const responseBody = {
      id: refund.publicId,
      payment_id: body.payment_id,
      amount: refund.amount,
      currency: refund.currency,
      status: refund.status,
      created_at: refund.createdAt,
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
  });

  app.get("/v1/refunds/:id", { preHandler: [apiKeyAuth] }, async (req) => {
    const { id } = req.params as { id: string };
    const refund = await prisma.refund.findFirst({
      where: { publicId: id, applicationId: req.auth!.applicationId },
      include: { payment: true },
    });
    if (!refund) throw new ApiError(404, "REFUND_NOT_FOUND", "Refund not found");
    return {
      id: refund.publicId,
      payment_id: refund.payment.publicId,
      amount: refund.amount,
      currency: refund.currency,
      status: refund.status,
      created_at: refund.createdAt,
    };
  });

  // --- Admin: process a refund manually initiated through the bank/provider ---
  app.get("/v1/admin/refunds", { preHandler: [adminSessionAuth] }, async () => {
    const refunds = await prisma.refund.findMany({
      where: { status: { in: ["PENDING", "PROCESSING"] } },
      include: { payment: true, application: true },
      orderBy: { createdAt: "asc" },
    });
    return {
      data: refunds.map((r) => ({
        id: r.publicId,
        payment_id: r.payment.publicId,
        application: r.application.name,
        amount: r.amount,
        currency: r.currency,
        status: r.status,
        reason: r.reason,
        created_at: r.createdAt,
      })),
    };
  });

  app.post("/v1/admin/refunds/:id/record", { preHandler: [adminSessionAuth] }, async (req) => {
    const { id } = req.params as { id: string };
    const { outcome, provider_ref } = req.body as { outcome: "SUCCESS" | "FAILED"; provider_ref?: string };
    const refund = await recordRefundOutcome({
      refundPublicId: id,
      outcome,
      providerRef: provider_ref,
      adminId: req.adminAuth!.adminId,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
    return { id: refund.publicId, status: refund.status };
  });
}
