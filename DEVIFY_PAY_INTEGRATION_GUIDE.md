# Devify Pay — Developer Integration Guide

> **Based on real code inspection of the Devify Pay monorepo.**
> Every API endpoint, request shape, header, and response documented here exists in the actual codebase.
> Features that are planned but not yet implemented are clearly marked **⚠️ REQUIRES IMPLEMENTATION/VERIFICATION**.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Architecture](#2-architecture)
3. [Create a Payment (Core Flow)](#3-create-a-payment-core-flow)
4. [Web Integration — Next.js](#4-web-integration--nextjs)
5. [Web Integration — React + Node.js Backend](#5-web-integration--react--nodejs-backend)
6. [Mobile Integration — React Native / Expo](#6-mobile-integration--react-native--expo)
7. [Webhooks](#7-webhooks)
8. [Database Schema](#8-database-schema)
9. [Security](#9-security)
10. [Testing](#10-testing)
11. [Deployment](#11-deployment)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Prerequisites

### What you need before starting

| Requirement | Description |
|---|---|
| **Devify Pay API URL** | The URL where your Devify Pay API is running (e.g., `https://devifypay.site`) |
| **Admin Dashboard URL** | The admin panel URL (e.g., `https://devify-pay-admin.vercel.app`) |
| **API Key** | `sk_live_xxx` (production) or `sk_test_xxx` (testing) — generated from the Admin Dashboard |
| **Webhook Secret** | `whsec_xxx` — generated when you register a webhook endpoint via the API |
| **Node.js** | v18 or higher |

### Getting your API Key

1. Log in to your Admin Dashboard (`/login`)
2. Navigate to **Applications** → your application
3. Click **Generate API Key** → choose `TEST` or `LIVE`
4. **Copy the secret immediately** — it is shown only once

### Required environment variables

```bash
# .env (NEVER commit this file)
DEVIFY_API_URL=https://devifypay.site
DEVIFY_API_KEY=YOUR_DEVIFY_API_KEY
DEVIFY_WEBHOOK_SECRET=YOUR_DEVIFY_WEBHOOK_SECRET
```

---

## 2. Architecture

### How a payment flows

```
Your Customer
     │
     │ clicks "Pay"
     ▼
Your Frontend App
     │
     │ POST /api/create-order  (HTTPS, same-origin)
     ▼
Your Backend Server            ◄────────────────────────────────┐
     │                                                          │
     │ POST /v1/orders         (with Bearer sk_live_xxx)       │
     │ POST /v1/payments                                        │
     ▼                                                          │
Devify Pay API                                                  │
     │                                                          │
     │ returns checkout_url                                     │
     │                                                          │
     ▼                                                          │
Your Backend → returns checkout_url to frontend                 │
     │                                                          │
     ▼                                                          │
Your Frontend redirects/opens checkout_url                      │
     │                                                          │
     ▼                                                          │
Devify Pay Hosted Checkout Page (/pay/:id)                      │
     │                                                          │
     │ Customer scans QR and pays via UPI                       │
     │                                                          │
     ▼                                                          │
Devify Pay API                                                  │
     │                                                          │
     │ POST your webhook_url (signed request)  ────────────────►│
     │                                                          │
     │ Webhook contains: payment.success, order.paid           │
     │                                                          │
     ▼                                                          │
Your Backend verifies signature → updates your database
```

### Key design rules

- **Your API key lives only on your backend server** — never in frontend code.
- **Never trust the frontend** to tell you the payment amount or status.
- **Always verify the webhook signature** before updating your database.
- **Amounts are in paise (smallest unit)** — ₹100 = `10000`.

---

## 3. Create a Payment (Core Flow)

Creating a payment in Devify Pay is a **two-step process**:

1. Create an **Order** (describes what is being paid for)
2. Create a **Payment** linked to that Order (generates the checkout URL)

---

### Step 1: Create an Order

**Endpoint:** `POST /v1/orders`
**Auth:** `Authorization: Bearer sk_live_xxx`
**Required header:** `Idempotency-Key: <unique-string>`

**Request body:**

```json
{
  "amount": 49900,
  "currency": "INR",
  "description": "Pro Plan Subscription",
  "customer": {
    "name": "Rahul Sharma",
    "email": "rahul@example.com",
    "phone": "9876543210"
  },
  "metadata": {
    "user_id": "usr_abc123",
    "plan": "pro"
  }
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `amount` | integer | ✅ | In paise. ₹499 = `49900` |
| `currency` | string | ✅ | Always `"INR"` |
| `description` | string | ❌ | Max 500 chars |
| `customer.name` | string | ❌ | Max 200 chars |
| `customer.email` | string | ❌ | Valid email |
| `customer.phone` | string | ❌ | Max 20 chars |
| `metadata` | object | ❌ | Any JSON key-value data you want to store |

**Response (HTTP 201):**

```json
{
  "id": "ord_AbC123XyZ789",
  "amount": 49900,
  "currency": "INR",
  "status": "PENDING",
  "description": "Pro Plan Subscription",
  "created_at": "2024-01-15T10:30:00.000Z"
}
```

**Example curl:**

```bash
curl -X POST https://devifypay.site/v1/orders \
  -H "Authorization: Bearer sk_live_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: idem_$(date +%s%N)" \
  -d '{
    "amount": 49900,
    "currency": "INR",
    "description": "Pro Plan",
    "customer": { "email": "rahul@example.com" }
  }'
```

---

### Step 2: Create a Payment (get the checkout URL)

**Endpoint:** `POST /v1/payments`
**Auth:** `Authorization: Bearer sk_live_xxx`
**Required header:** `Idempotency-Key: <unique-string>`

**Request body:**

```json
{
  "order_id": "ord_AbC123XyZ789",
  "method": "UPI"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `order_id` | string | ✅ | The `id` from Step 1 |
| `method` | string | ✅ | `"UPI"` (UPI is the primary supported method) |

**Response (HTTP 201):**

```json
{
  "id": "pay_XyZ789AbC123",
  "amount": 49900,
  "currency": "INR",
  "status": "PENDING",
  "checkout_url": "https://devifypay.site/pay/pay_XyZ789AbC123",
  "created_at": "2024-01-15T10:30:01.000Z"
}
```

The `checkout_url` is the hosted payment page. Redirect your customer to this URL.

**Example curl:**

```bash
curl -X POST https://devifypay.site/v1/payments \
  -H "Authorization: Bearer sk_live_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: idem_pay_$(date +%s%N)" \
  -d '{
    "order_id": "ord_AbC123XyZ789",
    "method": "UPI"
  }'
```

---

### Checking Payment Status

**Endpoint:** `GET /v1/payments/:id`
**Auth:** `Authorization: Bearer sk_live_xxx`

```bash
curl https://devifypay.site/v1/payments/pay_XyZ789AbC123 \
  -H "Authorization: Bearer sk_live_YOUR_KEY"
```

**Response:**

```json
{
  "id": "pay_XyZ789AbC123",
  "amount": 49900,
  "currency": "INR",
  "status": "SUCCESS"
}
```

**Payment Status values:**

| Status | Description |
|---|---|
| `PENDING` | QR code displayed, waiting for customer to pay |
| `PENDING_VERIFICATION` | Customer submitted a UPI ref; awaiting admin approval |
| `SUCCESS` | Payment verified and confirmed |
| `FAILED` | Payment failed |
| `EXPIRED` | Payment link expired (15 min default) |
| `CANCELLED` | Payment cancelled |

---

## 4. Web Integration — Next.js

### Step 1 → Install dependencies

```bash
cd your-nextjs-app
npm install
```

No additional Devify Pay SDK is needed — use the native `fetch` API.

### Step 2 → Configure environment variables

Create or update your `.env.local` file:

```bash
# .env.local
DEVIFY_API_URL=https://devifypay.site
DEVIFY_API_KEY=YOUR_DEVIFY_API_KEY
DEVIFY_WEBHOOK_SECRET=YOUR_DEVIFY_WEBHOOK_SECRET
```

> ⚠️ **Never prefix these with `NEXT_PUBLIC_`** — that would expose them to the browser.

### Step 3 → Create backend checkout API

**File:** `app/api/checkout/route.ts`

```typescript
// app/api/checkout/route.ts
import { NextRequest, NextResponse } from "next/server";

const DEVIFY_API_URL = process.env.DEVIFY_API_URL!;
const DEVIFY_API_KEY = process.env.DEVIFY_API_KEY!;

export async function POST(req: NextRequest) {
  try {
    const { amount, description, customerEmail } = await req.json();

    // Validate on your server — NEVER trust the client amount
    if (!amount || typeof amount !== "number" || amount <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    const idempotencyKey = `idem_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    // Step 1: Create Order
    const orderRes = await fetch(`${DEVIFY_API_URL}/v1/orders`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${DEVIFY_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        amount,          // amount in paise (₹499 = 49900)
        currency: "INR",
        description,
        customer: { email: customerEmail },
      }),
    });

    if (!orderRes.ok) {
      const err = await orderRes.json();
      console.error("Order creation failed:", err);
      return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
    }

    const order = await orderRes.json();

    // Step 2: Create Payment
    const paymentRes = await fetch(`${DEVIFY_API_URL}/v1/payments`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${DEVIFY_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `${idempotencyKey}_pay`,
      },
      body: JSON.stringify({
        order_id: order.id,
        method: "UPI",
      }),
    });

    if (!paymentRes.ok) {
      const err = await paymentRes.json();
      console.error("Payment creation failed:", err);
      return NextResponse.json({ error: "Failed to create payment" }, { status: 500 });
    }

    const payment = await paymentRes.json();

    // Save order/payment IDs to YOUR database here (recommended)
    // await db.orders.create({ orderId: order.id, paymentId: payment.id, userId: ... });

    return NextResponse.json({
      checkoutUrl: payment.checkout_url,
      orderId: order.id,
      paymentId: payment.id,
    });
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

### Step 4 → Create frontend checkout button

**File:** `components/CheckoutButton.tsx`

```tsx
// components/CheckoutButton.tsx
"use client";

import { useState } from "react";

interface CheckoutButtonProps {
  amount: number;       // in paise (₹499 = 49900)
  description: string;
  customerEmail: string;
}

export function CheckoutButton({ amount, description, customerEmail }: CheckoutButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCheckout = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, description, customerEmail }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Checkout failed");
      }

      const { checkoutUrl } = await res.json();

      // Redirect to Devify Pay hosted checkout page
      window.location.href = checkoutUrl;
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleCheckout}
        disabled={loading}
        style={{
          padding: "12px 24px",
          backgroundColor: loading ? "#ccc" : "#111",
          color: "#fff",
          border: "none",
          borderRadius: "8px",
          fontSize: "16px",
          fontWeight: "600",
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        {loading ? "Processing..." : `Pay ₹${(amount / 100).toFixed(2)}`}
      </button>
      {error && <p style={{ color: "red", marginTop: "8px" }}>{error}</p>}
    </div>
  );
}
```

### Step 5 → Use the checkout button in a page

**File:** `app/shop/page.tsx`

```tsx
// app/shop/page.tsx
import { CheckoutButton } from "@/components/CheckoutButton";

export default function ShopPage() {
  return (
    <div>
      <h1>Pro Plan</h1>
      <p>₹499 / month</p>
      <CheckoutButton
        amount={49900}
        description="Pro Plan — Monthly"
        customerEmail="user@example.com"
      />
    </div>
  );
}
```

### Step 6 → Configure webhook

**File:** `app/api/webhook/devify/route.ts`

See [Section 7: Webhooks](#7-webhooks) for the complete implementation.

### Step 7 → Test payment

```bash
# Start dev server
npm run dev

# Open http://localhost:3000/shop
# Click Pay button
# You will be redirected to the Devify Pay checkout page
```

---

## 5. Web Integration — React + Node.js Backend

### Step 1 → Install dependencies

```bash
# Backend (Node.js / Express)
npm install express dotenv

# Frontend (React)
# No additional packages needed
```

### Step 2 → Configure environment variables

**File:** `.env` (in your backend folder)

```bash
DEVIFY_API_URL=https://devifypay.site
DEVIFY_API_KEY=YOUR_DEVIFY_API_KEY
DEVIFY_WEBHOOK_SECRET=YOUR_DEVIFY_WEBHOOK_SECRET
PORT=3001
```

### Step 3 → Create backend checkout endpoint

**File:** `server/routes/checkout.js`

```javascript
// server/routes/checkout.js
const express = require("express");
const router = express.Router();

const DEVIFY_API_URL = process.env.DEVIFY_API_URL;
const DEVIFY_API_KEY = process.env.DEVIFY_API_KEY;

router.post("/api/checkout", async (req, res) => {
  const { amount, description, customerEmail } = req.body;

  if (!amount || typeof amount !== "number" || amount <= 0) {
    return res.status(400).json({ error: "Invalid amount" });
  }

  const idempotencyKey = `idem_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  try {
    // Step 1: Create Order
    const orderRes = await fetch(`${DEVIFY_API_URL}/v1/orders`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${DEVIFY_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        amount,
        currency: "INR",
        description,
        customer: { email: customerEmail },
      }),
    });

    if (!orderRes.ok) throw new Error("Order creation failed");
    const order = await orderRes.json();

    // Step 2: Create Payment
    const paymentRes = await fetch(`${DEVIFY_API_URL}/v1/payments`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${DEVIFY_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `${idempotencyKey}_pay`,
      },
      body: JSON.stringify({ order_id: order.id, method: "UPI" }),
    });

    if (!paymentRes.ok) throw new Error("Payment creation failed");
    const payment = await paymentRes.json();

    return res.json({ checkoutUrl: payment.checkout_url, orderId: order.id });
  } catch (err) {
    console.error("Checkout error:", err);
    return res.status(500).json({ error: "Failed to initiate payment" });
  }
});

module.exports = router;
```

**File:** `server/index.js`

```javascript
// server/index.js
require("dotenv").config();
const express = require("express");
const checkoutRouter = require("./routes/checkout");

const app = express();
app.use(express.json());
app.use(checkoutRouter);

app.listen(process.env.PORT || 3001, () => {
  console.log(`Server running on port ${process.env.PORT || 3001}`);
});
```

### Step 4 → React checkout button

**File:** `src/components/PayButton.jsx`

```jsx
// src/components/PayButton.jsx
import { useState } from "react";

export function PayButton({ amount, description, email }) {
  const [loading, setLoading] = useState(false);

  const handlePay = async () => {
    setLoading(true);
    try {
      const res = await fetch("http://localhost:3001/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, description, customerEmail: email }),
      });
      const data = await res.json();
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        alert(data.error || "Something went wrong");
        setLoading(false);
      }
    } catch {
      alert("Network error");
      setLoading(false);
    }
  };

  return (
    <button onClick={handlePay} disabled={loading}>
      {loading ? "Loading..." : `Pay ₹${(amount / 100).toFixed(2)}`}
    </button>
  );
}
```

---

## 6. Mobile Integration — React Native / Expo

The mobile integration opens the Devify Pay hosted checkout URL in an **in-app browser** (WebView or system browser). The checkout page handles UPI payment collection including QR display, manual UPI transaction ID submission, and live status polling.

### Step 1 → Install dependencies

```bash
# If using Expo managed workflow
npx expo install expo-web-browser expo-linking

# If using bare React Native
npm install react-native-inappbrowser-reborn
```

### Step 2 → Configure environment variables

**File:** `.env` (in your Expo/React Native project root)

```bash
EXPO_PUBLIC_BACKEND_URL=https://your-backend.com
```

> ⚠️ **Never put DEVIFY_API_KEY in your mobile app.** All Devify API calls must go through your backend server.

### Step 3 → Create your backend API endpoint

Your mobile app calls **your own backend** (not Devify Pay directly). The backend creates the order and payment as shown in [Section 3](#3-create-a-payment-core-flow), then returns the `checkout_url`.

### Step 4 → Mobile checkout component (Expo)

**File:** `src/components/PaymentButton.tsx`

```tsx
// src/components/PaymentButton.tsx
import { useState } from "react";
import { TouchableOpacity, Text, ActivityIndicator, Alert } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface PaymentButtonProps {
  amount: number;       // in paise
  description: string;
  customerEmail: string;
  onPaymentComplete?: (paymentId: string) => void;
  onPaymentFailed?: () => void;
}

export function PaymentButton({
  amount,
  description,
  customerEmail,
  onPaymentComplete,
  onPaymentFailed,
}: PaymentButtonProps) {
  const [loading, setLoading] = useState(false);

  const handlePay = async () => {
    setLoading(true);
    try {
      // Step 1: Ask YOUR backend to create the payment
      const res = await fetch(`${BACKEND_URL}/api/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, description, customerEmail }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Checkout failed");
      }

      const { checkoutUrl, paymentId } = await res.json();

      // Step 2: Open the Devify Pay checkout in an in-app browser
      const result = await WebBrowser.openBrowserAsync(checkoutUrl, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
      });

      // Step 3: After the browser closes, verify payment status on your backend
      if (result.type === "dismiss" || result.type === "cancel") {
        await verifyAndHandlePayment(paymentId);
      }
    } catch (err: any) {
      Alert.alert("Payment Error", err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const verifyAndHandlePayment = async (paymentId: string) => {
    try {
      // Poll your backend to check payment status
      const res = await fetch(`${BACKEND_URL}/api/payment-status/${paymentId}`);
      const data = await res.json();

      if (data.status === "SUCCESS") {
        onPaymentComplete?.(paymentId);
      } else if (data.status === "FAILED" || data.status === "CANCELLED") {
        onPaymentFailed?.();
      } else {
        // PENDING or PENDING_VERIFICATION — show a message
        Alert.alert(
          "Payment Pending",
          "Your payment is being verified. You will be notified once it's confirmed."
        );
      }
    } catch {
      // Silently fail — the webhook will update status
    }
  };

  return (
    <TouchableOpacity
      onPress={handlePay}
      disabled={loading}
      style={{
        backgroundColor: loading ? "#ccc" : "#111",
        padding: 16,
        borderRadius: 10,
        alignItems: "center",
      }}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>
          Pay ₹{(amount / 100).toFixed(2)}
        </Text>
      )}
    </TouchableOpacity>
  );
}
```

### Step 5 → Use in a screen

**File:** `src/screens/CheckoutScreen.tsx`

```tsx
// src/screens/CheckoutScreen.tsx
import { View, Text, Alert } from "react-native";
import { PaymentButton } from "@/components/PaymentButton";

export function CheckoutScreen() {
  const handlePaymentComplete = (paymentId: string) => {
    Alert.alert("Payment Successful!", `Payment ID: ${paymentId}`);
    // Navigate to success screen
  };

  const handlePaymentFailed = () => {
    Alert.alert("Payment Failed", "Please try again.");
  };

  return (
    <View style={{ padding: 24 }}>
      <Text style={{ fontSize: 24, fontWeight: "700" }}>Pro Plan</Text>
      <Text style={{ color: "#666", marginVertical: 8 }}>₹499 / month</Text>
      <PaymentButton
        amount={49900}
        description="Pro Plan — Monthly"
        customerEmail="user@example.com"
        onPaymentComplete={handlePaymentComplete}
        onPaymentFailed={handlePaymentFailed}
      />
    </View>
  );
}
```

### Deep Link Return (Optional)

> ⚠️ **REQUIRES VERIFICATION** — The current Devify Pay checkout page does not include a built-in `return_url` or deep-link redirect mechanism. The checkout page polls for status changes internally and shows the result inline. For mobile apps, the recommended pattern is:
> 1. Open the checkout URL in `WebBrowser.openBrowserAsync()`
> 2. When the browser is dismissed (user closes it after paying), call your backend's status check endpoint
> 3. Display the result to the user

---

## 7. Webhooks

Devify Pay sends signed POST requests to your webhook URL whenever a payment event occurs. This is the **authoritative** source of truth — do not rely solely on the frontend redirect.

### Webhook Events

| Event Type | When it fires |
|---|---|
| `payment.created` | A payment is initialized |
| `payment.success` | Payment is verified as successful |
| `payment.failed` | Payment failed |
| `payment.refunded` | Full refund completed |
| `payment.partially_refunded` | Partial refund completed |
| `order.created` | An order is created |
| `order.paid` | Order is marked PAID |
| `order.failed` | Order failed |
| `subscription.created` | A subscription is created |
| `subscription.activated` | Subscription activated after first payment |
| `subscription.cancelled` | Subscription cancelled |
| `subscription.expired` | Subscription expired |
| `refund.created` | Refund request created |
| `refund.success` | Refund completed |
| `refund.failed` | Refund failed |

### Webhook Payload Structure

Every webhook POST has this structure:

```json
{
  "event": "payment.success",
  "created_at": "2024-01-15T10:31:00.000Z",
  "data": {
    "payment_id": "pay_XyZ789AbC123",
    "order_id": "ord_AbC123XyZ789",
    "status": "SUCCESS",
    "auto_verified": true
  }
}
```

### Webhook Signature

Every webhook request includes these headers:

| Header | Description |
|---|---|
| `X-Devify-Timestamp` | Unix timestamp (seconds) when the request was signed |
| `X-Devify-Signature` | HMAC-SHA256 signature |
| `X-Devify-Event` | The event type string |
| `Content-Type` | Always `application/json` |

**Signature algorithm:**
```
signedPayload = timestamp + "." + rawBody
signature = HMAC_SHA256(webhookSecret, signedPayload)
```

**Replay attack protection:** Devify Pay signs with a timestamp. Reject requests where `|now - timestamp| > 300 seconds`.

### Step 1 → Register your webhook endpoint

Before webhooks are delivered, you must register your URL:

```bash
curl -X POST https://devifypay.site/v1/webhook-endpoints \
  -H "Authorization: Bearer sk_live_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://your-app.com/api/webhook/devify"}'
```

**Response:**

```json
{
  "id": "whe_xxx",
  "url": "https://your-app.com/api/webhook/devify",
  "secret": "whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "created_at": "2024-01-15T10:00:00.000Z"
}
```

**Save the `secret`** — it is shown only once. Put it in your `.env` as `DEVIFY_WEBHOOK_SECRET`.

### Step 2 → Create the webhook handler (Next.js)

**File:** `app/api/webhook/devify/route.ts`

```typescript
// app/api/webhook/devify/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";

const WEBHOOK_SECRET = process.env.DEVIFY_WEBHOOK_SECRET!;
const TIMESTAMP_TOLERANCE_SECONDS = 300; // 5 minutes

function verifySignature(
  rawBody: string,
  timestamp: string,
  signature: string,
  secret: string
): boolean {
  // Reject requests outside the 5-minute window
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - ts) > TIMESTAMP_TOLERANCE_SECONDS) return false;

  // Recompute HMAC-SHA256: HMAC(secret, timestamp + "." + body)
  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", secret).update(signedPayload).digest("hex");

  // Constant-time comparison to prevent timing attacks
  const bufExpected = Buffer.from(expected, "utf8");
  const bufReceived = Buffer.from(signature, "utf8");
  if (bufExpected.length !== bufReceived.length) return false;
  return timingSafeEqual(bufExpected, bufReceived);
}

export async function POST(req: NextRequest) {
  // Read raw body BEFORE parsing — you must verify the raw bytes
  const rawBody = await req.text();

  const timestamp = req.headers.get("x-devify-timestamp") ?? "";
  const signature = req.headers.get("x-devify-signature") ?? "";
  const eventType = req.headers.get("x-devify-event") ?? "";

  // 1. Verify the signature
  if (!verifySignature(rawBody, timestamp, signature, WEBHOOK_SECRET)) {
    console.error("Webhook signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // 2. Parse the payload
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // 3. Handle the event
  try {
    await handleWebhookEvent(eventType, payload);
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Webhook handler error:", err);
    // Return 500 so Devify Pay will retry delivery
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }
}

async function handleWebhookEvent(eventType: string, payload: any) {
  console.log(`Webhook received: ${eventType}`, payload.data);

  switch (eventType) {
    case "payment.success":
    case "order.paid": {
      const { payment_id, order_id } = payload.data;

      // 4. Update YOUR database
      await updateOrderStatus({
        orderId: order_id,
        paymentId: payment_id,
        status: "PAID",
      });
      break;
    }

    case "payment.failed":
    case "order.failed": {
      const { payment_id, order_id } = payload.data;
      await updateOrderStatus({
        orderId: order_id,
        paymentId: payment_id,
        status: "FAILED",
      });
      break;
    }

    case "refund.success": {
      const { payment_id } = payload.data;
      await markRefundCompleted({ paymentId: payment_id });
      break;
    }

    default:
      console.log(`Unhandled event type: ${eventType}`);
  }
}

// Replace these with your actual database calls:

async function updateOrderStatus(params: {
  orderId: string;
  paymentId: string;
  status: string;
}) {
  // Example with Prisma:
  // await prisma.order.update({
  //   where: { devifyOrderId: params.orderId },
  //   data: { status: params.status, devifyPaymentId: params.paymentId },
  // });
  console.log("DB update:", params);
}

async function markRefundCompleted(params: { paymentId: string }) {
  console.log("Refund completed:", params);
}
```

### Step 3 → Create the webhook handler (Express / Node.js)

**File:** `server/routes/webhook.js`

```javascript
// server/routes/webhook.js
const express = require("express");
const { createHmac, timingSafeEqual } = require("crypto");
const router = express.Router();

const WEBHOOK_SECRET = process.env.DEVIFY_WEBHOOK_SECRET;
const TIMESTAMP_TOLERANCE_SECONDS = 300;

// IMPORTANT: Use express.raw() to get the raw body, NOT express.json()
router.post(
  "/api/webhook/devify",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const rawBody = req.body.toString("utf8");
    const timestamp = req.headers["x-devify-timestamp"] ?? "";
    const signature = req.headers["x-devify-signature"] ?? "";
    const eventType = req.headers["x-devify-event"] ?? "";

    // 1. Verify signature
    if (!verifySignature(rawBody, timestamp, signature, WEBHOOK_SECRET)) {
      console.error("Invalid webhook signature");
      return res.status(401).json({ error: "Invalid signature" });
    }

    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return res.status(400).json({ error: "Invalid JSON" });
    }

    // 2. Respond quickly — return 200 before doing heavy work
    res.json({ received: true });

    // 3. Process asynchronously
    processWebhookEvent(eventType, payload).catch(console.error);
  }
);

function verifySignature(rawBody, timestamp, signature, secret) {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - ts) > TIMESTAMP_TOLERANCE_SECONDS) return false;

  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", secret).update(signedPayload).digest("hex");

  const bufA = Buffer.from(expected, "utf8");
  const bufB = Buffer.from(signature, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

async function processWebhookEvent(eventType, payload) {
  const { payment_id, order_id } = payload.data ?? {};

  switch (eventType) {
    case "payment.success":
    case "order.paid":
      // await db.orders.update({ where: { devifyOrderId: order_id }, data: { status: "PAID" } });
      console.log("Payment success:", { payment_id, order_id });
      break;

    case "payment.failed":
      console.log("Payment failed:", { payment_id, order_id });
      break;

    default:
      console.log(`Unhandled event: ${eventType}`);
  }
}

module.exports = router;
```

### Idempotency — Handling Duplicate Webhooks

Devify Pay may retry delivery if your endpoint returns a non-2xx response. **Always store processed event IDs to avoid duplicate processing:**

```typescript
// Pseudocode — adapt to your database
async function isEventAlreadyProcessed(webhookEventId: string): Promise<boolean> {
  const existing = await db.webhookEvents.findUnique({ where: { id: webhookEventId } });
  return !!existing;
}

async function markEventProcessed(webhookEventId: string) {
  await db.webhookEvents.create({ data: { id: webhookEventId } });
}
```

> ⚠️ **REQUIRES VERIFICATION** — The current webhook payload does not include a unique event ID field in the `data` object. To implement idempotency, use the combination of `event` type + `payment_id`/`order_id` as your deduplication key, or store the `X-Devify-Timestamp` + `payment_id` hash.

### Local Webhook Testing

Use [ngrok](https://ngrok.com) to expose your local server:

```bash
# Terminal 1 — Run your app
npm run dev

# Terminal 2 — Start ngrok tunnel
ngrok http 3000

# You'll get a URL like: https://abc123.ngrok.io

# Register it with Devify Pay
curl -X POST https://devifypay.site/v1/webhook-endpoints \
  -H "Authorization: Bearer sk_live_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://abc123.ngrok.io/api/webhook/devify"}'
```

---

## 8. Database Schema

You need these tables in **your application's database** to track payments end-to-end.

### Recommended Schema (Prisma)

**File:** `prisma/schema.prisma` (your app, not Devify Pay's)

```prisma
// Your application's database schema

model Order {
  id              String   @id @default(cuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id])

  // Devify Pay references
  devifyOrderId   String?  @unique  // ord_xxx from Devify Pay
  devifyPaymentId String?  @unique  // pay_xxx from Devify Pay

  // Order details
  amount          Int              // in paise
  currency        String  @default("INR")
  description     String?
  status          OrderStatus @default(PENDING)

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  payments        Payment[]
  webhookEvents   WebhookEvent[]
}

model Payment {
  id              String   @id @default(cuid())
  orderId         String
  order           Order    @relation(fields: [orderId], references: [id])

  devifyPaymentId String?  @unique  // pay_xxx from Devify Pay
  amount          Int              // in paise
  currency        String  @default("INR")
  status          PaymentStatus @default(PENDING)
  method          String  @default("UPI")

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

model WebhookEvent {
  id              String   @id @default(cuid())
  orderId         String?
  order           Order?   @relation(fields: [orderId], references: [id])

  // Use this for idempotency
  deduplicationKey String  @unique  // e.g., "payment.success:pay_xxx"
  eventType       String
  payload         Json
  processedAt     DateTime @default(now())
}

enum OrderStatus {
  PENDING
  PAID
  FAILED
  REFUNDED
}

enum PaymentStatus {
  PENDING
  PENDING_VERIFICATION
  SUCCESS
  FAILED
  EXPIRED
  CANCELLED
}
```

### Key relationships

```
User → Order → Payment
Order ← WebhookEvent (for audit/idempotency)
```

---

## 9. Security

### ✅ Do

| Rule | Why |
|---|---|
| **Store `DEVIFY_API_KEY` only in environment variables on your server** | Never in client-side code, git, or logs |
| **Define the price in your server code**, not from the client request | Clients can tamper with amounts |
| **Verify the webhook signature on every request** | Anyone can POST to your webhook URL |
| **Use idempotency keys for all POST requests** | Prevents duplicate orders on network retries |
| **Verify payment ownership** before fulfilling an order | Prevent users from using other users' payment IDs |
| **Verify the payment amount matches your expected amount** when processing a webhook | Guard against partial payments |

### ❌ Never do

```typescript
// ❌ WRONG — trusting client-supplied amount
const { amount } = req.body;  // client can send 1 paise instead of 49900!
await createPayment({ amount });

// ✅ RIGHT — define amount on the server from your database
const product = await db.products.findById(productId);
await createPayment({ amount: product.priceInPaise });
```

```typescript
// ❌ WRONG — skipping signature verification
app.post("/api/webhook/devify", (req, res) => {
  const { event, data } = req.body;
  await db.orders.update({ status: "PAID" }); // Anyone can trigger this!
});

// ✅ RIGHT — always verify signature first
app.post("/api/webhook/devify", express.raw({ type: "application/json" }), (req, res) => {
  if (!verifySignature(req.body.toString(), req.headers)) {
    return res.status(401).send("Unauthorized");
  }
  // Now safe to process
});
```

```typescript
// ❌ WRONG — storing raw payment data in logs
console.log("Payment data:", JSON.stringify(fullPaymentObject));

// ✅ RIGHT — log only IDs
console.log("Payment created:", { orderId: order.id, paymentId: payment.id });
```

---

## 10. Testing

### Test API Keys

Use `sk_test_xxx` keys (issued from Admin Dashboard → API Keys → TEST environment). Test payments go through the same flow but don't process real money.

### Test Scenarios

#### ✅ Successful payment

```bash
# 1. Create order + payment
ORDER=$(curl -s -X POST https://devifypay.site/v1/orders \
  -H "Authorization: Bearer sk_test_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test-1" \
  -d '{"amount": 100, "currency": "INR", "description": "Test"}')

ORDER_ID=$(echo $ORDER | jq -r '.id')

PAYMENT=$(curl -s -X POST https://devifypay.site/v1/payments \
  -H "Authorization: Bearer sk_test_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test-1-pay" \
  -d "{\"order_id\": \"$ORDER_ID\", \"method\": \"UPI\"}")

PAYMENT_ID=$(echo $PAYMENT | jq -r '.id')
CHECKOUT_URL=$(echo $PAYMENT | jq -r '.checkout_url')

# 2. Open checkout URL in browser
echo "Open: $CHECKOUT_URL"

# 3. Simulate Auto-Verification (if UPI Listener is configured)
curl -X POST https://devifypay.site/v1/upi-notify \
  -H "Content-Type: application/json" \
  -H "x-upi-secret: YOUR_UPI_NOTIFY_SECRET" \
  -d "{\"tn\": \"$PAYMENT_ID\", \"note\": \"$PAYMENT_ID\", \"app\": \"com.google.android.apps.nbu.paisa.user\", \"timestamp\": $(date +%s)000}"

# 4. Verify status
curl https://devifypay.site/v1/payments/$PAYMENT_ID \
  -H "Authorization: Bearer sk_test_YOUR_KEY"
```

#### ✅ Check payment status

```bash
curl https://devifypay.site/v1/payments/pay_xxx \
  -H "Authorization: Bearer sk_test_YOUR_KEY"
```

#### ✅ Invalid webhook signature

Send a request with a wrong signature — your handler must return 401:

```bash
curl -X POST https://your-app.com/api/webhook/devify \
  -H "Content-Type: application/json" \
  -H "X-Devify-Timestamp: $(date +%s)" \
  -H "X-Devify-Signature: invalidsignature" \
  -H "X-Devify-Event: payment.success" \
  -d '{"event": "payment.success", "data": {"payment_id": "pay_fake"}}'
```

Expected response: `401 { "error": "Invalid signature" }`

#### ✅ Duplicate webhook

Send the same event twice — your handler should process it only once. Check your database to confirm the order is not double-counted.

#### ✅ Webhook arriving before frontend redirect

This is the normal case when the Android UPI Listener auto-verifies a payment. Your webhook handler must not depend on the user being on the success page.

### Test Refund

```bash
curl -X POST https://devifypay.site/v1/refunds \
  -H "Authorization: Bearer sk_test_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: refund-test-1" \
  -d '{"payment_id": "pay_XyZ789AbC123"}'
```

> ⚠️ **REQUIRES VERIFICATION** — Refunds in V1 are recorded as PENDING and require manual Admin approval via the admin dashboard. The webhook `refund.success` fires only after the admin processes it.

---

## 11. Deployment

### Vercel (Next.js)

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel

# Set environment variables
vercel env add DEVIFY_API_URL
vercel env add DEVIFY_API_KEY
vercel env add DEVIFY_WEBHOOK_SECRET

# Or use Vercel Dashboard:
# Settings → Environment Variables
```

**Important:** Vercel webhook handlers have a **10-second timeout** by default. Make sure your webhook handler responds with `200` immediately and processes asynchronously if needed.

**File:** `vercel.json` (optional config)

```json
{
  "functions": {
    "app/api/webhook/devify/route.ts": {
      "maxDuration": 30
    }
  }
}
```

### Railway

```bash
# Install Railway CLI
npm install -g @railway/cli
railway login

# Deploy
railway up

# Set environment variables via Railway dashboard or CLI
railway variables set DEVIFY_API_URL=https://devifypay.site
railway variables set DEVIFY_API_KEY=sk_live_xxx
railway variables set DEVIFY_WEBHOOK_SECRET=whsec_xxx
```

### Render / VPS

```bash
# Set environment variables in Render dashboard
# Or on VPS, add to your process manager (PM2, systemd, etc.)

# Using PM2 ecosystem file:
# ecosystem.config.js
module.exports = {
  apps: [{
    name: "your-app",
    script: "server.js",
    env: {
      NODE_ENV: "production",
      DEVIFY_API_URL: "https://devifypay.site",
      DEVIFY_API_KEY: "sk_live_xxx",
      DEVIFY_WEBHOOK_SECRET: "whsec_xxx",
    },
  }],
};

pm2 start ecosystem.config.js
```

### Production Webhook Configuration

After deploying, register your production webhook URL:

```bash
# Replace with your production app URL
curl -X POST https://devifypay.site/v1/webhook-endpoints \
  -H "Authorization: Bearer sk_live_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://your-production-app.com/api/webhook/devify"}'
```

**Save the returned `secret` and add it to your production environment variables.**

---

## 12. Troubleshooting

### ❌ Checkout URL not generated

**Symptom:** `POST /v1/payments` returns an error

**Check:**
1. Is the `order_id` valid? The order must have been created first with `POST /v1/orders`
2. Is the `Idempotency-Key` header present? It is required
3. Is the API key in the `Authorization: Bearer sk_xxx` format?

```bash
# Verify your API key works
curl https://devifypay.site/v1/orders \
  -H "Authorization: Bearer sk_live_YOUR_KEY"
# Should return { "data": [...] }
```

---

### ❌ API authentication errors (401)

**Symptom:** `{"error": {"code": "UNAUTHORIZED", ...}}`

**Check:**
1. API key format must be `Authorization: Bearer sk_live_xxx` or `Authorization: Bearer sk_test_xxx`
2. Key must start with `sk_live_` (production) or `sk_test_` (testing)
3. Key must not be revoked — check Admin Dashboard → Applications → API Keys
4. Application must have `ACTIVE` status

```bash
# ❌ Wrong
curl -H "x-api-key: sk_live_xxx"          # Wrong header name
curl -H "Authorization: sk_live_xxx"      # Missing "Bearer "

# ✅ Correct
curl -H "Authorization: Bearer sk_live_xxx"
```

---

### ❌ `Idempotency-Key` error (400)

**Symptom:** `{"error": {"code": "IDEMPOTENCY_KEY_REQUIRED", ...}}`

**Fix:** Add a unique `Idempotency-Key` header to every `POST /v1/orders` and `POST /v1/payments` request:

```typescript
"Idempotency-Key": `idem_${Date.now()}_${Math.random().toString(36).slice(2)}`
```

---

### ❌ Webhook not received

**Check:**
1. Did you register the webhook endpoint? `POST /v1/webhook-endpoints`
2. Is your webhook URL publicly accessible? (Not localhost — use ngrok for local testing)
3. Is your endpoint returning `2xx`? Non-2xx responses trigger retries with a delay
4. Check the Admin Dashboard → Webhook Events for delivery status and error logs

---

### ❌ Signature verification failure

**Symptom:** Your webhook handler rejects valid events

**Debug steps:**

```typescript
// Add temporary debug logging
console.log("Raw body:", rawBody);
console.log("Timestamp:", timestamp);
console.log("Signature:", signature);
console.log("Secret:", WEBHOOK_SECRET.slice(0, 10) + "...");

const signedPayload = `${timestamp}.${rawBody}`;
const expected = createHmac("sha256", WEBHOOK_SECRET).update(signedPayload).digest("hex");
console.log("Expected signature:", expected);
console.log("Match:", expected === signature);
```

**Common mistakes:**
- Using `req.body` (parsed JSON object) instead of the raw body string
- Trimming or modifying the body before verification
- Using the wrong secret (ensure `DEVIFY_WEBHOOK_SECRET` matches what was returned when registering the endpoint)

---

### ❌ Payment stuck in `PENDING`

**Possible reasons:**
1. **Customer didn't pay** — The QR was displayed but no payment was made
2. **Auto-verification not configured** — The Android UPI Listener isn't running or `upiNotifySecret` isn't set
3. **Customer paid but needs manual verification** — Customer clicked "I HAVE PAID", submitted a UPI ref, and the payment is now `PENDING_VERIFICATION`, waiting for admin approval

**Check payment status:**

```bash
curl https://devifypay.site/v1/payments/pay_xxx \
  -H "Authorization: Bearer sk_live_YOUR_KEY"
```

**If `PENDING_VERIFICATION`:** Go to Admin Dashboard → Payments → Pending Verification → Approve

---

### ❌ Mobile app not returning after payment

**Symptom:** User pays on the checkout page, closes the browser, but the app doesn't update

**Solution:** Poll your backend after the browser is dismissed:

```typescript
// After WebBrowser.openBrowserAsync() resolves
const status = await checkPaymentStatus(paymentId);
if (status === "SUCCESS") {
  navigation.navigate("SuccessScreen");
} else {
  // Show "payment pending" message — webhook will update when confirmed
}
```

> Deep-link automatic return **⚠️ REQUIRES IMPLEMENTATION** — The current Devify Pay checkout page does not issue a deep-link redirect. This must be added to the checkout page HTML template if needed.

---

## API Reference Summary

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/v1/orders` | Bearer | Create an order |
| `GET` | `/v1/orders/:id` | Bearer | Get order by ID |
| `GET` | `/v1/orders` | Bearer | List orders (last 50) |
| `POST` | `/v1/payments` | Bearer | Create a payment + checkout URL |
| `GET` | `/v1/payments/:id` | Bearer | Get payment status |
| `GET` | `/v1/payments` | Bearer | List payments (last 50) |
| `POST` | `/v1/refunds` | Bearer | Request a refund |
| `GET` | `/v1/refunds/:id` | Bearer | Get refund status |
| `POST` | `/v1/webhook-endpoints` | Bearer | Register webhook URL |
| `GET` | `/v1/webhook-endpoints` | Bearer | List registered webhooks |
| `DELETE` | `/v1/webhook-endpoints/:id` | Bearer | Remove webhook endpoint |
| `POST` | `/v1/subscriptions` | Bearer | Create a subscription |
| `GET` | `/v1/subscriptions/:id` | Bearer | Get subscription |
| `POST` | `/v1/subscriptions/:id/cancel` | Bearer | Cancel subscription |
| `GET` | `/v1/plans` | Bearer | List subscription plans |
| `GET` | `/pay/:id` | Public | Hosted checkout page |
| `GET` | `/pay/:id/status` | Public | Payment status polling |
| `GET` | `/health` | Public | API health check |

---

*This guide is based on direct code inspection of the Devify Pay monorepo. All endpoints, schemas, and behaviors documented here are verified against the actual implementation.*
