import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createThrottle } from "./throttle";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createThrottle", () => {
  it("runs the first call without scheduling any delay", async () => {
    const throttle = createThrottle();
    let resolved = false;
    const pending = throttle(async () => "first").then((v) => {
      resolved = true;
      return v;
    });

    await vi.advanceTimersByTimeAsync(0);

    expect(resolved).toBe(true);
    expect(await pending).toBe("first");
  });

  it("delays the second call by exactly 3000ms (Apple 20/min ceiling)", async () => {
    const throttle = createThrottle();
    await throttle(async () => "a");

    let resolved = false;
    const pending = throttle(async () => "b").then((v) => {
      resolved = true;
      return v;
    });

    await vi.advanceTimersByTimeAsync(2999);
    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(resolved).toBe(true);
    expect(await pending).toBe("b");
  });

  it("skips the delay when natural elapsed time already meets the gap", async () => {
    const throttle = createThrottle();
    await throttle(async () => "a");
    await vi.advanceTimersByTimeAsync(5000);

    let resolved = false;
    const pending = throttle(async () => "b").then((v) => {
      resolved = true;
      return v;
    });

    await vi.advanceTimersByTimeAsync(0);

    expect(resolved).toBe(true);
    expect(await pending).toBe("b");
  });

  it("passes the wrapped fn's resolved value through", async () => {
    const throttle = createThrottle();

    expect(await throttle(async () => 42)).toBe(42);
  });

  it("propagates errors thrown by the wrapped fn", async () => {
    const throttle = createThrottle();

    await expect(
      throttle(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });
});
