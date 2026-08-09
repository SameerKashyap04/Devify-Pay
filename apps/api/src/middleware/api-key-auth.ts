import type { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@devify/database";
import { verifySecret } from "@devify/crypto";
import { ApiError } from "./error-handler.js";

export interface AuthContext {
  applicationId: string;
  applicationSlug: string;
  environment: "TEST" | "LIVE";
  apiKeyId: string;
}

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}

/**
 * Authenticates requests via `Authorization: Bearer sk_live_xxx` / `sk_test_xxx`.
 * - Looks up the key by its stored prefix (fast, indexed)
 * - Verifies the full secret against the Argon2id hash (never stored raw)
 * - Rejects revoked keys and disabled/suspended applications
 * - Updates last-used timestamp asynchronously (fire-and-forget)
 */
export async function apiKeyAuth(req: FastifyRequest, _reply: FastifyReply) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    throw new ApiError(401, "UNAUTHORIZED", "Missing or invalid Authorization header");
  }

  const rawKey = header.slice("Bearer ".length).trim();
  if (!rawKey.startsWith("sk_test_") && !rawKey.startsWith("sk_live_")) {
    throw new ApiError(401, "UNAUTHORIZED", "Malformed API key");
  }

  const environment = rawKey.startsWith("sk_live_") ? "LIVE" : "TEST";
  const prefix = rawKey.slice(0, 14);

  const candidates = await prisma.apiKey.findMany({
    where: { keyPrefix: prefix, status: "ACTIVE" },
    include: { application: true },
  });

  for (const candidate of candidates) {
    const matches = await verifySecret(candidate.hashedSecret, rawKey);
    if (!matches) continue;

    if (candidate.application.status !== "ACTIVE") {
      throw new ApiError(403, "APPLICATION_DISABLED", "Application is not active");
    }

    req.auth = {
      applicationId: candidate.applicationId,
      applicationSlug: candidate.application.slug,
      environment,
      apiKeyId: candidate.id,
    };

    // Fire-and-forget last-used update; don't block the request on it.
    prisma.apiKey
      .update({ where: { id: candidate.id }, data: { lastUsedAt: new Date() } })
      .catch((err) => req.log.warn({ err }, "failed_to_update_api_key_last_used"));

    return;
  }

  throw new ApiError(401, "UNAUTHORIZED", "Invalid or revoked API key");
}
