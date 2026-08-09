import { randomUUID } from "node:crypto";

export interface DevifyPayOptions {
  apiKey: string;
  baseUrl?: string; // defaults to https://api.devifypay.com
}

export interface CreateOrderParams {
  amount: number;
  currency?: string;
  description?: string;
  customer?: { name?: string; email?: string; phone?: string };
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface CreatePaymentParams {
  order_id: string;
  method?: "UPI" | "CARD" | "NETBANKING" | "WALLET" | "OTHER";
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface CreateRefundParams {
  payment_id: string;
  amount?: number;
  reason?: string;
  idempotencyKey?: string;
}

class DevifyApiError extends Error {
  code: string;
  requestId: string;
  statusCode: number;
  constructor(statusCode: number, code: string, message: string, requestId: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.requestId = requestId;
  }
}

/**
 * Server-side only. Never embed a secret key (`sk_test_*` / `sk_live_*`) in
 * a mobile app or frontend bundle — call your own backend, which calls
 * Devify Pay with the key kept server-side.
 */
export class DevifyPay {
  private apiKey: string;
  private baseUrl: string;

  constructor(options: DevifyPayOptions) {
    if (!options.apiKey) throw new Error("DevifyPay requires an apiKey");
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? "https://api.devifypay.com").replace(/\/$/, "");
  }

  private async request<T>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    body?: unknown,
    idempotencyKey?: string
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
    if (method === "POST") {
      headers["Idempotency-Key"] = idempotencyKey ?? randomUUID();
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      const err = data?.error ?? { code: "UNKNOWN_ERROR", message: "Request failed", request_id: "unknown" };
      throw new DevifyApiError(res.status, err.code, err.message, err.request_id);
    }

    return data as T;
  }

  orders = {
    create: (params: CreateOrderParams) => {
      const { idempotencyKey, ...body } = params;
      return this.request("POST", "/v1/orders", body, idempotencyKey);
    },
    retrieve: (id: string) => this.request("GET", `/v1/orders/${id}`),
    list: () => this.request("GET", "/v1/orders"),
  };

  payments = {
    create: (params: CreatePaymentParams) => {
      const { idempotencyKey, ...body } = params;
      return this.request("POST", "/v1/payments", body, idempotencyKey);
    },
    retrieve: (id: string) => this.request("GET", `/v1/payments/${id}`),
    list: () => this.request("GET", "/v1/payments"),
  };

  refunds = {
    create: (params: CreateRefundParams) => {
      const { idempotencyKey, ...body } = params;
      return this.request("POST", "/v1/refunds", body, idempotencyKey);
    },
    retrieve: (id: string) => this.request("GET", `/v1/refunds/${id}`),
  };

  webhookEndpoints = {
    create: (url: string) => this.request("POST", "/v1/webhook-endpoints", { url }),
    list: () => this.request("GET", "/v1/webhook-endpoints"),
    delete: (id: string) => this.request("DELETE", `/v1/webhook-endpoints/${id}`),
  };
}

export { DevifyApiError };
