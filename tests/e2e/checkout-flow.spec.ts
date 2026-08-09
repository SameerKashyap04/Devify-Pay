import { test, expect } from "@playwright/test";

test.describe("Checkout → Verification → Webhook E2E Flow", () => {
  const API_URL = process.env.API_URL || "http://localhost:4000";

  test("full payment lifecycle: create order, launch checkout, submit UPI ref, approve as admin", async ({
    page,
    request,
  }) => {
    // Step 1: Admin login to obtain session and application credentials
    const loginRes = await request.post(`${API_URL}/v1/admin/auth/login`, {
      data: { email: "admin@devify.local", password: "ChangeMe123!" },
    });
    expect(loginRes.ok()).toBeTruthy();
    const loginData = await loginRes.json();
    const sessionCookie = loginRes.headers()["set-cookie"];
    expect(loginData.admin.email).toBe("admin@devify.local");

    // Fetch existing test application (AirMate)
    const appsRes = await request.get(`${API_URL}/v1/admin/applications`, {
      headers: { cookie: sessionCookie },
    });
    expect(appsRes.ok()).toBeTruthy();
    const appsData = await appsRes.json();
    const airmate = appsData.data.find((a: any) => a.slug === "airmate");
    expect(airmate).toBeDefined();

    // Issue a new test API key for AirMate
    const apiKeyRes = await request.post(
      `${API_URL}/v1/admin/applications/${airmate.id}/api-keys`,
      {
        headers: { cookie: sessionCookie },
        data: { environment: "TEST", name: "E2E Test Key" },
      }
    );
    expect(apiKeyRes.ok()).toBeTruthy();
    const apiKeyData = await apiKeyRes.json();
    const secretKey = apiKeyData.secret;
    expect(secretKey).toMatch(/^sk_test_/);

    // Step 2: Merchant creates order via API with Authorization Bearer & idempotency key
    const orderRes = await request.post(`${API_URL}/v1/orders`, {
      headers: {
        authorization: `Bearer ${secretKey}`,
        "idempotency-key": `idem_order_${Date.now()}`,
      },
      data: {
        amount: 49900, // ₹499.00
        currency: "INR",
        description: "Pro E2E Test Subscription",
        customer: {
          name: "Playwright E2E Tester",
          email: `e2e_customer_${Date.now()}@example.com`,
          phone: "9876543210",
        },
      },
    });
    expect(orderRes.ok()).toBeTruthy();
    const orderData = await orderRes.json();
    expect(orderData.status).toBe("PENDING");

    // Step 3: Initialize payment for the order
    const paymentRes = await request.post(`${API_URL}/v1/payments`, {
      headers: {
        authorization: `Bearer ${secretKey}`,
        "idempotency-key": `idem_e2e_${Date.now()}`,
      },
      data: {
        order_id: orderData.id,
        method: "UPI",
      },
    });
    expect(paymentRes.ok()).toBeTruthy();
    const paymentData = await paymentRes.json();
    expect(paymentData.status).toBe("PENDING");
    expect(paymentData.checkout_url).toContain(`/pay/${paymentData.id}`);

    // Step 4: Customer opens hosted checkout page in browser
    await page.goto(paymentData.checkout_url);

    // Assert checkout UI elements
    await expect(page.locator(".brand")).toHaveText("Devify Pay");
    await expect(page.locator(".app-name")).toHaveText("AirMate");
    await expect(page.locator(".amount")).toHaveText("₹499.00");
    await expect(page.locator("#paidBtn")).toBeVisible();

    // Click 'I HAVE PAID' to open transaction confirmation form
    await page.click("#paidBtn");
    await expect(page.locator("#confirmForm")).toBeVisible();

    const txnRef = `TXN_E2E_${Date.now()}`;
    await page.fill("#txnId", txnRef);
    await page.click("#submitBtn");

    // Verify page updates to PENDING_VERIFICATION
    await expect(
      page.locator("text=We've received your reference ID")
    ).toBeVisible({ timeout: 10000 });

    // Step 5: Admin reviews & verifies payment
    const verifyRes = await request.post(
      `${API_URL}/v1/admin/payments/${paymentData.id}/verify`,
      {
        headers: { cookie: sessionCookie },
        data: { action: "APPROVE", note: "Verified in Playwright E2E test" },
      }
    );
    expect(verifyRes.ok()).toBeTruthy();
    const verifyData = await verifyRes.json();
    expect(verifyData.status).toBe("SUCCESS");

    // Step 6: Verify final order & payment state via merchant API
    const finalOrderRes = await request.get(`${API_URL}/v1/orders/${orderData.id}`, {
      headers: { authorization: `Bearer ${secretKey}` },
    });
    expect(finalOrderRes.ok()).toBeTruthy();
    const finalOrderData = await finalOrderRes.json();
    expect(finalOrderData.status).toBe("PAID");

    const finalPaymentRes = await request.get(`${API_URL}/v1/payments/${paymentData.id}`, {
      headers: { authorization: `Bearer ${secretKey}` },
    });
    expect(finalPaymentRes.ok()).toBeTruthy();
    const finalPaymentData = await finalPaymentRes.json();
    expect(finalPaymentData.status).toBe("SUCCESS");
  });
});
