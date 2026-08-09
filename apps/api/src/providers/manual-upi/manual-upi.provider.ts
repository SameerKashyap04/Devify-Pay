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

/**
 * V1 provider. Generates a standard UPI deep-link URI + QR code for the
 * configured merchant VPA. Does NOT and cannot confirm payment on its own —
 * the customer submits a transaction reference, and an admin verifies it
 * through the actual bank/merchant interface before the payment is marked
 * SUCCESS. This provider never scrapes bank/UPI apps or SMS, and never
 * auto-confirms a payment.
 */
export class ManualUpiProvider implements PaymentProvider {
  name = "manual_upi" as const;

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const amountRupees = (input.amount / 100).toFixed(2);
    const note = encodeURIComponent(`Devify ${input.reference}`.slice(0, 50));

    const upiUri =
      `upi://pay?pa=${encodeURIComponent(env.UPI_MERCHANT_ID)}` +
      `&pn=${encodeURIComponent(env.UPI_MERCHANT_NAME)}` +
      `&am=${amountRupees}` +
      `&cu=${input.currency}` +
      `&tn=${note}`;

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
