import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createThrottle } from "./throttle.mjs";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createThrottle", () => {
  it("does not delay the first call", async () => {
    const throttle = createThrottle(20);
    const t0 = Date.now();

    await throttle(async () => "first");

    expect(Date.now()).toBe(t0);
  });

  it("waits the min gap before the second call", async () => {
    const throttle = createThrottle(20);

    await throttle(async () => "a");
    const t1 = Date.now();

    const pending = throttle(async () => "b");
    await vi.advanceTimersByTimeAsync(3000);

    expect(await pending).toBe("b");
    expect(Date.now() - t1).toBe(3000);
  });

  it("does not delay when natural elapsed time already exceeds the gap", async () => {
    const throttle = createThrottle(20);

    await throttle(async () => "a");
    await vi.advanceTimersByTimeAsync(5000);
    const t1 = Date.now();

    await throttle(async () => "b");

    expect(Date.now()).toBe(t1);
  });

  it("returns the wrapped fn's resolved value", async () => {
    const throttle = createThrottle(60);

    expect(await throttle(async () => 42)).toBe(42);
  });

  it("propagates errors thrown by the wrapped fn", async () => {
    const throttle = createThrottle(60);

    await expect(
      throttle(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });
});
