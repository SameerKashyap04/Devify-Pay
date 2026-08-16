import { prisma } from "@devify/database";
import { dispatchWebhookEvent } from "./webhook.service.js";

export function calculateNextBillingDate(
  from: Date,
  interval: "DAY" | "WEEK" | "MONTH" | "YEAR",
  intervalCount: number = 1
): Date {
  const d = new Date(from);
  if (interval === "DAY") {
    d.setDate(d.getDate() + intervalCount);
  } else if (interval === "WEEK") {
    d.setDate(d.getDate() + intervalCount * 7);
  } else if (interval === "MONTH") {
    d.setMonth(d.getMonth() + intervalCount);
  } else if (interval === "YEAR") {
    d.setFullYear(d.getFullYear() + intervalCount);
  }
  return d;
}

/**
 * Automatically creates or activates a subscription when an order / payment succeeds.
 * Checks order metadata, customer trialing subs, or matching plan descriptions.
 */
export async function autoActivateSubscriptionForOrder(params: {
  orderId: string;
  paymentId?: string;
  tx?: any;
}) {
  const db = params.tx ?? prisma;

  const order = await db.order.findUnique({
    where: { id: params.orderId },
    include: { customer: true, application: true },
  });

  if (!order || !order.customerId) return null;

  const metadata = (order.metadata as Record<string, any>) || {};
  const planIdFromMeta = metadata.plan_id || metadata.planId;
  const subIdFromMeta = metadata.subscription_id || metadata.subscriptionId;

  let plan: any = null;
  let existingSub: any = null;

  // 1. Explicit subscription ID in order metadata
  if (subIdFromMeta) {
    existingSub = await db.subscription.findUnique({
      where: { id: subIdFromMeta },
      include: { plan: true },
    });
    if (existingSub) {
      plan = existingSub.plan;
    }
  }

  // 2. Explicit plan ID in order metadata
  if (!plan && planIdFromMeta) {
    plan = await db.plan.findUnique({
      where: { id: planIdFromMeta },
    });
  }

  // 3. Match customer's existing TRIALING subscription for this application
  if (!existingSub) {
    existingSub = await db.subscription.findFirst({
      where: {
        customerId: order.customerId,
        applicationId: order.applicationId,
        status: { in: ["TRIALING", "PAST_DUE"] },
        ...(plan ? { planId: plan.id } : {}),
      },
      include: { plan: true },
      orderBy: { createdAt: "desc" },
    });
    if (existingSub && !plan) {
      plan = existingSub.plan;
    }
  }

  // 4. Match plan by order description or amount for this application
  if (!plan) {
    const plans = await db.plan.findMany({
      where: { applicationId: order.applicationId, active: true },
    });

    for (const p of plans) {
      const descLower = (order.description || "").toLowerCase();
      const planNameLower = p.name.toLowerCase();
      if (
        descLower.includes(planNameLower) ||
        (order.amount === p.amount && descLower.includes("sub"))
      ) {
        plan = p;
        break;
      }
    }
  }

  // If no plan is associated with this order, nothing to activate
  if (!plan) return null;

  const now = new Date();
  const endDate = calculateNextBillingDate(now, plan.interval, plan.intervalCount);

  let activeSubscription: any;

  if (existingSub) {
    activeSubscription = await db.subscription.update({
      where: { id: existingSub.id },
      data: {
        status: "ACTIVE",
        startDate: existingSub.startDate ?? now,
        endDate,
        planId: plan.id,
      },
      include: { plan: true, customer: true, application: true },
    });
  } else {
    activeSubscription = await db.subscription.create({
      data: {
        applicationId: order.applicationId,
        customerId: order.customerId,
        planId: plan.id,
        status: "ACTIVE",
        startDate: now,
        endDate,
        metadata: {
          created_via: "auto_payment_verification",
          order_id: order.id,
          order_public_id: order.publicId,
        },
      },
      include: { plan: true, customer: true, application: true },
    });
  }

  // If a paymentId was supplied, update any transaction created to reflect SUBSCRIPTION context
  if (params.paymentId) {
    await db.transaction.updateMany({
      where: { paymentId: params.paymentId },
      data: { type: "PAYMENT" },
    }).catch(() => {});
  }

  // Dispatch webhook
  dispatchWebhookEvent({
    applicationId: order.applicationId,
    eventType: "subscription.activated",
    payload: {
      subscription_id: activeSubscription.id,
      plan_id: plan.id,
      customer_id: order.customerId,
      status: activeSubscription.status,
      start_date: activeSubscription.startDate?.toISOString(),
      end_date: activeSubscription.endDate?.toISOString(),
    },
  }).catch(() => {});

  return activeSubscription;
}
