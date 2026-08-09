import type { FastifyInstance } from "fastify";
import { prisma } from "@devify/database";
import { adminVerifyPaymentSchema } from "@devify/validation";
import { adminSessionAuth } from "../middleware/admin-session-auth.js";
import { adminVerifyPayment, serializePayment } from "../services/payment.service.js";

export async function adminPaymentRoutes(app: FastifyInstance) {
  app.get("/v1/admin/payments", { preHandler: [adminSessionAuth] }, async (req) => {
    const query = req.query as { status?: string; application_id?: string; q?: string };
    const payments = await prisma.payment.findMany({
      where: {
        status: query.status ? (query.status as any) : undefined,
        applicationId: query.application_id,
        ...(query.q
          ? {
              OR: [
                { publicId: { contains: query.q } },
                { transactionRef: { contains: query.q } },
              ],
            }
          : {}),
      },
      include: { order: true, application: true, customer: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return {
      data: payments.map((p) => ({
        ...serializePayment(p),
        order_id: p.order.publicId,
        application: p.application.name,
        customer_email: p.customer?.email ?? null,
        transaction_ref: p.transactionRef,
      })),
    };
  });

  app.get("/v1/admin/payments/pending-verification", { preHandler: [adminSessionAuth] }, async () => {
    const payments = await prisma.payment.findMany({
      where: { status: "PENDING_VERIFICATION" },
      include: { order: true, application: true, customer: true },
      orderBy: { createdAt: "asc" },
    });

    return {
      data: payments.map((p) => ({
        payment_id: p.publicId,
        order_id: p.order.publicId,
        application: p.application.name,
        customer: p.customer?.email ?? p.customer?.phone ?? "N/A",
        amount: p.amount,
        currency: p.currency,
        transaction_ref: p.transactionRef,
        created_at: p.createdAt.toISOString(),
      })),
    };
  });

  app.post("/v1/admin/payments/:id/verify", { preHandler: [adminSessionAuth] }, async (req) => {
    const { id } = req.params as { id: string };
    const body = adminVerifyPaymentSchema.parse(req.body);
    const payment = await adminVerifyPayment({
      paymentPublicId: id,
      action: body.action,
      note: body.note,
      adminId: req.adminAuth!.adminId,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
    return serializePayment(payment);
  });
}
