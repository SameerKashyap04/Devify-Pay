import { hmacSign, buildSignedPayload } from "@devify/crypto";
import type { WebhookEventType } from "@devify/types";

export interface SignedWebhookRequest {
  headers: {
    "Content-Type": "application/json";
    "X-Devify-Timestamp": string;
    "X-Devify-Signature": string;
    "X-Devify-Event": WebhookEventType;
  };
  body: string;
}

/**
 * Build a signed webhook request. Signature = HMAC_SHA256(secret, `${timestamp}.${body}`)
 * Applications verify by recomputing the same HMAC with their webhook secret.
 */
export function buildSignedWebhookRequest(params: {
  eventType: WebhookEventType;
  payload: Record<string, unknown>;
  secret: string;
}): SignedWebhookRequest {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const body = JSON.stringify(payload_with_meta(params.eventType, params.payload));
  const signature = hmacSign(buildSignedPayload(timestamp, body), params.secret);

  return {
    headers: {
      "Content-Type": "application/json",
      "X-Devify-Timestamp": timestamp,
      "X-Devify-Signature": signature,
      "X-Devify-Event": params.eventType,
    },
    body,
  };
}

function payload_with_meta(eventType: WebhookEventType, payload: Record<string, unknown>) {
  return {
    event: eventType,
    created_at: new Date().toISOString(),
    data: payload,
  };
}

/**
 * Default retry schedule in seconds, overridable via
 * WEBHOOK_RETRY_SCHEDULE_SECONDS env var (comma-separated).
 */
export function getRetrySchedule(): number[] {
  const raw = process.env.WEBHOOK_RETRY_SCHEDULE_SECONDS;
  if (!raw) return [0, 30, 120, 600, 1800, 7200];
  return raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n >= 0);
}

/** Given the current attempt count (1-indexed, attempts already made), return seconds until next retry, or null if exhausted. */
export function nextRetryDelaySeconds(attemptsMade: number): number | null {
  const schedule = getRetrySchedule();
  if (attemptsMade >= schedule.length) return null;
  return schedule[attemptsMade] ?? null;
}
