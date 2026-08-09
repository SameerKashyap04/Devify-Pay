import { prisma } from "@devify/database";
import type { WebhookEventType } from "@devify/types";
import { webhookDeliveryQueue } from "../workers/webhook-queue.js";

/**
 * Persist a webhook event for an application and enqueue immediate delivery.
 * The event is durable (stored in Postgres) before the queue job is created,
 * so delivery can always be retried/replayed even if the worker crashes.
 */
export async function dispatchWebhookEvent(params: {
  applicationId: string;
  eventType: WebhookEventType;
  payload: Record<string, unknown>;
}) {
  const event = await prisma.webhookEvent.create({
    data: {
      applicationId: params.applicationId,
      eventType: params.eventType,
      payload: params.payload as any,
      status: "PENDING",
    },
  });

  await webhookDeliveryQueue.add(
    "deliver",
    { webhookEventId: event.id },
    { attempts: 1 } // retry scheduling is handled manually by the worker via nextAttemptAt
  );

  return event;
}
