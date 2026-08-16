/**
 * UPI Auto-Verification Endpoint
 *
 * Called by the Devify Pay Android Companion App running on the merchant's
 * phone. When Google Pay / PhonePe / Paytm sends a push notification for a
 * received payment, the app parses the notification and posts here to
 * automatically verify the matching payment.
 *
 * Two matching strategies:
 *  1. pay_ID match  — Google Pay includes UPI txn note in notification text.
 *  2. Amount match  — Paytm/PhonePe: extract rupee amount from notification,
 *     find the unique PENDING payment for that amount created in last 30 min.
 *
 * Security: protected by a shared secret (x-upi-secret header) stored in SystemConfig.
 */
import type { FastifyInstance } from "fastify";
import { prisma } from "@devify/database";
import { dispatchWebhookEvent } from "../services/webhook.service.js";
import { recordAuditLog } from "../services/audit.service.js";
import { autoActivateSubscriptionForOrder } from "../services/subscription.service.js";
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

      // --- 2. Extract payment ID or amount from body ---
      const body = req.body as {
        tn?: string;           // Devify pay_ID (from GPay)
        note?: string;         // raw notification text
        app?: string;          // UPI app package name
        amount_paise?: number; // amount in paise (from Paytm/PhonePe amount-based matching)
        sender?: string;       // sender name parsed from Paytm notification
        timestamp?: number;
      };

      let paymentPublicId: string | null = body.tn ?? null;

      // If tn not directly provided, extract from notification text (GpayReader pattern)
      if (!paymentPublicId && body.note) {
        const match = body.note.match(PAYMENT_ID_REGEX);
        paymentPublicId = match ? match[0] : null;
      }

      // --- 3. Resolve the payment record ---
      let payment: any = null;

      if (paymentPublicId) {
        // Strategy 1: Direct pay_ID lookup (Google Pay)
        payment = await prisma.payment.findFirst({
          where: { publicId: paymentPublicId, status: "PENDING" },
          include: { order: true },
        });

        if (!payment) {
          app.log.info({ paymentPublicId }, "upi-notify: payment not found or not PENDING");
          return reply.status(200).send({ ok: true, message: "Already processed or not found" });
        }
      } else if (body.amount_paise && body.amount_paise > 0) {
        // Strategy 2: Amount-based lookup (Paytm / PhonePe)
        // Match the most recent active non-expired PENDING payment for this amount
        const now = new Date();
        const windowStart = new Date(Date.now() - 30 * 60 * 1000);

        const candidates = await prisma.payment.findMany({
          where: {
            status: { in: ["PENDING", "PENDING_VERIFICATION"] },
            amount: body.amount_paise,
            expiresAt: { gte: now },
            createdAt: { gte: windowStart },
          },
          include: { order: true },
          orderBy: { createdAt: "desc" },
        });

        if (candidates.length === 0) {
          app.log.warn({ amount_paise: body.amount_paise }, "upi-notify: no PENDING payment found for amount");
          return reply.status(200).send({ ok: false, message: "No matching pending payment found for this amount" });
        }

        // Match the newest non-expired payment created for this amount
        payment = candidates[0];
        paymentPublicId = payment.publicId;
        app.log.info(
          { paymentPublicId, amount_paise: body.amount_paise, sender: body.sender, candidateCount: candidates.length },
          "upi-notify: matched payment via amount (Paytm/PhonePe)"
        );
      } else {
        app.log.warn({ body }, "upi-notify: could not extract payment ID or amount");
        return reply.status(200).send({ ok: false, message: "No payment ID or amount found in payload" });
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

        await autoActivateSubscriptionForOrder({
          orderId: payment.order.id,
          paymentId: payment.id,
          tx,
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
              match_strategy: body.tn ? "pay_id" : "amount_match",
              ...(body.amount_paise && { amount_paise: body.amount_paise }),
              ...(body.sender && { sender_name: body.sender }),
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
