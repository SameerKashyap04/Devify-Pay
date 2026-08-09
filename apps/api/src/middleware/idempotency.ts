import type { FastifyRequest, FastifyReply } from "fastify";
import { createHash } from "node:crypto";
import { prisma } from "@devify/database";
import { ApiError } from "./error-handler.js";

/**
 * Enforces idempotent POST requests using the `Idempotency-Key` header.
 * If the same key + application is reused with an identical request body,
 * the original stored response is replayed instead of re-executing the
 * operation. A reused key with a *different* body is rejected.
 */
export function requireIdempotencyKey() {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const key = req.headers["idempotency-key"];
    if (!key || typeof key !== "string") {
      throw new ApiError(400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key header is required for this operation");
    }
    if (!req.auth) {
      throw new ApiError(401, "UNAUTHORIZED", "Authentication required");
    }

    const requestHash = createHash("sha256").update(JSON.stringify(req.body ?? {})).digest("hex");

    const existing = await prisma.idempotencyKey.findUnique({ where: { key } });

    if (existing) {
      if (existing.applicationId !== req.auth.applicationId) {
        throw new ApiError(409, "IDEMPOTENCY_KEY_CONFLICT", "Idempotency key already used by another application");
      }
      if (existing.requestHash !== requestHash) {
        throw new ApiError(
          422,
          "IDEMPOTENCY_KEY_MISMATCH",
          "Idempotency key was already used with a different request body"
        );
      }
      if (existing.responseBody && existing.statusCode) {
        reply.status(existing.statusCode).send(existing.responseBody);
        return reply; // short-circuits the route handler
      }
    }

    (req as any).idempotency = { key, requestHash, isNew: !existing };
  };
}

/** Call after a successful handler to persist the response for future replay. */
export async function storeIdempotentResponse(params: {
  key: string;
  requestHash: string;
  applicationId: string;
  statusCode: number;
  responseBody: unknown;
}) {
  await prisma.idempotencyKey.upsert({
    where: { key: params.key },
    update: {
      statusCode: params.statusCode,
      responseBody: params.responseBody as any,
    },
    create: {
      key: params.key,
      applicationId: params.applicationId,
      requestHash: params.requestHash,
      statusCode: params.statusCode,
      responseBody: params.responseBody as any,
    },
  });
}
