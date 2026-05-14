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

  it("serializes concurrent calls — each reserves its slot synchronously", async () => {
    const throttle = createThrottle();
    // First call on a throttle doesn't wait. Use it here so the next two calls wait.
    await throttle(async () => "first");

    let secondDone = false;
    let thirdDone = false;
    const secondCall = throttle(async () => {
      secondDone = true;
      return "second";
    });
    const thirdCall = throttle(async () => {
      thirdDone = true;
      return "third";
    });

    await vi.advanceTimersByTimeAsync(2999);
    expect(secondDone).toBe(false);
    expect(thirdDone).toBe(false);

    await vi.advanceTimersByTimeAsync(1); // t = +3000
    expect(secondDone).toBe(true);
    expect(thirdDone).toBe(false);

    await vi.advanceTimersByTimeAsync(2999);
    expect(thirdDone).toBe(false);

    await vi.advanceTimersByTimeAsync(1); // t = +6000
    expect(thirdDone).toBe(true);

    expect(await secondCall).toBe("second");
    expect(await thirdCall).toBe("third");
  });
});
