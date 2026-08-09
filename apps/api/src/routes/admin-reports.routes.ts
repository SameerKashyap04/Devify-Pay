import type { FastifyInstance } from "fastify";
import { prisma } from "@devify/database";
import { adminSessionAuth } from "../middleware/admin-session-auth.js";

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]!);
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(","));
  }
  return lines.join("\n");
}

export async function adminReportRoutes(app: FastifyInstance) {
  app.get("/v1/admin/reports/revenue", { preHandler: [adminSessionAuth] }, async (req, reply) => {
    const query = req.query as { format?: string; days?: string };
    const days = Number(query.days ?? 30);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const payments = await prisma.payment.findMany({
      where: { status: "SUCCESS", createdAt: { gte: since } },
      include: { application: true, order: true },
      orderBy: { createdAt: "desc" },
    });

    const rows = payments.map((p: any) => ({
      payment_id: p.publicId,
      order_id: p.order.publicId,
      application: p.application.name,
      amount: p.amount,
      currency: p.currency,
      created_at: p.createdAt.toISOString(),
    }));

    if (query.format === "csv") {
      reply.type("text/csv").header("Content-Disposition", "attachment; filename=revenue-report.csv");
      return toCsv(rows);
    }
    return { data: rows };
  });

  app.get("/v1/admin/reports/payments", { preHandler: [adminSessionAuth] }, async (req, reply) => {
    const query = req.query as { format?: string; days?: string };
    const days = Number(query.days ?? 30);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const payments = await prisma.payment.findMany({
      where: { createdAt: { gte: since } },
      include: { application: true },
      orderBy: { createdAt: "desc" },
    });

    const rows = payments.map((p: any) => ({
      payment_id: p.publicId,
      application: p.application.name,
      amount: p.amount,
      status: p.status,
      method: p.method,
      created_at: p.createdAt.toISOString(),
    }));

    if (query.format === "csv") {
      reply.type("text/csv").header("Content-Disposition", "attachment; filename=payments-report.csv");
      return toCsv(rows);
    }
    return { data: rows };
  });

  app.get("/v1/admin/reports/refunds", { preHandler: [adminSessionAuth] }, async (req, reply) => {
    const query = req.query as { format?: string; days?: string };
    const days = Number(query.days ?? 30);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const refunds = await prisma.refund.findMany({
      where: { createdAt: { gte: since } },
      include: { application: true, payment: true },
      orderBy: { createdAt: "desc" },
    });

    const rows = refunds.map((r: any) => ({
      refund_id: r.publicId,
      payment_id: r.payment.publicId,
      application: r.application.name,
      amount: r.amount,
      status: r.status,
      created_at: r.createdAt.toISOString(),
    }));

    if (query.format === "csv") {
      reply.type("text/csv").header("Content-Disposition", "attachment; filename=refunds-report.csv");
      return toCsv(rows);
    }
    return { data: rows };
  });

  app.get("/v1/admin/reports/subscriptions", { preHandler: [adminSessionAuth] }, async (req, reply) => {
    const query = req.query as { format?: string };
    const subs = await prisma.subscription.findMany({
      include: { application: true, plan: true, customer: true },
      orderBy: { createdAt: "desc" },
    });

    const rows = subs.map((s: any) => ({
      subscription_id: s.id,
      application: s.application.name,
      plan: s.plan.name,
      customer: s.customer.email ?? s.customer.phone ?? "N/A",
      status: s.status,
      created_at: s.createdAt.toISOString(),
    }));

    if (query.format === "csv") {
      reply.type("text/csv").header("Content-Disposition", "attachment; filename=subscriptions-report.csv");
      return toCsv(rows);
    }
    return { data: rows };
  });

  app.get("/v1/admin/reports/applications", { preHandler: [adminSessionAuth] }, async (req, reply) => {
    const query = req.query as { format?: string };
    const apps = await prisma.application.findMany({
      include: { _count: { select: { orders: true, payments: true, customers: true } } },
      orderBy: { createdAt: "desc" },
    });

    const rows = apps.map((a: any) => ({
      application: a.name,
      status: a.status,
      orders: a._count.orders,
      payments: a._count.payments,
      customers: a._count.customers,
      created_at: a.createdAt.toISOString(),
    }));

    if (query.format === "csv") {
      reply.type("text/csv").header("Content-Disposition", "attachment; filename=applications-report.csv");
      return toCsv(rows);
    }
    return { data: rows };
  });
}
