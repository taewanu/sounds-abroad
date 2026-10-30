import { afterEach, expect, test, vi } from "vitest";

import { startChartsRead } from "./start-charts-read";

const KEY = "__testRead";

afterEach(() => {
  delete (window as unknown as Record<string, unknown>)[KEY];
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("startChartsRead leaves its read on the window under the given key", () => {
  vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));

  const read = startChartsRead("/route", 1_000, KEY);

  expect((window as unknown as Record<string, unknown>)[KEY]).toBe(read);
});

test("startChartsRead aborts a response that has not started by the timeout", async () => {
  vi.useFakeTimers();
  const timeoutMs = 1_000;
  let signal: AbortSignal | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn((_route: string, init: RequestInit) => {
      signal = init.signal ?? undefined;
      return new Promise(() => {});
    }),
  );

  startChartsRead("/route", timeoutMs, KEY);
  await vi.advanceTimersByTimeAsync(timeoutMs);

  expect(signal?.aborted).toBe(true);
});

test("startChartsRead stops the timer once the response starts", async () => {
  vi.useFakeTimers();
  const timeoutMs = 1_000;
  let signal: AbortSignal | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn((_route: string, init: RequestInit) => {
      signal = init.signal ?? undefined;
      return Promise.resolve(new Response("{}"));
    }),
  );

  await startChartsRead("/route", timeoutMs, KEY);
  await vi.advanceTimersByTimeAsync(timeoutMs * 2);

  expect(signal?.aborted).toBe(false);
});

test("startChartsRead's source runs on its own, as the inlined script does", () => {
  vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));

  new Function(`(${startChartsRead.toString()})("/route", 1000, "${KEY}");`)();

  expect((window as unknown as Record<string, unknown>)[KEY]).toBeInstanceOf(
    Promise,
  );
});
