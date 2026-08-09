# Architecture

## Flow

```
Application (AirMate/Stocky/...)
   -> Devify Pay API (/v1/orders, /v1/payments)
      -> Payment Engine (packages/payment-core: state machine + provider registry)
         -> Manual UPI Provider (V1) | PhonePe/Paytm/Razorpay (future, not configured)
            -> Customer pays via UPI app, submits transaction reference
               -> Admin verifies against the actual bank/merchant statement
                  -> payment.status = SUCCESS (only path)
                     -> Webhook (HMAC-signed) -> Application
```

## Monorepo layout

- `apps/api` — Fastify API: auth, orders, payments, checkout page, admin routes, webhook worker
- `apps/admin` — Next.js admin app (login + pending-verification queue implemented; rest pending)
- `packages/database` — Prisma schema + client + seed script
- `packages/types` — shared `PaymentProvider` interface and DTOs
- `packages/validation` — Zod request schemas
- `packages/crypto` — Argon2id hashing, HMAC signing, ID generation
- `packages/payment-core` — payment/order state machines, provider registry
- `packages/webhook` — signed webhook builder, retry schedule
- `packages/sdk` — not yet built

## Why manual UPI verification (V1)

A UPI QR code has no API that confirms payment to a third party without a
licensed PSP/aggregator agreement. Devify Pay V1 therefore treats the
customer-submitted transaction reference as *only* a verification hint —
never proof. An admin cross-checks it against the actual bank/merchant
statement before the payment can become `SUCCESS`. This is enforced in code,
not just policy: `packages/payment-core/src/state-machine.ts` only allows
`PENDING_VERIFICATION -> SUCCESS`, and that transition is only ever invoked
from `adminVerifyPayment()`, which requires an authenticated admin session.

## Remaining work (suggested order)

1. Admin app: applications/customers/refunds/subscriptions/reports/audit-log pages, dashboard charts, dark mode
2. `packages/sdk` — thin TS client (`orders.create`, `payments.create`, etc.)
3. OpenAPI spec + `/docs` Swagger UI route
4. Vitest suite for state machine, auth, idempotency, webhook signing; Playwright for checkout + admin approve/reject
5. `docs/api.md`, `docs/upi.md`, `docs/webhooks.md`, `docs/deployment.md`, `docs/testing.md`
6. Password reset + optional 2FA for admins
7. Backup/restore scripts and retention-policy automation
