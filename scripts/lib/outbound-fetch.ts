import { lookup } from "node:dns";
import { isIP } from "node:net";

import { Agent, fetch as undiciFetch } from "undici";

/**
 * The shared guard for every outbound fetch that follows a target chosen
 * upstream (a feed entry, a model's citation). It refuses targets the pipeline
 * was never meant to touch: non-HTTPS schemes, and addresses inside the
 * machine's own network. The address check runs where the connection is made,
 * so the answer that passes the check is the answer that gets dialed.
 */

export type RefusedTargetReason = "scheme" | "host" | "address" | "redirect";

export class RefusedTargetError extends Error {
  constructor(
    public readonly reason: RefusedTargetReason,
    message: string,
  ) {
    super(message);
    this.name = "RefusedTargetError";
  }
}

export interface AllowedTargetOptions {
  expectedHost?: RegExp;
}

/**
 * Refuses a target URL the pipeline must not dial: anything but https, a host
 * outside the expected one when a site pins it, or a literal address inside a
 * forbidden range. Hostnames that merely resolve to a forbidden address pass
 * here and are refused where the connection is made.
 */
export function assertAllowedTarget(
  url: string,
  options: AllowedTargetOptions = {},
): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new RefusedTargetError("scheme", `not a URL: ${url}`);
  }

  if (parsed.protocol !== "https:") {
    throw new RefusedTargetError(
      "scheme",
      `refused non-https scheme ${parsed.protocol} in ${url}`,
    );
  }

  if (options.expectedHost && !options.expectedHost.test(parsed.hostname)) {
    throw new RefusedTargetError(
      "host",
      `refused unexpected host ${parsed.hostname}`,
    );
  }

  // A literal IP in the URL never goes through DNS, so the connect-time check
  // is not what catches it; refuse it here. Brackets wrap a literal IPv6 host.
  const bareHost = parsed.hostname.replace(/^\[|\]$/g, "");
  if (isIP(bareHost) !== 0 && isForbiddenAddress(bareHost)) {
    throw new RefusedTargetError(
      "address",
      `refused forbidden literal address ${bareHost}`,
    );
  }
}

/**
 * Unwraps an IPv4-mapped IPv6 address to its IPv4 form. Both spellings have to
 * be handled: a URL constructor rewrites the dotted `::ffff:127.0.0.1` into the
 * hex `::ffff:7f00:1`, so matching only the readable form would let the
 * rewritten one through.
 */
function unmapIpv4(address: string): string {
  const dotted = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (dotted) return dotted[1];

  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(address);
  if (!hex) return address;

  const high = Number.parseInt(hex[1], 16);
  const low = Number.parseInt(hex[2], 16);
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
}

/**
 * Whether an IP address (IPv4 dotted-quad or IPv6) is one this pipeline must
 * never connect to: loopback, link-local, private-use, or unspecified.
 */
export function isForbiddenAddress(address: string): boolean {
  const ip = unmapIpv4(address.trim().toLowerCase());

  if (isIP(ip) === 4) {
    const [first, second] = ip.split(".").map(Number);
    if (first === 0 || first === 10 || first === 127) return true;
    if (first === 169 && second === 254) return true;
    if (first === 172 && second >= 16 && second <= 31) return true;
    return first === 192 && second === 168;
  }

  if (ip === "::" || ip === "::1") return true;
  // fe80::/10 spans fe80-febf; fc00::/7 spans fc00-fdff.
  if (/^fe[89ab]/.test(ip)) return true;
  if (ip.startsWith("fc") || ip.startsWith("fd")) return true;

  // Two prefixes that wrap an IPv4 address rather than being one: ::/96, the
  // deprecated IPv4-compatible form, and 64:ff9b::/96, the NAT64 translation
  // prefix. Whether either reaches the wrapped address depends on the network
  // rather than on this code, and neither has any business in a citation or a
  // storefront link, so both are refused without inspecting what they wrap.
  return ip.startsWith("::") || ip.startsWith("64:ff9b:");
}

/**
 * The dispatcher every guarded fetch dials through. Its lookup hook vets the
 * very resolution the connection uses, so a name that re-resolves between a
 * check and the dial has nowhere to slip through (the rebinding gap a
 * check-then-fetch sequence would leave open).
 */
const guardingAgent = new Agent({
  connect: {
    lookup(hostname, options, callback) {
      lookup(hostname, { ...options, all: true }, (err, addresses) => {
        if (err) {
          callback(err, []);
          return;
        }
        const forbidden = addresses.find((candidate) =>
          isForbiddenAddress(candidate.address),
        );
        if (forbidden) {
          callback(
            new RefusedTargetError(
              "address",
              `${hostname} resolves to forbidden address ${forbidden.address}`,
            ),
            [],
          );
          return;
        }
        // The caller asked with all: true, so the callback carries the array
        // form regardless of what the original options requested.
        callback(null, addresses);
      });
    },
  },
});

export interface GuardedFetchOptions extends AllowedTargetOptions {
  fetchImpl?: typeof fetch;
}

/**
 * Fetch a target chosen upstream, refusing what assertAllowedTarget refuses,
 * plus redirects and hostnames resolving to a forbidden address. Redirects are
 * refused rather than followed because a redirect is the upstream choosing a
 * second target the guard never saw.
 */
export async function guardedFetch(
  url: string,
  options: GuardedFetchOptions = {},
): Promise<Response> {
  assertAllowedTarget(url, options);

  // undici's own fetch, not the global one: a dispatcher is only honoured by
  // the fetch of the undici build it came from, and the global fetch silently
  // belongs to the Node-bundled build.
  const doFetch =
    options.fetchImpl ??
    ((target: string, init: RequestInit) =>
      undiciFetch(target, {
        ...init,
        dispatcher: guardingAgent,
      } as Parameters<typeof undiciFetch>[1]) as unknown as Promise<Response>);

  let res: Response;
  try {
    res = await doFetch(url, { redirect: "manual" });
  } catch (err) {
    // A connect-time refusal surfaces as undici's generic "fetch failed" with
    // the real error in its cause; unwrap it so callers classify it as a
    // refusal rather than a network failure.
    const cause = err instanceof Error ? err.cause : undefined;
    if (cause instanceof RefusedTargetError) throw cause;
    throw err;
  }
  if (res.status >= 300 && res.status < 400) {
    throw new RefusedTargetError(
      "redirect",
      `refused redirect (${res.status}) from ${url}`,
    );
  }
  return res;
}
