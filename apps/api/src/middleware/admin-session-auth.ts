import type { FastifyRequest, FastifyReply } from "fastify";
import { createHash } from "node:crypto";
import { prisma } from "@devify/database";
import { ApiError } from "./error-handler.js";

export interface AdminAuthContext {
  adminId: string;
  email: string;
  sessionId: string;
}

declare module "fastify" {
  interface FastifyRequest {
    adminAuth?: AdminAuthContext;
  }
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function generateSessionToken() {
  return createHash("sha256").update(`${Date.now()}-${Math.random()}`).digest("hex") + Date.now().toString(36);
}

/**
 * Authenticates admin dashboard requests via the `devify_admin_session`
 * cookie. Sessions are opaque random tokens; only their SHA-256 hash is
 * stored, and each session has a hard expiration.
 */
export async function adminSessionAuth(req: FastifyRequest, _reply: FastifyReply) {
  const authHeader = req.headers.authorization;
  const token = req.cookies?.["devify_admin_session"] || (authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null);
  if (!token) {
    throw new ApiError(401, "UNAUTHORIZED", "Admin session required");
  }

  const tokenHash = hashToken(token);
  const session = await prisma.adminSession.findFirst({
    where: { tokenHash, revokedAt: null },
    include: { admin: true },
  });

  if (!session || session.expiresAt < new Date()) {
    throw new ApiError(401, "UNAUTHORIZED", "Session expired or invalid");
  }
  if (!session.admin.isActive) {
    throw new ApiError(403, "FORBIDDEN", "Admin account is disabled");
  }

  req.adminAuth = { adminId: session.adminId, email: session.admin.email, sessionId: session.id };
}

export { hashToken };
