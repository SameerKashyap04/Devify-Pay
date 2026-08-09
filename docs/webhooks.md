# Devify Pay — Webhooks & Signature Verification

Devify Pay delivers real-time HTTP POST notifications to registered merchant webhook URLs when state-changing events occur.

---

## Event Types

- `order.created`: Order issued.
- `order.paid`: Order marked as paid following payment verification.
- `payment.created`: Payment attempt initialized.
- `payment.pending`: Customer submitted reference ID, pending verification.
- `payment.success`: Payment verified & approved by admin.
- `payment.failed`: Payment rejected or expired.

---

## HMAC-SHA256 Signature Verification

Outbound webhook requests include HTTP headers:
- `X-Devify-Signature`: HMAC-SHA256 hex digest of `${timestamp}.${raw_body}` signed with application `webhookSecret`.
- `X-Devify-Timestamp`: Unix timestamp (seconds).

### Verification Example (Node.js)

```typescript
import { createHmac, timingSafeEqual } from "node:crypto";

function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string,
  timestampHeader: string,
  webhookSecret: string
): boolean {
  const signedPayload = `${timestampHeader}.${rawBody}`;
  const expectedSignature = createHmac("sha256", webhookSecret)
    .update(signedPayload)
    .digest("hex");

  return timingSafeEqual(
    Buffer.from(signatureHeader, "utf8"),
    Buffer.from(expectedSignature, "utf8")
  );
}
```
