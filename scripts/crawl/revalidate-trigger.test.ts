import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { triggerRevalidate } from "./revalidate-trigger";

const SITE_URL = "https://example.test";
const SECRET = "fixture-secret";

beforeEach(() => {
  process.env.SITE_URL = SITE_URL;
  process.env.REVALIDATE_SECRET = SECRET;
});

afterEach(() => {
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
  // Fake timers with nothing advancing them: a reintroduced delay would hang
  // rather than pass, so this fails loudly if the wait comes back.
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

  vi.useRealTimers();
});

test("throws with status code when revalidate responds non-2xx", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(null, { status: 401, statusText: "Unauthorized" }),
  );

  await expect(triggerRevalidate()).rejects.toThrow(/401/);
});
