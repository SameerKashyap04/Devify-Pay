import { describe, it, expect } from "vitest";
import {
  generateApiSecret,
  hashSecret,
  verifySecret,
  hmacSign,
  safeCompare,
  verifySignatureWithReplayProtection,
  generatePublicId,
} from "../src/index.js";

describe("api secrets", () => {
  it("generates env-prefixed secrets", () => {
    expect(generateApiSecret("test")).toMatch(/^sk_test_[a-f0-9]{48}$/);
    expect(generateApiSecret("live")).toMatch(/^sk_live_[a-f0-9]{48}$/);
  });

  it("hashes and verifies a secret", async () => {
    const secret = generateApiSecret("test");
    const hash = await hashSecret(secret);
    expect(hash).not.toBe(secret);
    expect(await verifySecret(hash, secret)).toBe(true);
    expect(await verifySecret(hash, "sk_test_wrong")).toBe(false);
  });
});

describe("public ids", () => {
  it("are prefixed and unique across calls", () => {
    const a = generatePublicId("ord");
    const b = generatePublicId("ord");
    expect(a.startsWith("ord_")).toBe(true);
    expect(a).not.toBe(b);
  });
});

describe("hmac signing", () => {
  it("produces a verifiable signature", () => {
    const sig = hmacSign("hello", "secret");
    expect(safeCompare(sig, hmacSign("hello", "secret"))).toBe(true);
    expect(safeCompare(sig, hmacSign("tampered", "secret"))).toBe(false);
  });

  it("rejects signatures outside the replay window", () => {
    const oldTimestamp = String(Math.floor(Date.now() / 1000) - 999);
    const body = JSON.stringify({ a: 1 });
    const signature = hmacSign(`${oldTimestamp}.${body}`, "secret");

    const result = verifySignatureWithReplayProtection({
      signature,
      timestamp: oldTimestamp,
      body,
      secret: "secret",
      toleranceSeconds: 300,
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("TIMESTAMP_OUT_OF_RANGE");
  });

  it("accepts a fresh, correctly signed request", () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({ a: 1 });
    const signature = hmacSign(`${timestamp}.${body}`, "secret");

    const result = verifySignatureWithReplayProtection({ signature, timestamp, body, secret: "secret" });
    expect(result.valid).toBe(true);
  });

  it("rejects a tampered body even with a valid timestamp", () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = hmacSign(`${timestamp}.${JSON.stringify({ a: 1 })}`, "secret");

    const result = verifySignatureWithReplayProtection({
      signature,
      timestamp,
      body: JSON.stringify({ a: 2 }),
      secret: "secret",
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("SIGNATURE_MISMATCH");
  });
});
