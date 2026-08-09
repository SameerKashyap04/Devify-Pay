# Devify Pay — Developer Setup Guide

This guide covers local environment setup, dependencies, database configuration, and running Devify Pay services locally.

---

## Prerequisites
- **Node.js**: `v20.x` or `v22.x` (recommended `v22.17+`)
- **pnpm**: `v10` or `v11` (enabled via `corepack enable`)
- **PostgreSQL**: `v14+` running locally or via Docker
- **Redis**: `v6+` running locally or via Docker

---

## Quickstart

### 1. Environment Configuration
Copy `.env.example` to `.env` in the repository root:
```bash
cp .env.example .env
```

Ensure default environment variables match your local environment:
```ini
NODE_ENV=development
DATABASE_URL=postgresql://devify:devify@localhost:5432/devify_pay?schema=public
REDIS_URL=redis://localhost:6379
API_PORT=4000
ADMIN_URL=http://localhost:3000
API_URL=http://localhost:4000
CHECKOUT_URL=http://localhost:4000/pay
JWT_SECRET=dev_jwt_secret_min_32_bytes_long_key
SESSION_SECRET=dev_session_secret_min_32_bytes_long_key
ENCRYPTION_KEY=dev_encryption_key_32_bytes_long_key
WEBHOOK_SIGNING_SECRET=dev_webhook_secret_key_long
```

### 2. Database Migration & Seed
Initialize the PostgreSQL schema and populate default test seed data:
```bash
# Push schema to local PostgreSQL
pnpm --filter @devify/database exec prisma db push

# Seed test data (Admin: admin@devify.local / ChangeMe123!, App: AirMate)
pnpm db:seed
```

### 3. Start Development Servers
Run API and Admin apps:
```bash
# Start Fastify API server (Port 4000)
pnpm dev:api

# Start Next.js Admin App (Port 3000)
pnpm --filter @devify/admin dev
```

---

## Interactive API Documentation
With the API running, access the interactive Swagger UI:
- **Swagger Documentation**: [http://localhost:4000/documentation](http://localhost:4000/documentation)
