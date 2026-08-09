import type {
  PaymentProvider,
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentStatusResult,
  RefundPaymentInput,
  RefundResult,
  WebhookVerificationResult,
} from "@devify/types";
import { ProviderNotConfiguredError } from "@devify/payment-core";

/**
 * Placeholder for the Razorpay integration. Not implemented in V1.
 * When enabling this provider, implement each method against Razorpay's
 * current official API documentation and credentials sourced from
 * environment variables — never invent endpoints or fabricate responses.
 */
export class RazorpayProvider implements PaymentProvider {
  name = "razorpay" as const;

  async createPayment(_input: CreatePaymentInput): Promise<CreatePaymentResult> {
    throw new ProviderNotConfiguredError("razorpay");
  }

  async getPaymentStatus(_providerPaymentId: string): Promise<PaymentStatusResult> {
    throw new ProviderNotConfiguredError("razorpay");
  }

  async refundPayment(_input: RefundPaymentInput): Promise<RefundResult> {
    throw new ProviderNotConfiguredError("razorpay");
  }

  async verifyWebhook(
    _payload: unknown,
    _headers: Record<string, string>
  ): Promise<WebhookVerificationResult> {
    throw new ProviderNotConfiguredError("razorpay");
  }
}
