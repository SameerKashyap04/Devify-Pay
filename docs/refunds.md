# Devify Pay — Refunds API & Settlement

Refunds record full or partial returns for successful payments.

---

## Create Refund (`POST /v1/refunds`)

```http
POST /v1/refunds HTTP/1.1
Authorization: Bearer sk_test_...
Content-Type: application/json

{
  "payment_id": "pay_8f92k3a1b7c4",
  "amount": 49900,
  "reason": "Customer requested cancellation"
}
```

---

## Admin Refund Settlement (`POST /v1/admin/refunds/:id/status`)
Admin records manual bank/provider payout outcome:

```json
{
  "status": "SUCCESS",
  "provider_ref": "BANK_RFND_REF_998877"
}
```
