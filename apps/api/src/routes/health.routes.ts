import type { FastifyInstance } from "fastify";
import { prisma } from "@devify/database";
import { redisConnection } from "../config/redis.js";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({ status: "ok" }));

  app.get("/ready", async (_req, reply) => {
    let dbOk = true;
    let redisOk = true;

    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      dbOk = false;
    }

    try {
      const pong = await redisConnection.ping();
      redisOk = pong === "PONG";
    } catch {
      redisOk = false;
    }

    const status = dbOk && redisOk ? "ok" : "degraded";
    reply.status(dbOk && redisOk ? 200 : 503).send({
      status,
      database: dbOk ? "ok" : "error",
      redis: redisOk ? "ok" : "error",
    });
  });
}
