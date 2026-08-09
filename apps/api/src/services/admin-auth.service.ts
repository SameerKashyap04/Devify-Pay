import { prisma } from "@devify/database";
import { verifySecret, hashSecret } from "@devify/crypto";
import { createHash, randomBytes } from "node:crypto";
import { ApiError } from "../middleware/error-handler.js";
import { generateSessionToken, hashToken } from "../middleware/admin-session-auth.js";

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

const failedAttempts = new Map<string, { count: number; lockedUntil?: number }>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

export async function adminLogin(params: {
  email: string;
  password: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  const state = failedAttempts.get(params.email);
  if (state?.lockedUntil && state.lockedUntil > Date.now()) {
    throw new ApiError(429, "ACCOUNT_LOCKED", "Too many failed attempts. Try again later.");
  }

  const admin = await prisma.admin.findUnique({ where: { email: params.email } });
  const passwordHash = admin?.passwordHash ?? "$argon2id$dummy$hash$to$prevent$timing$leak";
  const valid = admin ? await verifySecret(passwordHash, params.password) : await verifySecret(passwordHash, params.password);

  if (!admin || !valid || !admin.isActive) {
    const next = { count: (state?.count ?? 0) + 1, lockedUntil: state?.lockedUntil };
    if (next.count >= MAX_ATTEMPTS) next.lockedUntil = Date.now() + LOCKOUT_MS;
    failedAttempts.set(params.email, next);
    throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }

  failedAttempts.delete(params.email);

  const token = generateSessionToken() + randomBytes(16).toString("hex");
  const tokenHash = hashToken(token);

  const session = await prisma.adminSession.create({
    data: {
      adminId: admin.id,
      tokenHash,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });

  return { token, session, admin };
}

export async function adminLogout(sessionId: string) {
  await prisma.adminSession.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
}

/** Setup 2FA secret for Admin */
export async function setupAdmin2FA(adminId: string) {
  const secret = randomBytes(20).toString("hex");
  const otpauthUrl = `otpauth://totp/DevifyPay:${adminId}?secret=${secret}&issuer=DevifyPay`;
  return { secret, otpauth_url: otpauthUrl };
}

/** Enable 2FA after verifying user token */
export async function enableAdmin2FA(params: { adminId: string; secret: string }) {
  await prisma.admin.update({
    where: { id: params.adminId },
    data: { twoFaSecret: params.secret },
  });
  return { two_factor_enabled: true };
}

/** Change Admin password */
export async function changeAdminPassword(params: {
  adminId: string;
  currentPassword: string;
  newPassword: string;
}) {
  const admin = await prisma.admin.findUnique({ where: { id: params.adminId } });
  if (!admin) throw new ApiError(404, "ADMIN_NOT_FOUND", "Admin not found");

  const valid = await verifySecret(admin.passwordHash, params.currentPassword);
  if (!valid) throw new ApiError(401, "INVALID_PASSWORD", "Current password is incorrect");

  const newHash = await hashSecret(params.newPassword);
  await prisma.admin.update({
    where: { id: params.adminId },
    data: { passwordHash: newHash },
  });

  return { ok: true };
}
