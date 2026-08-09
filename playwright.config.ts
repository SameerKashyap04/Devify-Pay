import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30000,
  use: {
    baseURL: process.env.API_URL || "http://localhost:4000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm --filter @devify/api dev",
    url: "http://localhost:4000/health",
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://devify:devify@localhost:5432/devify_pay?schema=public",
      REDIS_URL: "redis://localhost:6379",
      API_PORT: "4000",
      ADMIN_URL: "http://localhost:3000",
      API_URL: "http://localhost:4000",
      CHECKOUT_URL: "http://localhost:4000/pay",
      JWT_SECRET: "change_me_dev_only",
      SESSION_SECRET: "change_me_dev_only",
      ENCRYPTION_KEY: "change_me_32_byte_hex_key_dev_only",
      WEBHOOK_SIGNING_SECRET: "change_me_dev_only",
    },
  },
});
