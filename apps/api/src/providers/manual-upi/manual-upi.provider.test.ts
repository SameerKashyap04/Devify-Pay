import { describe, it, expect, vi, beforeEach } from "vitest";
import { ManualUpiProvider, _resetSystemConfigCache } from "./manual-upi.provider.js";
import { prisma } from "@devify/database";

vi.mock("@devify/database", () => ({
  prisma: {
    systemConfig: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("../../config/env.js", () => ({
  env: {
    UPI_MERCHANT_ID: "default@ptaxis",
    UPI_MERCHANT_NAME: "Default Store",
  },
}));

describe("ManualUpiProvider", () => {
  let provider: ManualUpiProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    _resetSystemConfigCache();
    provider = new ManualUpiProvider();
  });

  it("generates a clean standard UPI URI without mode=02, mc=0000, or purpose=00", async () => {
    (prisma.systemConfig.findUnique as any).mockResolvedValue({
      upiVpa: "8822509004@ptaxis",
      merchantName: "SAMEER KASHYAP",
    });

    const result = await provider.createPayment({
      paymentId: "pay_test123",
      publicPaymentId: "pay_test123",
      orderId: "ord_123",
      amount: 34900, // ₹349.00
      currency: "INR",
      reference: "ord_123",
      mode: "LIVE",
    });

    expect(result.status).toBe("PENDING");
    expect(result.providerPaymentId).toBe("pay_test123");
    expect(result.qrDataUrl).toBeDefined();

    const uri = result.upiUri!;
    expect(uri).toContain("upi://pay?");
    expect(uri).toContain("pa=8822509004@ptaxis");
    expect(uri).toContain("pn=SAMEER%20KASHYAP");
    expect(uri).toContain("am=349.00");
    expect(uri).toContain("cu=INR");
    expect(uri).toContain("tn=pay_test123");

    // Critical: Ensure no merchant mode or bogus MCC flags that cause risk declines
    expect(uri).not.toContain("mode=02");
    expect(uri).not.toContain("mc=0000");
    expect(uri).not.toContain("purpose=00");
    expect(uri).not.toContain("tr=");
    expect(uri).not.toContain("%40"); // @ should not be encoded in pa
  });

  it("generates merchant parameters when accountType is set to MERCHANT", async () => {
    (prisma.systemConfig.findUnique as any).mockResolvedValue({
      upiVpa: "business@icici",
      merchantName: "Devify Technologies",
      accountType: "MERCHANT",
      mcc: "7372",
    });

    const result = await provider.createPayment({
      paymentId: "pay_merch789",
      publicPaymentId: "pay_merch789",
      orderId: "ord_789",
      amount: 99900,
      currency: "INR",
      reference: "ord_789",
      mode: "LIVE",
    });

    const uri = result.upiUri!;
    expect(uri).toContain("pa=business@icici");
    expect(uri).toContain("pn=Devify%20Technologies");
    expect(uri).toContain("am=999.00");
    expect(uri).toContain("mc=7372");
    expect(uri).toContain("mode=02");
    expect(uri).toContain("purpose=00");
  });
});
