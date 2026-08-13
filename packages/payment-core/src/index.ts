import type { PaymentProvider, PaymentProviderName } from "@devify/types";

// ==========================================
// Payment State Machine
// ==========================================

export type PaymentStatus =
  | "CREATED"
  | "PENDING"
  | "PENDING_VERIFICATION"
  | "PROCESSING"
  | "SUCCESS"
  | "FAILED"
  | "EXPIRED"
  | "CANCELLED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED";

/**
 * Explicit allow-list of valid payment status transitions.
 * Any transition not listed here is rejected. This is the single
 * source of truth for payment state changes across the platform.
 */
const ALLOWED_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  CREATED: ["PENDING", "FAILED", "CANCELLED"],
  PENDING: ["PENDING_VERIFICATION", "PROCESSING", "FAILED", "EXPIRED", "CANCELLED"],
  PENDING_VERIFICATION: ["SUCCESS", "FAILED"],
  PROCESSING: ["SUCCESS", "FAILED"],
  SUCCESS: ["REFUNDED", "PARTIALLY_REFUNDED"],
  FAILED: [], // a new payment attempt must be created instead of resurrecting this one
  EXPIRED: [],
  CANCELLED: [],
  REFUNDED: [],
  PARTIALLY_REFUNDED: ["REFUNDED"],
};

export class InvalidPaymentTransitionError extends Error {
  constructor(from: PaymentStatus, to: PaymentStatus) {
    super(`Invalid payment status transition: ${from} -> ${to}`);
    this.name = "InvalidPaymentTransitionError";
  }
}

export function assertValidTransition(from: PaymentStatus, to: PaymentStatus): void {
  const allowed = ALLOWED_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new InvalidPaymentTransitionError(from, to);
  }
}

export function canTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}

export type OrderStatus =
  | "PENDING"
  | "PAID"
  | "FAILED"
  | "EXPIRED"
  | "CANCELLED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED";

const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["PAID", "FAILED", "EXPIRED", "CANCELLED"],
  PAID: ["REFUNDED", "PARTIALLY_REFUNDED"],
  FAILED: [],
  EXPIRED: [],
  CANCELLED: [],
  REFUNDED: [],
  PARTIALLY_REFUNDED: ["REFUNDED"],
};

export function assertValidOrderTransition(from: OrderStatus, to: OrderStatus): void {
  const allowed = ORDER_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new Error(`Invalid order status transition: ${from} -> ${to}`);
  }
}

// ==========================================
// Provider Registry
// ==========================================

/**
 * Central registry the payment engine uses to resolve a provider
 * implementation by name. Controllers/services never import a
 * concrete provider directly — they ask the registry for one.
 */
export class ProviderRegistry {
  private providers = new Map<PaymentProviderName, PaymentProvider>();

  register(provider: PaymentProvider): void {
    this.providers.set(provider.name, provider);
  }

  get(name: PaymentProviderName): PaymentProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new ProviderNotConfiguredError(name);
    }
    return provider;
  }

  has(name: PaymentProviderName): boolean {
    return this.providers.has(name);
  }
}

export class ProviderNotConfiguredError extends Error {
  code = "PROVIDER_NOT_CONFIGURED";
  constructor(name: PaymentProviderName) {
    super(`Provider "${name}" is not configured`);
    this.name = "ProviderNotConfiguredError";
  }
}
