import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";

export async function requestIdPlugin(app: FastifyInstance) {
  app.addHook("onRequest", async (req, reply) => {
    const incoming = req.headers["x-request-id"];
    const requestId = typeof incoming === "string" && incoming.length > 0 ? incoming : `req_${randomUUID()}`;
    (req as any).requestId = requestId;
    reply.header("X-Request-ID", requestId);
  });
}
