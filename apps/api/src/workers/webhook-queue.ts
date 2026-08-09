import { Queue } from "bullmq";
import { redisConnection } from "../config/redis.js";

export interface WebhookDeliveryJob {
  webhookEventId: string;
}

export const webhookDeliveryQueue = new Queue<WebhookDeliveryJob>("webhook-delivery", {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 1000,
    removeOnFail: false, // keep failed jobs for admin/debug visibility
  },
});
