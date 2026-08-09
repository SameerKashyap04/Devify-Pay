import type { FastifyInstance } from "fastify";
import { prisma } from "@devify/database";
import { createWebhookEndpointSchema } from "@devify/validation";
import { generateApiSecret } from "@devify/crypto";
import { apiKeyAuth } from "../middleware/api-key-auth.js";
import { ApiError } from "../middleware/error-handler.js";

export async function webhookEndpointRoutes(app: FastifyInstance) {
  app.post("/v1/webhook-endpoints", { preHandler: [apiKeyAuth] }, async (req, reply) => {
    const body = createWebhookEndpointSchema.parse(req.body);
    const secret = generateApiSecret("live").replace("sk_live_", "whsec_");

    const endpoint = await prisma.webhookEndpoint.create({
      data: { applicationId: req.auth!.applicationId, url: body.url, secret },
    });

    // Secret is shown once at creation; store only for the application to
    // configure their verifier, never re-displayed in full afterwards.
    reply.status(201).send({ id: endpoint.id, url: endpoint.url, secret: endpoint.secret, created_at: endpoint.createdAt });
  });

  app.get("/v1/webhook-endpoints", { preHandler: [apiKeyAuth] }, async (req) => {
    const endpoints = await prisma.webhookEndpoint.findMany({
      where: { applicationId: req.auth!.applicationId },
      select: { id: true, url: true, isActive: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    return { data: endpoints };
  });

  app.delete("/v1/webhook-endpoints/:id", { preHandler: [apiKeyAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const endpoint = await prisma.webhookEndpoint.findFirst({
      where: { id, applicationId: req.auth!.applicationId },
    });
    if (!endpoint) throw new ApiError(404, "WEBHOOK_ENDPOINT_NOT_FOUND", "Webhook endpoint not found");

    await prisma.webhookEndpoint.delete({ where: { id } });
    reply.status(204).send();
  });
}
