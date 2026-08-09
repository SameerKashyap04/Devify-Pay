import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { nextRetryDelaySeconds, getRetrySchedule } from "../src/index.js";

describe("webhook retry schedule", () => {
  const original = process.env.WEBHOOK_RETRY_SCHEDULE_SECONDS;

  beforeEach(() => {
    delete process.env.WEBHOOK_RETRY_SCHEDULE_SECONDS;
  });
  afterEach(() => {
    if (original) process.env.WEBHOOK_RETRY_SCHEDULE_SECONDS = original;
  });

  it("uses the documented default schedule", () => {
    expect(getRetrySchedule()).toEqual([0, 30, 120, 600, 1800, 7200]);
  });

  it("returns the next delay for each attempt", () => {
    expect(nextRetryDelaySeconds(0)).toBe(0);
    expect(nextRetryDelaySeconds(1)).toBe(30);
    expect(nextRetryDelaySeconds(5)).toBe(7200);
  });

  it("returns null once the schedule is exhausted", () => {
    expect(nextRetryDelaySeconds(6)).toBeNull();
    expect(nextRetryDelaySeconds(100)).toBeNull();
  });

  it("respects a custom schedule from env", () => {
    process.env.WEBHOOK_RETRY_SCHEDULE_SECONDS = "5,10";
    expect(getRetrySchedule()).toEqual([5, 10]);
    expect(nextRetryDelaySeconds(0)).toBe(5);
    expect(nextRetryDelaySeconds(2)).toBeNull();
  });
});
