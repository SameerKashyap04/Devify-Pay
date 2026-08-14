import type { FastifyInstance } from "fastify";
import { prisma } from "@devify/database";
import { createApplicationSchema } from "@devify/validation";
import { generateApiSecret, hashSecret } from "@devify/crypto";
import { adminSessionAuth } from "../middleware/admin-session-auth.js";
import { recordAuditLog } from "../services/audit.service.js";
import { ApiError } from "../middleware/error-handler.js";

export async function adminApplicationRoutes(app: FastifyInstance) {
  app.get("/v1/admin/applications", { preHandler: [adminSessionAuth] }, async () => {
    const apps = await prisma.application.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { orders: true, payments: true, apiKeys: true } } },
    });
    return { data: apps };
  });

  app.get("/v1/admin/applications/:id", { preHandler: [adminSessionAuth] }, async (req) => {
    const { id } = req.params as { id: string };
    const application = await prisma.application.findUnique({ where: { id } });
    if (!application) throw new ApiError(404, "APPLICATION_NOT_FOUND", "Application not found");
    return application;
  });


  app.post("/v1/admin/applications", { preHandler: [adminSessionAuth] }, async (req, reply) => {
    const body = createApplicationSchema.parse(req.body);
    const application = await prisma.application.create({
      data: {
        name: body.name,
        slug: body.slug,
        description: body.description,
        webhookUrl: body.webhook_url,
        webhookSecret: generateApiSecret("live").replace("sk_live_", "whsec_"),
      },
    });

    await recordAuditLog({
      actorType: "ADMIN",
      actorId: req.adminAuth!.adminId,
      action: "application.created",
      resourceType: "application",
      resourceId: application.id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    reply.status(201).send(application);
  });

  app.post(
    "/v1/admin/applications/:id/status",
    { preHandler: [adminSessionAuth] },
    async (req) => {
      const { id } = req.params as { id: string };
      const { status } = req.body as { status: "ACTIVE" | "DISABLED" | "SUSPENDED" };
      const application = await prisma.application.update({ where: { id }, data: { status } });

      await recordAuditLog({
        actorType: "ADMIN",
        actorId: req.adminAuth!.adminId,
        action: "application.status_changed",
        resourceType: "application",
        resourceId: id,
        metadata: { status },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      return application;
    }
  );

  // --- API keys ---

  app.post("/v1/admin/applications/:id/api-keys", { preHandler: [adminSessionAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { environment } = req.body as { environment: "TEST" | "LIVE" };

    const application = await prisma.application.findUnique({ where: { id } });
    if (!application) throw new ApiError(404, "APPLICATION_NOT_FOUND", "Application not found");

    const rawKey = generateApiSecret(environment === "LIVE" ? "live" : "test");
    const hashed = await hashSecret(rawKey);

    const apiKey = await prisma.apiKey.create({
      data: {
        applicationId: id,
        environment,
        keyPrefix: rawKey.slice(0, 14),
        hashedSecret: hashed,
        status: "ACTIVE",
      },
    });

    await recordAuditLog({
      actorType: "ADMIN",
      actorId: req.adminAuth!.adminId,
      action: "api_key.created",
      resourceType: "api_key",
      resourceId: apiKey.id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    // The raw secret is returned exactly once and never stored or logged again.
    reply.status(201).send({
      id: apiKey.id,
      environment: apiKey.environment,
      key_prefix: apiKey.keyPrefix,
      secret: rawKey,
      created_at: apiKey.createdAt,
    });
  });

  app.get("/v1/admin/applications/:id/api-keys", { preHandler: [adminSessionAuth] }, async (req) => {
    const { id } = req.params as { id: string };
    const keys = await prisma.apiKey.findMany({
      where: { applicationId: id },
      select: {
        id: true,
        environment: true,
        keyPrefix: true,
        status: true,
        lastUsedAt: true,
        createdAt: true,
        revokedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return { data: keys };
  });

  app.post("/v1/admin/api-keys/:keyId/revoke", { preHandler: [adminSessionAuth] }, async (req) => {
    const { keyId } = req.params as { keyId: string };
    const key = await prisma.apiKey.update({
      where: { id: keyId },
      data: { status: "REVOKED", revokedAt: new Date() },
    });

    await recordAuditLog({
      actorType: "ADMIN",
      actorId: req.adminAuth!.adminId,
      action: "api_key.revoked",
      resourceType: "api_key",
      resourceId: keyId,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    return { id: key.id, status: key.status };
  });
}
