import { test, expect } from "@playwright/test";

test.describe("Auto-Verification & Subscriptions E2E Flow", () => {
  const API_URL = process.env.API_URL || "http://localhost:4000";

  test("full lifecycle: configure listener, create subscription, auto-verify payment", async ({
    request,
  }) => {
    // 1. Admin login
    const loginRes = await request.post(`${API_URL}/v1/admin/auth/login`, {
      data: { email: "admin@devify.local", password: "ChangeMe123!" },
    });
    expect(loginRes.ok()).toBeTruthy();
    const sessionCookie = loginRes.headers()["set-cookie"];

    // 2. Configure System Settings (Set UPI Notify Secret)
    const settingsRes = await request.patch(`${API_URL}/v1/admin/settings`, {
      headers: { cookie: sessionCookie },
      data: { upiNotifySecret: "e2e_test_secret_123" }
    });
    expect(settingsRes.ok()).toBeTruthy();

    // 3. Fetch existing app & create API key
    const appsRes = await request.get(`${API_URL}/v1/admin/applications`, {
      headers: { cookie: sessionCookie },
    });
    const appsData = await appsRes.json();
    const airmate = appsData.data.find((a: any) => a.slug === "airmate");
    
    const apiKeyRes = await request.post(
      `${API_URL}/v1/admin/applications/${airmate.id}/api-keys`,
      {
        headers: { cookie: sessionCookie },
        data: { environment: "TEST", name: "AutoVerify Test Key" },
      }
    );
    const secretKey = (await apiKeyRes.json()).secret;

    // 4. Create Plan via Admin API
    const planRes = await request.post(`${API_URL}/v1/admin/applications/${airmate.id}/plans`, {
      headers: { cookie: sessionCookie },
      data: { name: "Pro Plan", amount: 1000, currency: "INR", interval: "MONTH" }
    });
    expect(planRes.ok()).toBeTruthy();
    const planData = await planRes.json();

    // 5. Create Subscription (implicitly creates customer)
    const subRes = await request.post(`${API_URL}/v1/subscriptions`, {
      headers: { authorization: `Bearer ${secretKey}`, "idempotency-key": `idem_sub_${Date.now()}` },
      data: { 
        plan_id: planData.id, 
        customer: { name: "Sub User", email: `sub_${Date.now()}@test.com`, phone: "1234567890" } 
      }
    });
    if (!subRes.ok()) console.log("Sub error:", await subRes.text());
    expect(subRes.ok()).toBeTruthy();
    const subData = await subRes.json();
    expect(subData.status).toBe("TRIALING");

    // 6. Create Order and Payment for the subscription fee
    const orderRes = await request.post(`${API_URL}/v1/orders`, {
      headers: { authorization: `Bearer ${secretKey}`, "idempotency-key": `idem_ord_${Date.now()}` },
      data: { amount: 1000, currency: "INR", description: "Sub Payment", customer: { email: `sub_${Date.now()}@test.com` } }
    });
    if (!orderRes.ok()) console.log("Order error:", await orderRes.text());
    expect(orderRes.ok()).toBeTruthy();
    const orderData = await orderRes.json();

    const paymentRes = await request.post(`${API_URL}/v1/payments`, {
      headers: { authorization: `Bearer ${secretKey}`, "idempotency-key": `idem_pay_${Date.now()}` },
      data: { order_id: orderData.id, method: "UPI" }
    });
    if (!paymentRes.ok()) console.log("Payment error:", await paymentRes.text());
    expect(paymentRes.ok()).toBeTruthy();
    const paymentData = await paymentRes.json();

    // 7. Auto-Verify Payment using UPI Listener Webhook
    const notifyRes = await request.post(`${API_URL}/v1/upi-notify`, {
      headers: { "x-upi-secret": "e2e_test_secret_123" },
      data: {
        tn: paymentData.id,
        note: `Payment for ${paymentData.id}`,
        app: "com.google.android.apps.nbu.paisa.user",
        timestamp: Date.now()
      }
    });
    if (!notifyRes.ok()) console.log("Notify error:", await notifyRes.text());
    expect(notifyRes.ok()).toBeTruthy();
    const notifyData = await notifyRes.json();
    console.log("Notify Response:", notifyData);
    expect(notifyData.ok).toBeTruthy(); // Should process successfully

    // 8. Verify Payment was marked SUCCESS
    const verifyPaymentRes = await request.get(`${API_URL}/v1/payments/${paymentData.id}`, {
      headers: { authorization: `Bearer ${secretKey}` },
    });
    const verifyData = await verifyPaymentRes.json();
    expect(verifyData.status).toBe("SUCCESS");

    // 9. Auto-Verify Idempotency test
    const notifyResDup = await request.post(`${API_URL}/v1/upi-notify`, {
      headers: { "x-upi-secret": "e2e_test_secret_123" },
      data: { tn: paymentData.id, note: "", app: "", timestamp: Date.now() }
    });
    expect((await notifyResDup.json()).message).toContain("Already processed");
  });
});
