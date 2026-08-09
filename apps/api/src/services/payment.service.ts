import { prisma } from "@devify/database";
import { generatePublicId } from "@devify/crypto";
import { assertValidTransition, assertValidOrderTransition } from "@devify/payment-core";
import type { PaymentProviderName } from "@devify/types";
import { ApiError } from "../middleware/error-handler.js";
import { buildProviderRegistry } from "../providers/registry.js";
import { dispatchWebhookEvent } from "./webhook.service.js";
import { recordAuditLog } from "./audit.service.js";

const providerRegistry = buildProviderRegistry();

export async function createPayment(params: {
  applicationId: string;
  mode: "TEST" | "LIVE";
  orderPublicId: string;
  method: "UPI" | "CARD" | "NETBANKING" | "WALLET" | "OTHER";
}) {
  const order = await prisma.order.findFirst({
    where: { publicId: params.orderPublicId, applicationId: params.applicationId },
  });
  if (!order) throw new ApiError(404, "ORDER_NOT_FOUND", "Order not found");
  if (order.status !== "PENDING") {
    throw new ApiError(422, "ORDER_NOT_PAYABLE", `Order is in status ${order.status} and cannot accept a new payment`);
  }
  if (params.method !== "UPI") {
    throw new ApiError(400, "METHOD_NOT_SUPPORTED", "Only UPI is supported in V1");
  }

  const publicPaymentId = generatePublicId("pay");
  const providerName: PaymentProviderName = "manual_upi";
  const provider = providerRegistry.get(providerName);

  const payment = await prisma.payment.create({
    data: {
      publicId: publicPaymentId,
      orderId: order.id,
      applicationId: order.applicationId,
      customerId: order.customerId,
      amount: order.amount,
      currency: order.currency,
      method: "UPI",
      status: "CREATED",
      mode: params.mode,
      provider: "MANUAL_UPI",
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 min QR expiry
    },
  });

  const result = await provider.createPayment({
    paymentId: payment.id,
    publicPaymentId: payment.publicId,
    orderId: order.publicId,
    amount: payment.amount,
    currency: payment.currency,
    reference: order.publicId,
    mode: params.mode,
  });

  assertValidTransition("CREATED", "PENDING");

  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: "PENDING",
      upiUri: result.upiUri,
      qrImageUrl: result.qrDataUrl,
    },
  });

  await prisma.paymentAttempt.create({
    data: {
      paymentId: payment.id,
      provider: "MANUAL_UPI",
      providerPaymentId: result.providerPaymentId,
      amount: payment.amount,
      status: "PENDING",
    },
  });

  await dispatchWebhookEvent({
    applicationId: order.applicationId,
    eventType: "payment.created",
    payload: { payment_id: updated.publicId, order_id: order.publicId, status: updated.status },
  });

  return updated;
}

export async function getPaymentByPublicId(params: { applicationId?: string; publicId: string }) {
  const payment = await prisma.payment.findFirst({
    where: {
      publicId: params.publicId,
      ...(params.applicationId ? { applicationId: params.applicationId } : {}),
    },
    include: { order: true, application: true },
  });
  if (!payment) throw new ApiError(404, "PAYMENT_NOT_FOUND", "Payment not found");
  return payment;
}

/** Customer submits the UPI transaction/reference ID from the hosted checkout page. */
export async function submitPaymentConfirmation(params: { publicId: string; transactionId: string }) {
  const payment = await prisma.payment.findUnique({ where: { publicId: params.publicId } });
  if (!payment) throw new ApiError(404, "PAYMENT_NOT_FOUND", "Payment not found");

  if (payment.status !== "PENDING") {
    throw new ApiError(
      422,
      "INVALID_PAYMENT_STATE",
      `Payment is in status ${payment.status}; confirmation is only accepted while PENDING`
    );
  }

  assertValidTransition(payment.status as any, "PENDING_VERIFICATION");

  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: "PENDING_VERIFICATION",
      transactionRef: params.transactionId,
    },
  });

  await dispatchWebhookEvent({
    applicationId: payment.applicationId,
    eventType: "payment.pending",
    payload: { payment_id: updated.publicId, status: updated.status },
  });

  return updated;
}

/**
 * Admin approves or rejects a payment that is PENDING_VERIFICATION.
 * This is the ONLY path that can move a manual-UPI payment to SUCCESS —
 * it is never set automatically from customer-submitted data.
 */
export async function adminVerifyPayment(params: {
  paymentPublicId: string;
  action: "APPROVE" | "REJECT";
  adminId: string;
  note?: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  const payment = await prisma.payment.findUnique({
    where: { publicId: params.paymentPublicId },
    include: { order: true },
  });
  if (!payment) throw new ApiError(404, "PAYMENT_NOT_FOUND", "Payment not found");

  if (payment.status !== "PENDING_VERIFICATION") {
    throw new ApiError(
      422,
      "INVALID_PAYMENT_STATE",
      `Payment is in status ${payment.status}; only PENDING_VERIFICATION payments can be verified`
    );
  }

  const newStatus = params.action === "APPROVE" ? "SUCCESS" : "FAILED";
  assertValidTransition(payment.status as any, newStatus as any);

  const result = await prisma.$transaction(async (tx: any) => {
    const updatedPayment = await tx.payment.update({
      where: { id: payment.id },
      data: { status: newStatus },
    });

    if (newStatus === "SUCCESS") {
      assertValidOrderTransition(payment.order.status as any, "PAID");
      await tx.order.update({ where: { id: payment.order.id }, data: { status: "PAID" } });

      await tx.transaction.create({
        data: {
          paymentId: payment.id,
          orderId: payment.order.id,
          applicationId: payment.applicationId,
          type: "PAYMENT",
          amount: payment.amount,
          currency: payment.currency,
          status: "SUCCESS",
          provider: "MANUAL_UPI",
          referenceId: payment.transactionRef ?? undefined,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        actorType: "ADMIN",
        actorId: params.adminId,
        action: params.action === "APPROVE" ? "payment.approved" : "payment.rejected",
        resourceType: "payment",
        resourceId: payment.id,
        metadata: { note: params.note },
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      },
    });

    return updatedPayment;
  });

  await dispatchWebhookEvent({
    applicationId: payment.applicationId,
    eventType: newStatus === "SUCCESS" ? "payment.success" : "payment.failed",
    payload: { payment_id: result.publicId, order_id: payment.order.publicId, status: result.status },
  });

  if (newStatus === "SUCCESS") {
    await dispatchWebhookEvent({
      applicationId: payment.applicationId,
      eventType: "order.paid",
      payload: { order_id: payment.order.publicId, status: "PAID" },
    });
  }

  return result;
}

export function serializePayment(payment: {
  publicId: string;
  amount: number;
  currency: string;
  status: string;
  method: string;
  upiUri: string | null;
  qrImageUrl: string | null;
  expiresAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: payment.publicId,
    amount: payment.amount,
    currency: payment.currency,
    status: payment.status,
    method: payment.method,
    upi_uri: payment.upiUri,
    qr_image: payment.qrImageUrl,
    expires_at: payment.expiresAt?.toISOString() ?? null,
    created_at: payment.createdAt.toISOString(),
  };
}
