import QRCode from "qrcode";
import type {
  PaymentProvider,
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentStatusResult,
  RefundPaymentInput,
  RefundResult,
  WebhookVerificationResult,
} from "@devify/types";
import { env } from "../../config/env.js";
import { prisma } from "@devify/database";

/**
 * V1 provider. Generates a standard UPI deep-link URI + QR code for the
 * configured merchant VPA. Merchant VPA is read from the SystemConfig DB
 * record (set via the Admin Settings page) with env-var fallback.
 * The `tn` field is set to the raw payment publicId (e.g. "pay_abc123")
 * so the Android companion app can extract it via regex from push notifications.
 */
export class ManualUpiProvider implements PaymentProvider {
  name = "manual_upi" as const;

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    // Read merchant config from DB settings page, fall back to env vars
    const config = await prisma.systemConfig.findUnique({ where: { id: "singleton" } });
    const upiVpa = config?.upiVpa ?? env.UPI_MERCHANT_ID;
    const upiName = config?.merchantName ?? env.UPI_MERCHANT_NAME;

    const amountRupees = (input.amount / 100).toFixed(2);
    // CRITICAL: tn = payment publicId so Android regex /pay_[a-zA-Z0-9]+/ can extract it
    const tn = input.publicPaymentId;

    const upiUri =
      `upi://pay?pa=${encodeURIComponent(upiVpa)}` +
      `&pn=${encodeURIComponent(upiName)}` +
      `&am=${amountRupees}` +
      `&cu=${input.currency}` +
      `&tn=${encodeURIComponent(tn)}` +
      `&tr=${encodeURIComponent(tn)}`;

    const qrDataUrl = await QRCode.toDataURL(upiUri, { margin: 1, width: 320 });

    return {
      status: "PENDING",
      upiUri,
      qrDataUrl,
      providerPaymentId: input.publicPaymentId,
    };
  }

  async getPaymentStatus(_providerPaymentId: string): Promise<PaymentStatusResult> {
    // Manual UPI has no provider-side status API in V1; status is driven
    // entirely by the customer confirmation + admin verification flow.
    return { status: "PENDING" };
  }

  async refundPayment(_input: RefundPaymentInput): Promise<RefundResult> {
    // Manual refunds are executed by an admin through the actual bank/UPI
    // app and then recorded — this provider never claims to auto-execute one.
    return { status: "PENDING" };
  }

  async verifyWebhook(
    _payload: unknown,
    _headers: Record<string, string>
  ): Promise<WebhookVerificationResult> {
    // Manual UPI does not receive provider webhooks in V1.
    return { valid: false };
  }
}
