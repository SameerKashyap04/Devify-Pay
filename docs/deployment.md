# Devify Pay — Production Deployment Guide

Devify Pay is designed for production containerized deployment using Docker Compose or Kubernetes.

---

## Architecture Components
- **`apps/api`**: Fastify REST API & Webhook worker background process.
- **`apps/admin`**: Next.js 14 Admin dashboard web application.
- **PostgreSQL 14+**: Persistent relational database.
- **Redis 6+**: BullMQ message queue & rate-limiting store.

---

## Production Docker Compose

Run the entire cluster in production mode:

```bash
docker compose up -d --build
```

### Key Production Environment Variables
Ensure all production secrets are generated securely (never use development default keys):

```ini
NODE_ENV=production
DATABASE_URL=postgresql://user:password@db_host:5432/devify_pay?schema=public
REDIS_URL=redis://redis_host:6379

API_PORT=4000
ADMIN_URL=https://admin.yourdomain.com
API_URL=https://api.yourdomain.com
CHECKOUT_URL=https://api.yourdomain.com/pay

# Generate via `openssl rand -hex 32`
JWT_SECRET=prod_jwt_secret_high_entropy
SESSION_SECRET=prod_session_secret_high_entropy
ENCRYPTION_KEY=prod_encryption_key_32_byte_hex
WEBHOOK_SIGNING_SECRET=prod_webhook_signing_secret
```

---

## Database Migrations in Production
Before starting the API container, run production database migrations:

```bash
pnpm --filter @devify/database prisma migrate deploy
```
