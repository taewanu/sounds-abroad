import { expect, test, vi } from "vitest";

// The connect-time address check lives in the dispatcher's lookup hook, which
// the injectable fetch seam bypasses. Faking resolution is what reaches it
// without a network: a name is answered with an address of our choosing, and
// the assertion is on whether the connection is refused before it is dialed.
function fakeLookup(
  hostname: string,
  _options: unknown,
  callback: (
    err: NodeJS.ErrnoException | null,
    addresses: Array<{ address: string; family: number }>,
  ) => void,
) {
  const address = hostname === "private.test" ? "10.0.0.5" : "93.184.216.34";
  callback(null, [{ address, family: 4 }]);
}

vi.mock("node:dns", () => ({
  lookup: fakeLookup,
  default: { lookup: fakeLookup },
}));

const { guardedFetch, RefusedTargetError } = await import("./outbound-fetch");

test("a host resolving to a private address is refused at connect time", async () => {
  await expect(guardedFetch("https://private.test/")).rejects.toBeInstanceOf(
    RefusedTargetError,
  );
  await expect(guardedFetch("https://private.test/")).rejects.toThrowError(
    /resolves to forbidden address 10\.0\.0\.5/,
  );
});
