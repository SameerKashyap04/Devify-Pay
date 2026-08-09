import type { FastifyInstance } from "fastify";
import { adminLoginSchema } from "@devify/validation";
import {
  adminLogin,
  adminLogout,
  setupAdmin2FA,
  enableAdmin2FA,
  changeAdminPassword,
} from "../services/admin-auth.service.js";
import { adminSessionAuth } from "../middleware/admin-session-auth.js";
import { env } from "../config/env.js";
import { rateLimits } from "../config/rate-limits.js";

const COOKIE_NAME = "devify_admin_session";

export async function adminAuthRoutes(app: FastifyInstance) {
  // Stricter limit: login is a brute-force target.
  app.post(
    "/v1/admin/auth/login",
    { config: { rateLimit: { max: rateLimits.auth.max, timeWindow: rateLimits.auth.timeWindow } } },
    async (req, reply) => {
      const body = adminLoginSchema.parse(req.body);
      const { token, admin } = await adminLogin({
        email: body.email,
        password: body.password,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      reply.setCookie(COOKIE_NAME, token, {
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 12,
      });

      return { admin: { id: admin.id, email: admin.email, name: admin.name } };
    }
  );

  app.post("/v1/admin/auth/logout", { preHandler: [adminSessionAuth] }, async (req, reply) => {
    await adminLogout(req.adminAuth!.sessionId);
    reply.clearCookie(COOKIE_NAME, { path: "/" });
    return { ok: true };
  });

  app.get("/v1/admin/auth/me", { preHandler: [adminSessionAuth] }, async (req) => {
    return { admin_id: req.adminAuth!.adminId, email: req.adminAuth!.email };
  });

  app.post("/v1/admin/auth/2fa/setup", { preHandler: [adminSessionAuth] }, async (req) => {
    return await setupAdmin2FA(req.adminAuth!.adminId);
  });

  app.post("/v1/admin/auth/2fa/enable", { preHandler: [adminSessionAuth] }, async (req) => {
    const { secret } = req.body as { secret: string };
    return await enableAdmin2FA({ adminId: req.adminAuth!.adminId, secret });
  });

  app.post("/v1/admin/auth/password", { preHandler: [adminSessionAuth] }, async (req) => {
    const { current_password, new_password } = req.body as {
      current_password: string;
      new_password: string;
    };
    return await changeAdminPassword({
      adminId: req.adminAuth!.adminId,
      currentPassword: current_password,
      newPassword: new_password,
    });
  });
}
