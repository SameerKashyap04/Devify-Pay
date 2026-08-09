import path from "node:path";
import { z } from "zod";

if (typeof (process as any).loadEnvFile === "function") {
  try {
    (process as any).loadEnvFile();
  } catch {
    try {
      (process as any).loadEnvFile(path.resolve(process.cwd(), "../../.env"));
    } catch {}
  }
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  API_PORT: z.coerce.number().default(Number(process.env.PORT) || 4000),
  ADMIN_URL: z.string().default("http://localhost:3000"),
  API_URL: z.string().default("http://localhost:4000"),
  CHECKOUT_URL: z.string().default("http://localhost:4000/pay"),
  UPI_MERCHANT_ID: z.string().default("merchant@upi"),
  UPI_MERCHANT_NAME: z.string().default("Devify"),
  JWT_SECRET: z.string().min(8),
  SESSION_SECRET: z.string().min(8),
  ENCRYPTION_KEY: z.string().min(8),
  WEBHOOK_SIGNING_SECRET: z.string().min(8),
  LOG_LEVEL: z.string().default("info"),
});

export const env = envSchema.parse(process.env);
export type Env = typeof env;
