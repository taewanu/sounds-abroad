import { expect, test, vi } from "vitest";

import {
  ItunesLookupError,
  type ItunesLookupErrorKind,
  type LookupResult,
} from "./itunes-lookup";
import { withLookupRetry } from "./lookup-retry";

function lookupError(kind: ItunesLookupErrorKind): ItunesLookupError {
  return new ItunesLookupError("1", "kr", kind, kind);
}

function resolved(id: string): LookupResult {
  return { id, previewUrl: `https://preview/${id}.m4a` };
}

test("withLookupRetry resolves the first success without sleeping", async () => {
  const lookup = vi.fn<(id: string, cc: string) => Promise<LookupResult>>(
    async (id) => resolved(id),
  );
  const sleep = vi.fn(async () => {});

  const result = await withLookupRetry(lookup, { sleep })("1", "kr");

  expect(result).toEqual(resolved("1"));
  expect(lookup).toHaveBeenCalledTimes(1);
  expect(sleep).not.toHaveBeenCalled();
});

test.each(["network", "http"] as const)(
  "withLookupRetry retries the transient %s failure and returns the eventual success",
  async (kind) => {
    const lookup = vi
      .fn<(id: string, cc: string) => Promise<LookupResult>>()
      .mockRejectedValueOnce(lookupError(kind))
      .mockResolvedValueOnce(resolved("1"));
    const sleep = vi.fn(async () => {});

    const result = await withLookupRetry(lookup, { sleep })("1", "kr");

    expect(result).toEqual(resolved("1"));
    expect(lookup).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  },
);

test.each(["miss", "shape", "json"] as const)(
  "withLookupRetry does not retry the non-transient %s failure",
  async (kind) => {
    const error = lookupError(kind);
    const lookup = vi
      .fn<(id: string, cc: string) => Promise<LookupResult>>()
      .mockRejectedValue(error);
    const sleep = vi.fn(async () => {});

    const promise = withLookupRetry(lookup, { sleep })("1", "kr");

    await expect(promise).rejects.toBe(error);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  },
);

test("withLookupRetry throws the transient error after exhausting every attempt", async () => {
  const error = lookupError("http");
  const lookup = vi
    .fn<(id: string, cc: string) => Promise<LookupResult>>()
    .mockRejectedValue(error);
  const sleep = vi.fn(async () => {});

  const promise = withLookupRetry(lookup, { sleep, retries: 2 })("1", "kr");

  await expect(promise).rejects.toBe(error);
  expect(lookup).toHaveBeenCalledTimes(3);
  expect(sleep).toHaveBeenCalledTimes(2);
});
