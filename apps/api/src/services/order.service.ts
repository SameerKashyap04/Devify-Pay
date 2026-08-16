import { prisma } from "@devify/database";
import { generatePublicId } from "@devify/crypto";
import type { CreateOrderBody } from "@devify/validation";
import { ApiError } from "../middleware/error-handler.js";
import { getOrCreateCustomer } from "./customer.service.js";

export async function createOrder(params: {
  applicationId: string;
  mode: "TEST" | "LIVE";
  body: CreateOrderBody;
}) {
  const { applicationId, mode, body } = params;

  let customerId: string | undefined;
  if (body.customer?.email || body.customer?.phone) {
    const customer = await getOrCreateCustomer({
      applicationId,
      name: body.customer.name,
      email: body.customer.email,
      phone: body.customer.phone,
    });
    customerId = customer?.id;
  }

  const metadata: Record<string, any> = { ...((body.metadata as Record<string, any>) || {}) };
  let planId = metadata.plan_id || metadata.planId;

  if (!planId && body.description) {
    const plans = await prisma.plan.findMany({ where: { applicationId, active: true } });
    const matched = plans.find(
      (p) =>
        body.description?.toLowerCase().includes(p.name.toLowerCase()) ||
        (p.amount === body.amount && body.description?.toLowerCase().includes("sub"))
    );
    if (matched) planId = matched.id;
  }

  if (customerId && planId) {
    const existingSub = await prisma.subscription.findFirst({
      where: { customerId, planId, applicationId },
    });
    if (!existingSub) {
      const newSub = await prisma.subscription.create({
        data: {
          applicationId,
          customerId,
          planId,
          status: "TRIALING",
          metadata: { created_via: "order_creation" },
        },
      });
      metadata.subscription_id = newSub.id;
      metadata.plan_id = planId;
    } else {
      metadata.subscription_id = existingSub.id;
      metadata.plan_id = planId;
    }
  }

  const order = await prisma.order.create({
    data: {
      publicId: generatePublicId("ord"),
      applicationId,
      customerId,
      amount: body.amount,
      currency: body.currency ?? "INR",
      description: body.description,
      status: "PENDING",
      mode,
      metadata,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h default expiry
    },
  });

  return order;
}

export async function getOrderByPublicId(params: { applicationId: string; publicId: string }) {
  const order = await prisma.order.findFirst({
    where: { publicId: params.publicId, applicationId: params.applicationId },
  });
  if (!order) {
    throw new ApiError(404, "ORDER_NOT_FOUND", "Order not found");
  }
  return order;
}

export function serializeOrder(order: {
  publicId: string;
  amount: number;
  currency: string;
  status: string;
  description: string | null;
  createdAt: Date;
}) {
  return {
    id: order.publicId,
    amount: order.amount,
    currency: order.currency,
    status: order.status,
    description: order.description,
    created_at: order.createdAt.toISOString(),
  };
}
