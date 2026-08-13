import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import cookie from "@fastify/cookie";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";

import { env } from "./config/env.js";
import { rateLimits } from "./config/rate-limits.js";
import { requestIdPlugin } from "./middleware/request-id.js";
import { registerErrorHandler } from "./middleware/error-handler.js";

import { healthRoutes } from "./routes/health.routes.js";
import { orderRoutes } from "./routes/orders.routes.js";
import { paymentRoutes } from "./routes/payments.routes.js";
import { checkoutPageRoutes } from "./routes/checkout-page.routes.js";
import { webhookEndpointRoutes } from "./routes/webhook-endpoints.routes.js";
import { refundRoutes } from "./routes/refunds.routes.js";
import { subscriptionRoutes } from "./routes/subscriptions.routes.js";
import { adminAuthRoutes } from "./routes/admin-auth.routes.js";
import { adminPaymentRoutes } from "./routes/admin-payments.routes.js";
import { adminApplicationRoutes } from "./routes/admin-applications.routes.js";
import { adminDashboardRoutes } from "./routes/admin-dashboard.routes.js";
import { adminCustomerRoutes } from "./routes/admin-customers.routes.js";
import { adminReportRoutes } from "./routes/admin-reports.routes.js";
import { adminSettingsRoutes } from "./routes/admin-settings.routes.js";
import { upiNotifyRoutes } from "./routes/upi-notify.routes.js";

import { startWebhookWorker } from "./workers/webhook-worker.js";

async function buildServer() {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "req.headers['x-devify-signature']",
          "*.hashedSecret",
          "*.secret",
          "*.passwordHash",
          "*.webhookSecret",
        ],
        censor: "[REDACTED]",
      },
    },
    trustProxy: true,
  });

  await app.register(requestIdPlugin);
  registerErrorHandler(app);

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (
        origin === env.ADMIN_URL ||
        origin.endsWith(".vercel.app") ||
        origin.includes("localhost")
      ) {
        return cb(null, true);
      }
      cb(null, true);
    },
    credentials: true,
  });
  await app.register(cookie, { secret: env.SESSION_SECRET });

  // 1. Register OpenAPI Specification Collector
  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: "Devify Pay API",
        description: "Devify Pay merchant and admin REST API documentation",
        version: "1.0.0",
      },
      servers: [{ url: env.API_URL, description: "Current environment API server" }],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "API Key (sk_test_... / sk_live_...)",
          },
          cookieAuth: {
            type: "apiKey",
            in: "cookie",
            name: "devify_admin_session",
          },
        },
      },
    },
  });

  // Global default (api-tier) rate limit; auth/public/admin/webhook routes override below.
  await app.register(rateLimit, {
    global: true,
    max: rateLimits.api.max,
    timeWindow: rateLimits.api.timeWindow,
    keyGenerator: (req) => req.headers.authorization ?? req.ip ?? "127.0.0.1",
  });

  // Never log secrets: redact sensitive headers/fields from access logs.
  app.addHook("onRequest", async (req) => {
    req.log = req.log.child({ requestId: (req as any).requestId });
  });

  // 2. Register all routes
  await app.register(healthRoutes);
  await app.register(orderRoutes);
  await app.register(paymentRoutes);
  await app.register(checkoutPageRoutes);
  await app.register(upiNotifyRoutes);
  await app.register(webhookEndpointRoutes);
  await app.register(refundRoutes);
  await app.register(subscriptionRoutes);

  // Admin routes share a tighter, session-scoped rate limit tier.
  await app.register(
    async (adminScope) => {
      adminScope.addHook("onRoute", (routeOptions) => {
        if (!routeOptions.config) routeOptions.config = {};
        if (!(routeOptions.config as any).rateLimit) {
          (routeOptions.config as any).rateLimit = {
            max: rateLimits.admin.max,
            timeWindow: rateLimits.admin.timeWindow,
          };
        }
      });
      await adminScope.register(adminAuthRoutes);
      await adminScope.register(adminPaymentRoutes);
      await adminScope.register(adminApplicationRoutes);
      await adminScope.register(adminDashboardRoutes);
      await adminScope.register(adminCustomerRoutes);
      await adminScope.register(adminReportRoutes);
      await adminScope.register(adminSettingsRoutes);
    },
    { prefix: "" }
  );

  // 3. Register Swagger UI after all routes are registered
  await app.register(fastifySwaggerUi, {
    routePrefix: "/documentation",
    uiConfig: {
      docExpansion: "list",
      deepLinking: false,
    },
    staticCSP: false,
    transformStaticCSP: (header) => header,
  });

  app.get("/", async (_req, reply) => {
    return reply.status(200).send({
      name: "Devify Pay API",
      status: "online",
      documentation: "/documentation",
    });
  });

  app.get("/doc", async (_req, reply) => {
    reply.redirect("/documentation/");
  });

  app.get("/docs", async (_req, reply) => {
    reply.redirect("/documentation/");
  });

  return app;
}

async function main() {
  const app = await buildServer();

  try {
    startWebhookWorker();
  } catch (err) {
    app.log.warn({ err }, "Webhook worker failed to initialize, API server proceeding");
  }

  try {
    await app.ready();
    const port = Number(process.env.PORT || env.API_PORT || 8080);
    await app.listen({ port, host: "0.0.0.0" });
    app.log.info(
      `Starting Devify Pay...\nEnvironment: ${env.NODE_ENV}\nServer listening on 0.0.0.0:${port}\nHealth endpoint: /health`
    );
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
