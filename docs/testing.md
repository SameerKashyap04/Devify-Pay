# Devify Pay — Testing Strategy & Execution

Devify Pay employs a two-layer testing strategy:
1. **Unit & Package Testing**: Powered by Vitest across core packages.
2. **End-to-End (E2E) Browser & API Testing**: Powered by Playwright.

---

## 1. Unit Tests (Vitest)
Unit tests validate isolated domain components including state machine transitions, signature generation, encryption, and webhook payload construction.

### Running Unit Tests
```bash
pnpm test
```

### Test Coverage
- **`packages/crypto`**: Key generation, Argon2id hashing, HMAC-SHA256 signatures, replay protection window.
- **`packages/payment-core`**: Valid and invalid payment/order state machine transitions.
- **`packages/webhook`**: Signature verification, timestamp validation, payload serialization.

---

## 2. End-to-End Tests (Playwright)
Playwright E2E tests execute against real server instances, testing the complete payment lifecycle:
`Order Creation → Hosted Checkout Page → Customer Reference Submission → Admin Verification → Webhook Dispatch`

### Running Playwright E2E Suite
```bash
pnpm test:e2e
```

### Test Scenario ([checkout-flow.spec.ts](file:///Users/sameerkashyap/Desktop/devify-pay/tests/e2e/checkout-flow.spec.ts))
1. Admin logs in and issues a test API key for AirMate (`sk_test_...`).
2. Merchant API creates an order with inline customer details and an idempotency key.
3. Payment is initialized, returning hosted checkout URL (`/pay/:publicId`).
4. Playwright opens checkout page in Chromium, submits transaction reference ID.
5. Page updates to `PENDING_VERIFICATION`.
6. Admin approves payment via `/v1/admin/payments/:id/verify`.
7. Final payment status becomes `SUCCESS` and order status becomes `PAID`.
