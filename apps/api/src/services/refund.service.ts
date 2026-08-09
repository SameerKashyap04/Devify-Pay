import { prisma } from "@devify/database";
import { generatePublicId } from "@devify/crypto";
import { ApiError } from "../middleware/error-handler.js";
import { dispatchWebhookEvent } from "./webhook.service.js";
import { recordAuditLog } from "./audit.service.js";

export async function createRefund(params: {
  applicationId: string;
  paymentPublicId: string;
  amount?: number;
  reason?: string;
}) {
  const payment = await prisma.payment.findFirst({
    where: { publicId: params.paymentPublicId, applicationId: params.applicationId },
  });
  if (!payment) throw new ApiError(404, "PAYMENT_NOT_FOUND", "Payment not found");
  if (payment.status !== "SUCCESS" && payment.status !== "PARTIALLY_REFUNDED") {
    throw new ApiError(422, "PAYMENT_NOT_REFUNDABLE", "Only successful payments can be refunded");
  }

  const existingRefunds = await prisma.refund.findMany({
    where: { paymentId: payment.id, status: { in: ["SUCCESS", "PROCESSING", "PENDING"] } },
  });
  const alreadyRefunded = existingRefunds.reduce((sum: number, r: any) => sum + r.amount, 0);
  const refundAmount = params.amount ?? payment.amount - alreadyRefunded;

  if (refundAmount <= 0 || alreadyRefunded + refundAmount > payment.amount) {
    throw new ApiError(422, "INVALID_REFUND_AMOUNT", "Refund amount exceeds remaining refundable balance");
  }

  const refund = await prisma.refund.create({
    data: {
      publicId: generatePublicId("rfnd"),
      paymentId: payment.id,
      applicationId: payment.applicationId,
      amount: refundAmount,
      currency: payment.currency,
      status: "PENDING",
      reason: params.reason,
    },
  });

  await dispatchWebhookEvent({
    applicationId: payment.applicationId,
    eventType: "refund.created",
    payload: { refund_id: refund.publicId, payment_id: payment.publicId, amount: refundAmount, status: refund.status },
  });

  return refund;
}

/**
 * Admin records the outcome of a refund they processed manually through
 * the actual bank/merchant/provider interface. Devify Pay never claims to
 * have executed the refund itself.
 */
export async function recordRefundOutcome(params: {
  refundPublicId: string;
  outcome: "SUCCESS" | "FAILED";
  providerRef?: string;
  adminId: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  const refund = await prisma.refund.findUnique({ where: { publicId: params.refundPublicId }, include: { payment: true } });
  if (!refund) throw new ApiError(404, "REFUND_NOT_FOUND", "Refund not found");
  if (refund.status !== "PENDING" && refund.status !== "PROCESSING") {
    throw new ApiError(422, "INVALID_REFUND_STATE", `Refund is in status ${refund.status}`);
  }

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.refund.update({
      where: { id: refund.id },
      data: { status: params.outcome, providerRef: params.providerRef },
    });

    if (params.outcome === "SUCCESS") {
      const totalRefunded = await tx.refund.aggregate({
        where: { paymentId: refund.paymentId, status: "SUCCESS" },
        _sum: { amount: true },
      });
      const sum = (totalRefunded._sum.amount ?? 0);
      const fullyRefunded = sum >= refund.payment.amount;

      await tx.payment.update({
        where: { id: refund.paymentId },
        data: { status: fullyRefunded ? "REFUNDED" : "PARTIALLY_REFUNDED" },
      });
      await tx.order.update({
        where: { id: (await tx.payment.findUnique({ where: { id: refund.paymentId } }))!.orderId },
        data: { status: fullyRefunded ? "REFUNDED" : "PARTIALLY_REFUNDED" },
      });

      await tx.transaction.create({
        data: {
          paymentId: refund.paymentId,
          applicationId: refund.applicationId,
          type: "REFUND",
          amount: refund.amount,
          currency: refund.currency,
          status: "SUCCESS",
          provider: "MANUAL_UPI",
          referenceId: params.providerRef,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        actorType: "ADMIN",
        actorId: params.adminId,
        action: params.outcome === "SUCCESS" ? "refund.approved" : "refund.failed",
        resourceType: "refund",
        resourceId: refund.id,
        metadata: { provider_ref: params.providerRef },
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      },
    });

    return updated;
  });

  await dispatchWebhookEvent({
    applicationId: refund.applicationId,
    eventType: params.outcome === "SUCCESS" ? "refund.success" : "refund.failed",
    payload: { refund_id: result.publicId, payment_id: refund.payment.publicId, status: result.status },
  });

  return result;
}
