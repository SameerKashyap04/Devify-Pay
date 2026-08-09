/** Shared constants used across apps/packages that don't belong to a single domain package. */

export const CURRENCY_MINOR_UNITS: Record<string, number> = {
  INR: 100,
  USD: 100,
};

export const DEFAULT_ORDER_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24h
export const DEFAULT_PAYMENT_EXPIRY_MS = 15 * 60 * 1000; // 15 min

export const API_ID_PREFIXES = {
  order: "ord",
  payment: "pay",
  refund: "rfnd",
} as const;
