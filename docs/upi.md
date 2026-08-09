# UPI (Manual Provider, V1)

## What this is

`apps/api/src/providers/manual-upi/manual-upi.provider.ts` builds a standard
`upi://pay?...` deep link for your configured merchant VPA (`UPI_MERCHANT_ID`)
and renders it as a QR code (`qrcode` npm package). That's it — there is no
provider API call, because a plain merchant UPI ID has none for third parties
without a licensed PSP/aggregator relationship.

## What this is not

- Not automatic payment confirmation
- Not a bank statement reader
- Not SMS/notification scraping
- Not a UPI PSP integration

## The verification flow

1. Customer scans the QR, pays via their own UPI app
2. Customer types the UPI transaction/reference ID into the checkout page
3. Payment moves to `PENDING_VERIFICATION` — **this is a claim, not a fact**
4. An admin opens the merchant's actual bank/UPI dashboard, finds the matching credit, and clicks Approve or Reject in `/payments`
5. Only that click can move the payment to `SUCCESS` (`assertValidTransition` enforces `PENDING_VERIFICATION -> SUCCESS` as the only path from that state)

## Configuration

```env
UPI_MERCHANT_ID=yourmerchant@upi
UPI_MERCHANT_NAME=Devify
```

## Adding a real provider later

Implement `PhonepeProvider` / `PaytmProvider` / `RazorpayProvider`
(`apps/api/src/providers/*/`) against that provider's current official API
docs, then switch `provider: "manual_upi"` to the new provider name in
`payment.service.ts`'s `createPayment`. The public `/v1/orders` and
`/v1/payments` API does not change.
