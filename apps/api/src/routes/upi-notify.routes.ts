/**
 * UPI Auto-Verification Endpoint
 *
 * Called by the Devify Pay Android Companion App running on the merchant's
 * phone. When Google Pay / PhonePe sends a push notification for a received
 * payment, the app extracts the payment publicId from the notification text
 * and posts it here to automatically verify the payment.
 *
 * Adapted from FreePaymentGateway paymentController.ts → webhook()
 * Security: protected by a shared secret (x-upi-secret header) stored in SystemConfig.
 */
import type { FastifyInstance } from "fastify";
import { prisma } from "@devify/database";
import { dispatchWebhookEvent } from "../services/webhook.service.js";
import { recordAuditLog } from "../services/audit.service.js";
import { rateLimits } from "../config/rate-limits.js";

// Regex to extract Devify Pay payment publicId from Google Pay notification text
// GPay notification text example: "₹500 received from Sameer. Msg: pay_abc123xyz"
const PAYMENT_ID_REGEX = /pay_[a-zA-Z0-9]+/;

export async function upiNotifyRoutes(app: FastifyInstance) {
  app.post(
    "/v1/upi-notify",
    {
      config: {
        rateLimit: {
          max: rateLimits.public.max,
          timeWindow: rateLimits.public.timeWindow,
        },
      },
    },
    async (req, reply) => {
      // --- 1. Authenticate via shared secret ---
      const providedSecret = req.headers["x-upi-secret"] as string | undefined;
      if (!providedSecret) {
        return reply.status(401).send({ error: { message: "Missing x-upi-secret header" } });
      }

      const config = await prisma.systemConfig.findUnique({ where: { id: "singleton" } });
      const storedSecret = config?.upiNotifySecret;

      if (!storedSecret || providedSecret !== storedSecret) {
        return reply.status(401).send({ error: { message: "Invalid UPI notify secret" } });
      }

      // --- 2. Extract payment ID from body ---
      // Adapted from GpayReader index.js + FreePaymentGateway paymentController.ts
      const body = req.body as {
        tn?: string;
        note?: string;
        app?: string;
        amount?: number;
        timestamp?: number;
      };

      let paymentPublicId: string | null = body.tn ?? null;

      // If tn not directly provided, extract from notification text (GpayReader pattern)
      if (!paymentPublicId && body.note) {
        const match = body.note.match(PAYMENT_ID_REGEX);
        paymentPublicId = match ? match[0] : null;
      }

      if (!paymentPublicId) {
        app.log.warn({ body }, "upi-notify: could not extract payment ID");
        // Return 200 always so Android app doesn't retry endlessly (GpayReader pattern)
        return reply.status(200).send({ ok: false, message: "No payment ID found in payload" });
      }

      // --- 3. Atomically verify payment (idempotent) ---
      // Adapted from FreePaymentGateway paymentController.ts → findOneAndUpdate pattern
      // Using Prisma $transaction for atomicity — if not PENDING, no-op (idempotent)
      const payment = await prisma.payment.findFirst({
        where: { publicId: paymentPublicId, status: "PENDING" },
        include: { order: true },
      });

      if (!payment) {
        app.log.info({ paymentPublicId }, "upi-notify: payment not found or not PENDING (already processed or doesn't exist)");
        return reply.status(200).send({ ok: true, message: "Already processed or not found" });
      }

      // --- 4. Mark payment SUCCESS + order PAID in atomic DB transaction ---
      const result = await prisma.$transaction(async (tx: any) => {
        const updatedPayment = await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: "SUCCESS",
            transactionRef: body.tn ?? paymentPublicId,
          },
        });

        await tx.order.update({
          where: { id: payment.order.id },
          data: { status: "PAID" },
        });

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
            referenceId: paymentPublicId,
          },
        });

        await tx.auditLog.create({
          data: {
            actorType: "SYSTEM",
            actorId: "upi-auto-verify",
            action: "payment.auto_verified",
            resourceType: "payment",
            resourceId: payment.id,
            metadata: {
              source: "android_companion_app",
              upi_app: body.app ?? "unknown",
              notification_text: body.note ?? null,
            },
          },
        });

        return updatedPayment;
      });

      app.log.info({ paymentPublicId, orderId: payment.order.publicId }, "upi-notify: payment auto-verified SUCCESS");

      // --- 5. Fire webhooks ---
      await dispatchWebhookEvent({
        applicationId: payment.applicationId,
        eventType: "payment.success",
        payload: {
          payment_id: result.publicId,
          order_id: payment.order.publicId,
          status: "SUCCESS",
          auto_verified: true,
        },
      });

      await dispatchWebhookEvent({
        applicationId: payment.applicationId,
        eventType: "order.paid",
        payload: { order_id: payment.order.publicId, status: "PAID" },
      });

      return reply.status(200).send({ ok: true, message: "Payment verified successfully" });
    }
  );
}
