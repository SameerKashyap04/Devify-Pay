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
 * Placeholder for the Paytm integration. Not implemented in V1.
 * When enabling this provider, implement each method against Paytm's
 * current official API documentation and credentials sourced from
 * environment variables — never invent endpoints or fabricate responses.
 */
export class PaytmProvider implements PaymentProvider {
  name = "paytm" as const;

  async createPayment(_input: CreatePaymentInput): Promise<CreatePaymentResult> {
    throw new ProviderNotConfiguredError("paytm");
  }

  async getPaymentStatus(_providerPaymentId: string): Promise<PaymentStatusResult> {
    throw new ProviderNotConfiguredError("paytm");
  }

  async refundPayment(_input: RefundPaymentInput): Promise<RefundResult> {
    throw new ProviderNotConfiguredError("paytm");
  }

  async verifyWebhook(
    _payload: unknown,
    _headers: Record<string, string>
  ): Promise<WebhookVerificationResult> {
    throw new ProviderNotConfiguredError("paytm");
  }
}
