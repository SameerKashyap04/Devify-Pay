# Devify Pay — TypeScript Integration Example

This document provides a complete working integration example using the `@devify/sdk` client package.

---

## Installation

```bash
pnpm add @devify/sdk
```

---

## Integration Walkthrough

```typescript
import { DevifyPay } from "@devify/sdk";

// Initialize SDK client with merchant secret API key
const client = new DevifyPay({
  apiKey: process.env.DEVIFY_SECRET_KEY!, // sk_test_...
  baseUrl: "http://localhost:4000",
});

async function runPaymentFlow() {
  console.log("--> 1. Creating Order...");
  const order = await client.createOrder({
    amount: 99900, // ₹999.00
    currency: "INR",
    description: "AirMate Premium Annual Subscription",
    customer: {
      name: "Alice Smith",
      email: "alice@example.com",
      phone: "9876543210",
    },
  });

  console.log(`Order created: ${order.id}`);

  console.log("--> 2. Initializing Payment...");
  const payment = await client.createPayment({
    order_id: order.id,
    method: "UPI",
  });

  console.log(`Payment created: ${payment.id}`);
  console.log(`Hosted Checkout URL: ${payment.checkout_url}`);
  console.log(`UPI Deep Link: ${payment.upi_uri}`);

  console.log("--> 3. Checking Payment Status...");
  const status = await client.getPayment(payment.id);
  console.log(`Payment Status: ${status.status}`);
}

runPaymentFlow().catch(console.error);
```
