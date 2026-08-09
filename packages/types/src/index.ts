export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    request_id: string;
  };
};

export type PaymentProviderName = "manual_upi" | "phonepe" | "paytm" | "razorpay";

export interface CreatePaymentInput {
  paymentId: string; // internal db id
  publicPaymentId: string; // pay_xxxxx
  orderId: string;
  amount: number; // minor units
  currency: string;
  customer?: {
    name?: string;
    email?: string;
    phone?: string;
  };
  reference: string; // order reference shown to customer / used in UPI txn note
  mode: "TEST" | "LIVE";
}

export interface CreatePaymentResult {
  providerPaymentId?: string;
  status: "PENDING" | "PENDING_VERIFICATION" | "FAILED";
  upiUri?: string;
  qrDataUrl?: string;
  raw?: unknown;
}

export interface PaymentStatusResult {
  status:
    | "CREATED"
    | "PENDING"
    | "PENDING_VERIFICATION"
    | "PROCESSING"
    | "SUCCESS"
    | "FAILED"
    | "EXPIRED"
    | "CANCELLED";
  raw?: unknown;
}

export interface RefundPaymentInput {
  paymentId: string;
  providerPaymentId?: string;
  amount: number;
  reason?: string;
}

export interface RefundResult {
  status: "PENDING" | "PROCESSING" | "SUCCESS" | "FAILED";
  providerRefundId?: string;
  raw?: unknown;
}

export interface WebhookVerificationResult {
  valid: boolean;
  eventType?: string;
  raw?: unknown;
}

/**
 * Generic provider interface. All payment providers (manual UPI today,
 * PhonePe/Paytm/Razorpay later) implement this so the payment engine and
 * controllers never depend on provider-specific logic.
 */
export interface PaymentProvider {
  name: PaymentProviderName;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  getPaymentStatus(providerPaymentId: string): Promise<PaymentStatusResult>;
  refundPayment(input: RefundPaymentInput): Promise<RefundResult>;
  verifyWebhook(
    payload: unknown,
    headers: Record<string, string>
  ): Promise<WebhookVerificationResult>;
}

export type WebhookEventType =
  | "payment.created"
  | "payment.pending"
  | "payment.success"
  | "payment.failed"
  | "payment.refunded"
  | "payment.partially_refunded"
  | "order.created"
  | "order.paid"
  | "order.failed"
  | "subscription.created"
  | "subscription.activated"
  | "subscription.cancelled"
  | "subscription.expired"
  | "refund.created"
  | "refund.success"
  | "refund.failed";
