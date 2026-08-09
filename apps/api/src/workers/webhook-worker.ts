import { Worker, type Job } from "bullmq";
import { prisma } from "@devify/database";
import { buildSignedWebhookRequest, nextRetryDelaySeconds } from "@devify/webhook";
import type { WebhookEventType } from "@devify/types";
import { redisConnection } from "../config/redis.js";
import { webhookDeliveryQueue, type WebhookDeliveryJob } from "./webhook-queue.js";

const REQUEST_TIMEOUT_MS = 10_000;

export function startWebhookWorker() {
  const worker = new Worker<WebhookDeliveryJob>(
    "webhook-delivery",
    async (job: Job<WebhookDeliveryJob>) => {
      const event = await prisma.webhookEvent.findUnique({
        where: { id: job.data.webhookEventId },
        include: { application: { include: { } } },
      });
      if (!event) return;

      const endpoint = await prisma.webhookEndpoint.findFirst({
        where: { applicationId: event.applicationId, isActive: true },
        orderBy: { createdAt: "desc" },
      });

      // Fall back to the legacy application.webhookUrl/webhookSecret fields
      const url = endpoint?.url ?? event.application.webhookUrl ?? undefined;
      const secret = endpoint?.secret ?? event.application.webhookSecret ?? undefined;

      if (!url || !secret) {
        await prisma.webhookEvent.update({
          where: { id: event.id },
          data: { status: "FAILED", responseBody: "No webhook endpoint configured" },
        });
        return;
      }

      const signed = buildSignedWebhookRequest({
        eventType: event.eventType as WebhookEventType,
        payload: event.payload as Record<string, unknown>,
        secret,
      });

      const attemptsMade = event.attemptCount + 1;

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        const res = await fetch(url, {
          method: "POST",
          headers: signed.headers,
          body: signed.body,
          signal: controller.signal,
        });
        clearTimeout(timeout);

        const bodyText = await res.text().catch(() => "");

        if (res.ok) {
          await prisma.webhookEvent.update({
            where: { id: event.id },
            data: {
              status: "DELIVERED",
              attemptCount: attemptsMade,
              lastAttemptAt: new Date(),
              responseStatus: res.status,
              responseBody: bodyText.slice(0, 2000),
              nextAttemptAt: null,
            },
          });
          return;
        }

        await scheduleRetryOrFail(event.id, attemptsMade, res.status, bodyText);
      } catch (err) {
        await scheduleRetryOrFail(event.id, attemptsMade, null, String(err));
      }
    },
    { connection: redisConnection, concurrency: 10 }
  );

  worker.on("failed", (job, err) => {
    console.error(`webhook job ${job?.id} failed`, err);
  });

  return worker;
}

async function scheduleRetryOrFail(
  eventId: string,
  attemptsMade: number,
  responseStatus: number | null,
  responseBody: string
) {
  const delaySeconds = nextRetryDelaySeconds(attemptsMade);

  if (delaySeconds === null) {
    await prisma.webhookEvent.update({
      where: { id: eventId },
      data: {
        status: "FAILED",
        attemptCount: attemptsMade,
        lastAttemptAt: new Date(),
        responseStatus: responseStatus ?? undefined,
        responseBody: responseBody.slice(0, 2000),
        nextAttemptAt: null,
      },
    });
    return;
  }

  const nextAttemptAt = new Date(Date.now() + delaySeconds * 1000);
  await prisma.webhookEvent.update({
    where: { id: eventId },
    data: {
      status: "RETRYING",
      attemptCount: attemptsMade,
      lastAttemptAt: new Date(),
      responseStatus: responseStatus ?? undefined,
      responseBody: responseBody.slice(0, 2000),
      nextAttemptAt,
    },
  });

  await webhookDeliveryQueue.add(
    "deliver",
    { webhookEventId: eventId },
    { delay: delaySeconds * 1000 }
  );
}
