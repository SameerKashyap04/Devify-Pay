import type { FastifyInstance } from "fastify";
import { prisma } from "@devify/database";
import { adminSessionAuth } from "../middleware/admin-session-auth.js";
import { z } from "zod";

const updateSettingsBody = z.object({
  upiVpa: z.string().max(100).optional().nullable(),
  merchantName: z.string().max(100).optional().nullable(),
  accountType: z.enum(["PERSONAL", "MERCHANT"]).optional().nullable(),
  mcc: z.string().max(10).optional().nullable(),
  upiNotifySecret: z.string().min(8).max(200).optional().nullable(),
});

export async function adminSettingsRoutes(app: FastifyInstance) {
  // GET current settings
  app.get(
    "/v1/admin/settings",
    { preHandler: [adminSessionAuth] },
    async (_req, _reply) => {
      try {
        const config = await prisma.systemConfig.findUnique({
          where: { id: "singleton" },
        });

        return {
          upiVpa: config?.upiVpa ?? null,
          merchantName: config?.merchantName ?? null,
          accountType: (config as any)?.accountType ?? "PERSONAL",
          mcc: (config as any)?.mcc ?? null,
          upiNotifySecretSet: !!(config?.upiNotifySecret),
          updatedAt: config?.updatedAt ?? null,
        };
      } catch (err: any) {
        // Self-heal: ensure columns exist if migration was delayed
        try {
          await prisma.$executeRawUnsafe(`
            ALTER TABLE "system_config" ADD COLUMN IF NOT EXISTS "account_type" TEXT NOT NULL DEFAULT 'PERSONAL';
            ALTER TABLE "system_config" ADD COLUMN IF NOT EXISTS "mcc" TEXT;
          `);
          const config = await prisma.systemConfig.findUnique({ where: { id: "singleton" } });
          return {
            upiVpa: config?.upiVpa ?? null,
            merchantName: config?.merchantName ?? null,
            accountType: (config as any)?.accountType ?? "PERSONAL",
            mcc: (config as any)?.mcc ?? null,
            upiNotifySecretSet: !!(config?.upiNotifySecret),
            updatedAt: config?.updatedAt ?? null,
          };
        } catch (e) {
          app.log.error({ err, e }, "Failed to load system config");
          throw err;
        }
      }
    }
  );

  // PATCH / upsert settings
  app.patch(
    "/v1/admin/settings",
    { preHandler: [adminSessionAuth] },
    async (req, reply) => {
      const body = updateSettingsBody.safeParse(req.body);
      if (!body.success) {
        return reply.status(400).send({ error: { message: "Invalid input", details: body.error.flatten() } });
      }

      const { upiVpa, merchantName, accountType, mcc, upiNotifySecret } = body.data;

      try {
        const config = await prisma.systemConfig.upsert({
          where: { id: "singleton" },
          create: {
            id: "singleton",
            upiVpa: upiVpa ?? null,
            merchantName: merchantName ?? null,
            accountType: accountType ?? "PERSONAL",
            mcc: mcc ?? null,
            upiNotifySecret: upiNotifySecret ?? null,
          },
          update: {
            ...(upiVpa !== undefined && { upiVpa }),
            ...(merchantName !== undefined && { merchantName }),
            ...(accountType !== undefined && { accountType: accountType ?? "PERSONAL" }),
            ...(mcc !== undefined && { mcc }),
            ...(upiNotifySecret !== undefined && { upiNotifySecret }),
          },
        });

        return {
          success: true,
          upiVpa: config.upiVpa,
          merchantName: config.merchantName,
          accountType: (config as any).accountType ?? "PERSONAL",
          mcc: (config as any).mcc ?? null,
          updatedAt: config.updatedAt,
        };
      } catch (err: any) {
        // Self-heal: ensure columns exist
        try {
          await prisma.$executeRawUnsafe(`
            ALTER TABLE "system_config" ADD COLUMN IF NOT EXISTS "account_type" TEXT NOT NULL DEFAULT 'PERSONAL';
            ALTER TABLE "system_config" ADD COLUMN IF NOT EXISTS "mcc" TEXT;
          `);
          const config = await prisma.systemConfig.upsert({
            where: { id: "singleton" },
            create: {
              id: "singleton",
              upiVpa: upiVpa ?? null,
              merchantName: merchantName ?? null,
              accountType: accountType ?? "PERSONAL",
              mcc: mcc ?? null,
              upiNotifySecret: upiNotifySecret ?? null,
            },
            update: {
              ...(upiVpa !== undefined && { upiVpa }),
              ...(merchantName !== undefined && { merchantName }),
              ...(accountType !== undefined && { accountType: accountType ?? "PERSONAL" }),
              ...(mcc !== undefined && { mcc }),
              ...(upiNotifySecret !== undefined && { upiNotifySecret }),
            },
          });

          return {
            success: true,
            upiVpa: config.upiVpa,
            merchantName: config.merchantName,
            accountType: (config as any).accountType ?? "PERSONAL",
            mcc: (config as any).mcc ?? null,
            updatedAt: config.updatedAt,
          };
        } catch (e) {
          app.log.error({ err, e }, "Failed to update system config");
          throw err;
        }
      }
    }
  );
}
