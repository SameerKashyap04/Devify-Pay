# Devify Pay — Database Architecture & Schema

Devify Pay uses PostgreSQL managed through Prisma ORM (`@devify/database`).

---

## Core Models Overview

| Model | Purpose | Key Fields |
| :--- | :--- | :--- |
| **`Application`** | Multi-tenant merchant application | `id`, `slug`, `status`, `webhookUrl`, `webhookSecret` |
| **`ApiKey`** | Application authentication credentials | `id`, `environment` (`TEST`/`LIVE`), `keyPrefix`, `hashedSecret` |
| **`Admin`** | Admin panel user account | `id`, `email`, `passwordHash`, `twoFaSecret` |
| **`Customer`** | End-user customer associated with an app | `id`, `applicationId`, `email`, `phone`, `name` |
| **`Order`** | Financial payment intent / bill | `publicId` (`ord_...`), `amount`, `status`, `mode` |
| **`Payment`** | Payment transaction attempt | `publicId` (`pay_...`), `method` (`UPI`), `status`, `transactionRef` |
| **`Plan`** | Subscription billing interval & price | `id`, `amount`, `interval` (`DAY`/`WEEK`/`MONTH`/`YEAR`) |
| **`Subscription`**| Recurring billing lifecycle | `id`, `customerId`, `planId`, `status` |
| **`Refund`** | Payment refund record | `publicId` (`rfnd_...`), `paymentId`, `amount`, `status` |
| **`WebhookEvent`**| Outbound webhook delivery queue log | `id`, `eventType`, `payload`, `status`, `attemptCount` |
| **`AuditLog`** | Admin & System audit trail | `actorType`, `actorId`, `action`, `resourceType`, `resourceId` |

---

## Schema Commands

```bash
# Generate Prisma Client
pnpm db:generate

# Execute Dev Migration
pnpm db:migrate

# Apply Production Deploy Migration
pnpm db:deploy

# Execute Seed File
pnpm db:seed
```
