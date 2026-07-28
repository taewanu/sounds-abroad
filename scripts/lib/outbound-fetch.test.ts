import { expect, test } from "vitest";

import {
  guardedFetch,
  assertAllowedTarget,
  isForbiddenAddress,
  RefusedTargetError,
} from "./outbound-fetch";

// Expected values come from the address-range RFCs (1122, 1918, 3927, 4193,
// 4291), not from the classifier: each literal is a known member of its range.

test.each([
  ["127.0.0.1", "loopback"],
  ["127.255.255.254", "loopback, upper edge"],
  ["::1", "IPv6 loopback"],
  ["169.254.169.254", "link-local (cloud metadata)"],
  ["fe80::1", "IPv6 link-local"],
  ["10.0.0.1", "private 10/8"],
  ["172.16.0.1", "private 172.16/12, lower edge"],
  ["172.31.255.254", "private 172.16/12, upper edge"],
  ["192.168.1.1", "private 192.168/16"],
  ["fc00::1", "IPv6 unique-local"],
  ["fd12:3456::1", "IPv6 unique-local, fd half"],
  ["0.0.0.0", "unspecified"],
  ["::", "IPv6 unspecified"],
  ["::ffff:127.0.0.1", "IPv4-mapped loopback"],
  ["::ffff:10.0.0.1", "IPv4-mapped private"],
])("refuses %s (%s)", (address) => {
  expect(isForbiddenAddress(address)).toBe(true);
});

test.each([
  ["93.184.216.34", "public IPv4"],
  ["2606:2800:220:1:248:1893:25c8:1946", "public IPv6"],
  ["172.32.0.1", "just past 172.16/12"],
  ["172.15.255.254", "just before 172.16/12"],
  ["192.169.0.1", "just past 192.168/16"],
  ["11.0.0.1", "just past 10/8"],
  ["169.253.255.254", "just before link-local"],
  ["::ffff:93.184.216.34", "IPv4-mapped public"],
])("allows %s (%s)", (address) => {
  expect(isForbiddenAddress(address)).toBe(false);
});

test.each([
  ["http://example.com/page", "plain http"],
  ["javascript:alert(1)", "script scheme"],
  ["ftp://example.com/file", "ftp scheme"],
])("assertAllowedTarget refuses %s (%s) as a scheme violation", (url) => {
  expect(() => assertAllowedTarget(url)).toThrowError(RefusedTargetError);
  expect(() => assertAllowedTarget(url)).toThrowError(/scheme/);
});

test.each([
  ["https://10.0.0.5/admin", "literal private IPv4"],
  ["https://[::1]/", "literal IPv6 loopback"],
  ["https://169.254.169.254/latest/meta-data/", "literal metadata address"],
])("assertAllowedTarget refuses %s (%s) as an address violation", (url) => {
  expect(() => assertAllowedTarget(url)).toThrowError(RefusedTargetError);
  expect(() => assertAllowedTarget(url)).toThrowError(/address/);
});

test("assertAllowedTarget refuses a host outside the expected one", () => {
  const assertOnApple = () =>
    assertAllowedTarget("https://evil.test/playlist", {
      expectedHost: /^music\.apple\.com$/,
    });

  expect(assertOnApple).toThrowError(RefusedTargetError);
  expect(assertOnApple).toThrowError(/host/);
});

test("assertAllowedTarget refuses an unparsable target", () => {
  expect(() => assertAllowedTarget("not a url")).toThrowError(
    RefusedTargetError,
  );
});

test("assertAllowedTarget passes a public https target", () => {
  expect(() =>
    assertAllowedTarget("https://example.com/article"),
  ).not.toThrow();
});

test("assertAllowedTarget passes the expected host when pinned", () => {
  expect(() =>
    assertAllowedTarget("https://music.apple.com/kr/playlist/pl.123", {
      expectedHost: /^music\.apple\.com$/,
    }),
  ).not.toThrow();
});

function fetchAnswering(status: number, body = ""): typeof fetch {
  return async () => new Response(body, { status });
}

test("guardedFetch refuses a redirect instead of following it", async () => {
  const redirecting: typeof fetch = async () =>
    new Response(null, {
      status: 301,
      headers: { location: "https://elsewhere.test/" },
    });

  await expect(
    guardedFetch("https://example.com/moved", { fetchImpl: redirecting }),
  ).rejects.toThrowError(/redirect/);
});

test("guardedFetch refuses the target before any request goes out", async () => {
  let called = false;
  const recording: typeof fetch = async () => {
    called = true;
    return new Response("");
  };

  await expect(
    guardedFetch("http://example.com/", { fetchImpl: recording }),
  ).rejects.toThrowError(RefusedTargetError);
  expect(called).toBe(false);
});

test("guardedFetch returns the response of an allowed target", async () => {
  const res = await guardedFetch("https://example.com/ok", {
    fetchImpl: fetchAnswering(200, "body"),
  });

  expect(await res.text()).toBe("body");
});

test("guardedFetch rethrows a connect-time refusal out of a wrapped fetch failure", async () => {
  const refusal = new RefusedTargetError(
    "address",
    "host resolves to forbidden address ::1",
  );
  const failing: typeof fetch = async () => {
    throw new TypeError("fetch failed", { cause: refusal });
  };

  await expect(
    guardedFetch("https://example.com/", { fetchImpl: failing }),
  ).rejects.toBe(refusal);
});
