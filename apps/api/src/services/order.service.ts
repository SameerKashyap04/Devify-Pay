import { prisma } from "@devify/database";
import { generatePublicId } from "@devify/crypto";
import type { CreateOrderBody } from "@devify/validation";
import { ApiError } from "../middleware/error-handler.js";

export async function createOrder(params: {
  applicationId: string;
  mode: "TEST" | "LIVE";
  body: CreateOrderBody;
}) {
  const { applicationId, mode, body } = params;

  let customerId: string | undefined;
  if (body.customer?.email || body.customer?.phone) {
    const customer = await prisma.customer.create({
      data: {
        applicationId,
        name: body.customer.name,
        email: body.customer.email,
        phone: body.customer.phone,
      },
    });
    customerId = customer.id;
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
      metadata: body.metadata as any,
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
