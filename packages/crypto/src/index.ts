import { randomBytes, createHmac, timingSafeEqual } from "node:crypto";
import argon2 from "argon2";

/**
 * Generate a cryptographically random, non-sequential public ID.
 * Example: generatePublicId("ord") -> "ord_8f92k3a1b7c4d9e2"
 */
export function generatePublicId(prefix: string, bytes = 12): string {
  const id = randomBytes(bytes).toString("base64url");
  return `${prefix}_${id}`;
}

/**
 * Generate a raw API secret key. Format: sk_{env}_{random}
 * The raw value is only ever shown once, at creation time.
 */
export function generateApiSecret(env: "test" | "live"): string {
  const random = randomBytes(24).toString("hex");
  return `sk_${env}_${random}`;
}

/** Argon2id hash of a secret (API key or password). */
export async function hashSecret(secret: string): Promise<string> {
  return argon2.hash(secret, { type: argon2.argon2id });
}

/** Verify a secret against a stored Argon2id hash. */
export async function verifySecret(hash: string, secret: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, secret);
  } catch {
    return false;
  }
}

/**
 * HMAC-SHA256 sign a payload string with a secret. Used for both
 * outbound webhook signatures and inbound request signing verification.
 */
export function hmacSign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/** Constant-time comparison of two signature strings. */
export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Build the canonical string that gets signed for webhook delivery
 * and for HMAC-signed application requests: `${timestamp}.${body}`
 */
export function buildSignedPayload(timestamp: string, body: string): string {
  return `${timestamp}.${body}`;
}

/**
 * Verify an inbound/outbound signature, rejecting requests whose
 * timestamp is outside the allowed replay window (default 5 minutes).
 */
export function verifySignatureWithReplayProtection(params: {
  signature: string;
  timestamp: string;
  body: string;
  secret: string;
  toleranceSeconds?: number;
}): { valid: boolean; reason?: string } {
  const { signature, timestamp, body, secret, toleranceSeconds = 300 } = params;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) {
    return { valid: false, reason: "INVALID_TIMESTAMP" };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - ts) > toleranceSeconds) {
    return { valid: false, reason: "TIMESTAMP_OUT_OF_RANGE" };
  }

  const expected = hmacSign(buildSignedPayload(timestamp, body), secret);
  if (!safeCompare(expected, signature)) {
    return { valid: false, reason: "SIGNATURE_MISMATCH" };
  }

  return { valid: true };
}
