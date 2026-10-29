import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { triggerRevalidate } from "./revalidate-trigger";

const SITE_URL = "https://example.test";
const SECRET = "fixture-secret";

beforeEach(() => {
  process.env.SITE_URL = SITE_URL;
  process.env.REVALIDATE_SECRET = SECRET;
});

afterEach(() => {
  // Restoring here rather than in the one test that fakes timers: a test that
  // dies on vitest's timeout never resumes, so neither a trailing call nor a
  // `finally` runs, and the fake timers would outlive it. Verified — a probe
  // test placed after that one hangs on a plain setTimeout without this.
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete process.env.SITE_URL;
  delete process.env.REVALIDATE_SECRET;
});

test("throws when SITE_URL is missing", async () => {
  delete process.env.SITE_URL;

  await expect(triggerRevalidate()).rejects.toThrow(/SITE_URL/);
});

test("throws when REVALIDATE_SECRET is missing", async () => {
  delete process.env.REVALIDATE_SECRET;

  await expect(triggerRevalidate()).rejects.toThrow(/REVALIDATE_SECRET/);
});

test("issues the bearer POST without waiting on a timer", async () => {
  const fetchSpy = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(null, { status: 200 }));
  // Fake timers that nothing advances: a reintroduced delay never resolves, so
  // this times out rather than passing quietly. afterEach restores them.
  vi.useFakeTimers();

  await triggerRevalidate();

  expect(fetchSpy).toHaveBeenCalledTimes(1);
  expect(fetchSpy).toHaveBeenCalledWith(
    `${SITE_URL}/api/revalidate`,
    expect.objectContaining({
      method: "POST",
      headers: { Authorization: `Bearer ${SECRET}` },
      signal: expect.any(AbortSignal),
    }),
  );
});

test("fails fast without retrying when revalidate rejects the request", async () => {
  const fetchSpy = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      new Response(null, { status: 401, statusText: "Unauthorized" }),
    );
  const sleep = vi.fn(async () => {});

  await expect(triggerRevalidate(sleep)).rejects.toThrow(/401/);
  expect(fetchSpy).toHaveBeenCalledTimes(1);
  expect(sleep).not.toHaveBeenCalled();
});

test("retries a server error and succeeds on a later attempt", async () => {
  const fetchSpy = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(new Response(null, { status: 200 }));
  const sleep = vi.fn(async () => {});

  await triggerRevalidate(sleep);

  expect(fetchSpy).toHaveBeenCalledTimes(2);
  expect(sleep).toHaveBeenCalledTimes(1);
});

test("retries a network failure and throws once every attempt fails", async () => {
  const fetchSpy = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new TypeError("fetch failed"));
  const sleep = vi.fn(async () => {});

  await expect(triggerRevalidate(sleep)).rejects.toThrow(/fetch failed/);
  expect(fetchSpy).toHaveBeenCalledTimes(3);
  expect(sleep).toHaveBeenCalledTimes(2);
});
