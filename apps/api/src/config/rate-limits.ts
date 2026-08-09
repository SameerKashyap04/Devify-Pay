function num(name: string, fallback: number) {
  const v = process.env[name];
  return v ? Number(v) : fallback;
}

export const rateLimits = {
  public: { max: num("RATE_LIMIT_PUBLIC_MAX", 60), timeWindow: num("RATE_LIMIT_PUBLIC_WINDOW_MS", 60000) },
  api: { max: num("RATE_LIMIT_API_MAX", 300), timeWindow: num("RATE_LIMIT_API_WINDOW_MS", 60000) },
  auth: { max: num("RATE_LIMIT_AUTH_MAX", 10), timeWindow: num("RATE_LIMIT_AUTH_WINDOW_MS", 60000) },
  admin: { max: num("RATE_LIMIT_ADMIN_MAX", 200), timeWindow: num("RATE_LIMIT_ADMIN_WINDOW_MS", 60000) },
  webhook: { max: num("RATE_LIMIT_WEBHOOK_MAX", 120), timeWindow: num("RATE_LIMIT_WEBHOOK_WINDOW_MS", 60000) },
};
