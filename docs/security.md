# Security

## Compliance boundary

Devify Pay is an application/payment orchestration layer. It does not claim
to be a bank, UPI PSP, payment aggregator, or regulated payment system
operator. It never scrapes bank statements, UPI apps, SMS, or notifications,
and never bypasses provider authentication.

## Secrets

- API keys: `sk_test_*` / `sk_live_*`, only the Argon2id hash is stored, raw value shown once at creation (`apps/api/src/routes/admin-applications.routes.ts`)
- Admin passwords: Argon2id (`packages/crypto`)
- Admin sessions: opaque random token, only its SHA-256 hash stored, 12h expiry, httpOnly+secure+sameSite cookie
- Webhook secrets: HMAC-SHA256 signing (`X-Devify-Signature`, `X-Devify-Timestamp`), 5-minute replay window
- Logs: Pino `redact` config strips `Authorization`, `Cookie`, and any field named `secret`/`hashedSecret`/`passwordHash`/`webhookSecret`

## What is never stored

UPI PIN, OTP, card CVV, banking passwords — the checkout page never collects these, and no code path requests them.

## Known gaps in this build pass

- Rate limiting is registered globally but not yet split per route category (public/api/auth/admin/webhook) with distinct limiters — `apps/api/src/config/rate-limits.ts` defines the values, wiring them per-route is still TODO.
- CSRF protection for the admin cookie session is not yet implemented (SameSite=Lax mitigates but is not a substitute).
- Brute-force lockout for admin login is in-memory only; move to Redis before running more than one API instance.
- No automated security tests yet.
