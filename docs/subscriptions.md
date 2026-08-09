# Devify Pay — Subscriptions & Recurring Plans

Subscriptions allow merchants to configure recurring pricing plans and manage customer subscription lifecycles.

---

## Subscription Plans (`POST /v1/plans`)

Create subscription plan intervals (`DAY`, `WEEK`, `MONTH`, `YEAR`):

```json
{
  "name": "AirMate Pro",
  "amount": 19900,
  "currency": "INR",
  "interval": "MONTH",
  "interval_count": 1
}
```

---

## Create Subscription (`POST /v1/subscriptions`)

```json
{
  "plan_id": "seed-plan-airmate-pro",
  "customer": {
    "name": "John Smith",
    "email": "john@example.com",
    "phone": "9876543210"
  }
}
```
