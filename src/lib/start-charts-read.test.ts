import { afterEach, expect, test, vi } from "vitest";

import { streamingFetch } from "./__fixtures__/streaming-fetch";
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

test("startChartsRead lets a body that keeps arriving outlast the timeout", async () => {
  vi.useFakeTimers();
  const timeoutMs = 1_000;
  const chunks = ["a", "b", "c", "d"];
  vi.stubGlobal(
    "fetch",
    streamingFetch(chunks, timeoutMs / 2, { closes: true }),
  );

  const text = startChartsRead("/route", timeoutMs, KEY).then((res) =>
    res.text(),
  );
  await vi.advanceTimersByTimeAsync(timeoutMs * chunks.length);

  await expect(text).resolves.toBe(chunks.join(""));
});

test("startChartsRead aborts a body that goes quiet for the timeout", async () => {
  vi.useFakeTimers();
  const timeoutMs = 1_000;
  vi.stubGlobal(
    "fetch",
    streamingFetch(["a"], timeoutMs / 2, { closes: false }),
  );

  const text = startChartsRead("/route", timeoutMs, KEY).then((res) =>
    res.text(),
  );
  const settled = expect(text).rejects.toThrow("aborted");
  await vi.advanceTimersByTimeAsync(timeoutMs * 2);

  await settled;
});

test("startChartsRead's source runs on its own, as the inlined script does", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("chart data")));

  new Function(`(${startChartsRead.toString()})("/route", 1_000, "${KEY}");`)();
  const read = (window as unknown as Record<string, Promise<Response>>)[KEY];

  await expect(read?.then((res) => res.text())).resolves.toBe("chart data");
});
