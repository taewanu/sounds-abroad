import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { triggerRevalidate } from "./revalidate-trigger";

const SITE_URL = "https://example.test";
const SECRET = "fixture-secret";
const PROPAGATION_MS = 120_000;

beforeEach(() => {
  vi.useFakeTimers();
  process.env.SITE_URL = SITE_URL;
  process.env.REVALIDATE_SECRET = SECRET;
});

afterEach(() => {
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

test("waits PROPAGATION_MS before issuing the bearer POST", async () => {
  const fetchSpy = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(null, { status: 200 }));

  const pending = triggerRevalidate();
  expect(fetchSpy).not.toHaveBeenCalled();

  await vi.advanceTimersByTimeAsync(PROPAGATION_MS - 1);
  expect(fetchSpy).not.toHaveBeenCalled();

  await vi.advanceTimersByTimeAsync(1);
  await pending;

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

test("throws with status code when revalidate responds non-2xx", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(null, { status: 401, statusText: "Unauthorized" }),
  );

  // Attach the rejection assertion before driving timers so the rejection is
  // observed synchronously — otherwise Node flags it as unhandled.
  const assertion = expect(triggerRevalidate()).rejects.toThrow(/401/);
  await vi.advanceTimersByTimeAsync(PROPAGATION_MS);
  await assertion;
});
