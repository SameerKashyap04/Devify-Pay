# Devify Pay

Devify Pay is a centralized payment orchestration platform for internal applications (AirMate, Stocky, and future apps). Applications never talk to payment providers directly — they only talk to Devify Pay, which talks to providers.

**Devify Pay is not a bank, UPI PSP, or regulated payment aggregator.** V1 uses merchant UPI with manual admin verification — see `docs/security.md` and `docs/upi.md`.

## What's implemented (this build pass)

- Monorepo (pnpm workspaces), TypeScript strict mode throughout
- Postgres schema (Prisma) covering every table in the spec
- API-key auth (Argon2id-hashed secrets, TEST/LIVE separation, revocation)
- Orders, Payments, Manual UPI provider (QR + UPI URI generation)
- Hosted checkout page (`/pay/:paymentId`) — no sensitive data collected
- Payment state machine with strict transition rules (e.g. `FAILED → SUCCESS` is impossible)
- Admin session auth + **pending-verification queue with Approve/Reject** (the only path to `SUCCESS`)
- Refunds (manual outcome recording), Subscriptions (manual renewal, plans)
- Webhooks: HMAC-signed delivery, BullMQ-backed retry schedule, durable event log
- Idempotency-Key middleware for all mutating endpoints
- Audit logging on every sensitive admin action
- Rate limiting config, Helmet, CORS, secret redaction in logs
- Full Next.js admin app: login, dashboard overview (revenue/payment stat cards + time-window filter), applications (create/list/detail with TEST/LIVE API key issuance & revocation), customers (search), payments (pending-verification queue with approve/reject), refunds (record manual outcome), subscriptions (list), reports (CSV export for revenue/payments/refunds/subscriptions/applications), audit logs — all builds successfully (12 routes)
- Health/readiness endpoints, Docker Compose, Dockerfiles
- `packages/sdk`: lightweight TypeScript client (orders/payments/refunds/webhook-endpoints), type-checks clean
- Automated tests: 21 passing Vitest tests covering the payment/order state machine (including rejecting invalid transitions like FAILED→SUCCESS), HMAC signing + replay protection, API key hashing, and webhook retry scheduling

## What's not yet built

- OpenAPI/Swagger docs generation (`docs/api.md` is hand-written, not generated)
- Dashboard revenue/payment charts (stat cards exist; Recharts line/bar charts do not yet)
- Playwright end-to-end tests (Vitest unit tests exist; no browser-driven checkout/admin flow tests yet)
- `docs/deployment.md`, `docs/testing.md`, `docs/database.md`, `docs/setup.md`, `docs/webhooks.md`, `docs/subscriptions.md`, `docs/refunds.md`, `docs/authentication.md`, `docs/orders.md`, `docs/payments.md`, `docs/integration-example.md`
- 2FA, password reset flow (architecture only, not implemented)
- Backup/restore scripts (documented approach only)

See `docs/architecture.md` for the full picture and next steps.

## Running locally

```bash
cp .env.example .env    # edit secrets before any real use
docker compose up -d postgres redis
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev:api             # http://localhost:4000
pnpm --filter @devify/admin dev   # http://localhost:3000
```

Seed output prints a one-time TEST secret key and the dev admin login (`admin@devify.local` / `ChangeMe123!` — change immediately).

> Note: `prisma generate` requires downloading Prisma's query engine binary from `binaries.prisma.sh`. If you're behind a restrictive proxy/allowlist, make sure that host is reachable, or use `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1` only as a last resort in trusted networks.

## Example flow

```
POST /v1/orders          (application, API key)
POST /v1/payments        (application, API key)  -> checkout_url
  -> customer opens /pay/:id, scans UPI QR, pays, submits transaction ref
  -> payment.status = PENDING_VERIFICATION
Admin reviews in /payments (admin app) -> Approve
  -> payment.status = SUCCESS, order.status = PAID
  -> webhook: payment.success, order.paid -> application webhook endpoint
```
