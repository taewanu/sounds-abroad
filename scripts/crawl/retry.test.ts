import { expect, test, vi } from "vitest";

import { withRetry, type RetryOptions } from "./retry";

function makeOptions(overrides: Partial<RetryOptions> = {}): RetryOptions {
  return {
    retries: 2,
    backoffMs: 10,
    sleep: vi.fn(async () => {}),
    ...overrides,
  };
}

test("withRetry returns the first result without sleeping when fn succeeds", async () => {
  const fn = vi.fn(async () => "ok");
  const options = makeOptions();

  const result = await withRetry(fn, options);

  expect(result).toBe("ok");
  expect(fn).toHaveBeenCalledTimes(1);
  expect(options.sleep).not.toHaveBeenCalled();
});

test("withRetry retries a transient failure and returns the eventual success", async () => {
  const fn = vi
    .fn<() => Promise<string>>()
    .mockRejectedValueOnce(new Error("transient"))
    .mockResolvedValueOnce("ok");
  const options = makeOptions();

  const result = await withRetry(fn, options);

  expect(result).toBe("ok");
  expect(fn).toHaveBeenCalledTimes(2);
  expect(options.sleep).toHaveBeenCalledTimes(1);
});

test("withRetry throws the last error after exhausting every attempt", async () => {
  const lastError = new Error("attempt 3");
  const fn = vi
    .fn<() => Promise<string>>()
    .mockRejectedValueOnce(new Error("attempt 1"))
    .mockRejectedValueOnce(new Error("attempt 2"))
    .mockRejectedValueOnce(lastError);
  const options = makeOptions({ retries: 2 });

  const promise = withRetry(fn, options);

  await expect(promise).rejects.toBe(lastError);
  expect(fn).toHaveBeenCalledTimes(3);
  expect(options.sleep).toHaveBeenCalledTimes(2);
});

test("withRetry does not retry when shouldRetry rejects the error", async () => {
  const permanent = new Error("permanent");
  const fn = vi.fn<() => Promise<string>>().mockRejectedValue(permanent);
  const options = makeOptions({ shouldRetry: () => false });

  const promise = withRetry(fn, options);

  await expect(promise).rejects.toBe(permanent);
  expect(fn).toHaveBeenCalledTimes(1);
  expect(options.sleep).not.toHaveBeenCalled();
});

test("withRetry backs off exponentially from backoffMs between attempts", async () => {
  const fn = vi
    .fn<() => Promise<string>>()
    .mockRejectedValueOnce(new Error("1"))
    .mockRejectedValueOnce(new Error("2"))
    .mockResolvedValueOnce("ok");
  const sleep = vi.fn(async () => {});
  const options = makeOptions({ retries: 2, backoffMs: 100, sleep });

  await withRetry(fn, options);

  expect(sleep).toHaveBeenNthCalledWith(1, 100);
  expect(sleep).toHaveBeenNthCalledWith(2, 200);
});
