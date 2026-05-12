import { describe, expect, it } from "vitest";
import { createThrottle } from "./throttle.mjs";

function fakeClock() {
  let nowMs = 0;
  const sleeps: number[] = [];
  return {
    now: () => nowMs,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      nowMs += ms;
    },
    advance: (ms: number) => {
      nowMs += ms;
    },
    sleeps,
  };
}

describe("createThrottle", () => {
  it("does not sleep on the first call", async () => {
    const clock = fakeClock();
    const throttle = createThrottle({
      rpm: 20,
      now: clock.now,
      sleep: clock.sleep,
    });

    await throttle(async () => "first");

    expect(clock.sleeps).toEqual([]);
  });

  it("enforces min gap between consecutive calls", async () => {
    const clock = fakeClock();
    const throttle = createThrottle({
      rpm: 20,
      now: clock.now,
      sleep: clock.sleep,
    });

    await throttle(async () => "a");
    await throttle(async () => "b");

    expect(clock.sleeps).toEqual([3000]);
  });

  it("does not sleep when natural elapsed time already exceeds gap", async () => {
    const clock = fakeClock();
    const throttle = createThrottle({
      rpm: 20,
      now: clock.now,
      sleep: clock.sleep,
    });

    await throttle(async () => "a");
    clock.advance(5000);
    await throttle(async () => "b");

    expect(clock.sleeps).toEqual([]);
  });

  it("returns the wrapped fn's result", async () => {
    const throttle = createThrottle({
      rpm: 60,
      now: () => 0,
      sleep: async () => {},
    });

    const result = await throttle(async () => 42);

    expect(result).toBe(42);
  });

  it("propagates errors from the wrapped fn", async () => {
    const throttle = createThrottle({
      rpm: 60,
      now: () => 0,
      sleep: async () => {},
    });

    await expect(
      throttle(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });
});
