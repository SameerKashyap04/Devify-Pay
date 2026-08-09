# API Reference (V1)

Base URL: `API_URL` (e.g. `http://localhost:4000` in dev). All application-facing endpoints are under `/v1`.

## Auth

```
Authorization: Bearer sk_test_xxx   (or sk_live_xxx)
```

## Idempotency

`POST /v1/orders`, `POST /v1/payments`, `POST /v1/refunds`, `POST /v1/subscriptions` require:

```
Idempotency-Key: <your-unique-id>
```

Reusing a key with the same request body replays the original response. Reusing it with a different body returns `422 IDEMPOTENCY_KEY_MISMATCH`.

## Orders

```
POST /v1/orders
{ "amount": 19900, "currency": "INR", "description": "...", "customer": {...}, "metadata": {...} }

GET /v1/orders/:id
GET /v1/orders
```

## Payments

```
POST /v1/payments
{ "order_id": "ord_...", "method": "UPI" }
-> { id, status, upi_uri, qr_image, checkout_url, ... }

GET /v1/payments/:id
GET /v1/payments

POST /v1/payments/:id/confirmation   (public, no API key — called from the checkout page)
{ "transaction_id": "..." }
-> sets status PENDING_VERIFICATION only, never SUCCESS
```

## Refunds

```
POST /v1/refunds
{ "payment_id": "pay_...", "amount": 19900, "reason": "..." }   (amount optional = full refund)

GET /v1/refunds/:id
```

## Webhook endpoints

```
POST /v1/webhook-endpoints   { "url": "https://..." }  -> returns signing secret once
GET  /v1/webhook-endpoints
DELETE /v1/webhook-endpoints/:id
```

## Subscriptions / Plans

```
GET  /v1/plans
POST /v1/subscriptions   { "plan_id": "...", "customer": {...} }
GET  /v1/subscriptions/:id
POST /v1/subscriptions/:id/cancel
```

## Admin (cookie session auth, not API key)

```
POST /v1/admin/auth/login    { email, password }
POST /v1/admin/auth/logout
GET  /v1/admin/auth/me

GET  /v1/admin/payments/pending-verification
POST /v1/admin/payments/:id/verify   { "action": "APPROVE" | "REJECT", "note": "..." }

GET  /v1/admin/refunds
POST /v1/admin/refunds/:id/record   { "outcome": "SUCCESS" | "FAILED", "provider_ref": "..." }

GET  /v1/admin/applications
POST /v1/admin/applications
POST /v1/admin/applications/:id/status
POST /v1/admin/applications/:id/api-keys
GET  /v1/admin/applications/:id/api-keys
POST /v1/admin/api-keys/:keyId/revoke

GET  /v1/admin/dashboard/overview?days=30
GET  /v1/admin/audit-logs
```

## Errors

```json
{ "error": { "code": "INVALID_REQUEST", "message": "...", "request_id": "req_..." } }
```

## Health

```
GET /health   -> { status: "ok" }
GET /ready    -> { status, database, redis }
```

## Not yet documented here (not yet built)

Full OpenAPI/Swagger spec — see `docs/architecture.md` remaining-work list.
