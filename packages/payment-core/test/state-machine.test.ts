import { describe, it, expect } from "vitest";
import {
  assertValidTransition,
  canTransition,
  InvalidPaymentTransitionError,
  assertValidOrderTransition,
} from "../src/state-machine.js";

describe("payment state machine", () => {
  it("allows the standard success path", () => {
    expect(() => assertValidTransition("CREATED", "PENDING")).not.toThrow();
    expect(() => assertValidTransition("PENDING", "PENDING_VERIFICATION")).not.toThrow();
    expect(() => assertValidTransition("PENDING_VERIFICATION", "SUCCESS")).not.toThrow();
  });

  it("allows rejection from pending verification", () => {
    expect(() => assertValidTransition("PENDING_VERIFICATION", "FAILED")).not.toThrow();
  });

  it("allows expiry and cancellation from pending", () => {
    expect(canTransition("PENDING", "EXPIRED")).toBe(true);
    expect(canTransition("PENDING", "CANCELLED")).toBe(true);
  });

  it("rejects FAILED -> SUCCESS", () => {
    expect(() => assertValidTransition("FAILED", "SUCCESS")).toThrow(InvalidPaymentTransitionError);
  });

  it("rejects skipping straight from CREATED to SUCCESS", () => {
    expect(() => assertValidTransition("CREATED", "SUCCESS")).toThrow(InvalidPaymentTransitionError);
  });

  it("rejects re-entering PENDING_VERIFICATION after SUCCESS", () => {
    expect(canTransition("SUCCESS", "PENDING_VERIFICATION")).toBe(false);
  });

  it("allows refund transitions only from SUCCESS or PARTIALLY_REFUNDED", () => {
    expect(canTransition("SUCCESS", "REFUNDED")).toBe(true);
    expect(canTransition("SUCCESS", "PARTIALLY_REFUNDED")).toBe(true);
    expect(canTransition("PARTIALLY_REFUNDED", "REFUNDED")).toBe(true);
    expect(canTransition("FAILED", "REFUNDED")).toBe(false);
  });
});

describe("order state machine", () => {
  it("allows PENDING -> PAID", () => {
    expect(() => assertValidOrderTransition("PENDING", "PAID")).not.toThrow();
  });

  it("rejects PAID -> PENDING", () => {
    expect(() => assertValidOrderTransition("PAID", "PENDING")).toThrow();
  });

  it("rejects transitions out of terminal FAILED state", () => {
    expect(() => assertValidOrderTransition("FAILED", "PAID")).toThrow();
  });
});
