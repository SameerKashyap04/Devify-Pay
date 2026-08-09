# Devify Pay — Payments API & Manual UPI Engine

Devify Pay supports manual UPI payments with customer reference submission and admin verification.

---

## Payment Lifecycle

1. **Initialization (`POST /v1/payments`)**:
   Merchant creates payment for an order (`method: "UPI"`). System generates a public payment ID (`pay_...`), UPI deep-link URI (`upi://pay?...`), QR data URL, and hosted checkout URL (`/pay/pay_...`).

2. **Customer Checkout (`/pay/:id`)**:
   Customer scans UPI QR or clicks deep-link to pay. After paying via UPI app, customer clicks **I HAVE PAID** and submits the bank UPI transaction reference ID (`transaction_ref`). Payment status transitions from `PENDING` to `PENDING_VERIFICATION`.

3. **Admin Verification (`POST /v1/admin/payments/:id/verify`)**:
   Admin verifies bank transaction statement against reference ID and clicks **Approve**.
   - Payment status → `SUCCESS`
   - Order status → `PAID`
   - Dispatches `payment.success` and `order.paid` webhooks.

---

## Payment API Endpoints

- `POST /v1/payments`: Create payment attempt for an order.
- `GET /v1/payments/:id`: Fetch payment details.
- `POST /v1/payments/:id/confirmation`: Public endpoint for submitting transaction reference ID.
- `POST /v1/admin/payments/:id/verify`: Admin verification (Approve / Reject).
