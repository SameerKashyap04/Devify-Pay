# Devify Pay — Orders API & Idempotency

An **Order** represents a merchant billing intent (amount, currency, customer information) against which one or more payments can be attempted.

---

## Order Status State Machine

```
         ┌───────────┐
         │  PENDING  │
         └─────┬─────┘
               │
    ┌──────────┼──────────┐
    ▼          ▼          ▼
┌────────┐ ┌────────┐ ┌───────────┐
│  PAID  │ │ FAILED │ │  EXPIRED  │
└────────┘ └────────┘ └───────────┘
```

---

## API Reference

### Create Order (`POST /v1/orders`)
All mutating POST requests **require** an `Idempotency-Key` header.

```http
POST /v1/orders HTTP/1.1
Authorization: Bearer sk_test_...
Idempotency-Key: idem_order_123456789
Content-Type: application/json

{
  "amount": 49900,
  "currency": "INR",
  "description": "AirMate Pro Monthly Subscription",
  "customer": {
    "name": "Jane Doe",
    "email": "jane@example.com",
    "phone": "9876543210"
  }
}
```

#### Response (`201 Created`)
```json
{
  "id": "ord_8f92k3a1b7c4",
  "amount": 49900,
  "currency": "INR",
  "status": "PENDING",
  "description": "AirMate Pro Monthly Subscription",
  "created_at": "2026-08-09T12:00:00.000Z"
}
```
