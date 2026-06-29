import { expect, test } from "vitest";

import {
  buildSearchQueries,
  createSpotifyResolver,
  fetchSpotifyToken,
  resolveSpotifyUrl,
  SpotifyResolveError,
} from "./spotify-resolve";

function jsonFetch(response: {
  ok?: boolean;
  status?: number;
  body: unknown;
}): typeof fetch {
  const status = response.status ?? (response.ok === false ? 500 : 200);
  return (async () =>
    new Response(JSON.stringify(response.body), { status })) as typeof fetch;
}

const TOKEN_BODY = {
  access_token: "tok-123",
  token_type: "Bearer",
  expires_in: 3600,
};

function searchBody(spotifyUrl: string) {
  return { tracks: { items: [{ external_urls: { spotify: spotifyUrl } }] } };
}

test("buildSearchQueries tries the scoped query first, then free text", () => {
  expect(buildSearchQueries("REDRED", "코르티스")).toEqual([
    "track:REDRED artist:코르티스",
    "REDRED 코르티스",
  ]);
});

test("fetchSpotifyToken returns the access token and lifetime", async () => {
  const result = await fetchSpotifyToken("id", "secret", {
    fetch: jsonFetch({ body: TOKEN_BODY }),
  });

  expect(result.accessToken).toBe("tok-123");
  expect(result.expiresIn).toBe(3600);
});

test("fetchSpotifyToken POSTs client_credentials with Basic auth", async () => {
  const seen: { url: string; init?: RequestInit }[] = [];
  const spyFetch: typeof fetch = (async (url: string, init?: RequestInit) => {
    seen.push({ url, init });
    return new Response(JSON.stringify(TOKEN_BODY), { status: 200 });
  }) as typeof fetch;

  await fetchSpotifyToken("my-id", "my-secret", { fetch: spyFetch });

  expect(seen).toHaveLength(1);
  expect(seen[0].url).toBe("https://accounts.spotify.com/api/token");
  expect(seen[0].init?.method).toBe("POST");
  expect(seen[0].init?.body).toBe("grant_type=client_credentials");
  const auth = (seen[0].init?.headers as Record<string, string>).Authorization;
  const expected = `Basic ${Buffer.from("my-id:my-secret").toString("base64")}`;
  expect(auth).toBe(expected);
});

test("fetchSpotifyToken throws auth on non-OK status", async () => {
  await expect(
    fetchSpotifyToken("id", "secret", {
      fetch: jsonFetch({ ok: false, status: 400, body: {} }),
    }),
  ).rejects.toMatchObject({ name: "SpotifyResolveError", kind: "auth" });
});

test("fetchSpotifyToken throws shape on an unexpected payload", async () => {
  await expect(
    fetchSpotifyToken("id", "secret", {
      fetch: jsonFetch({ body: { token_type: "Bearer" } }),
    }),
  ).rejects.toMatchObject({ name: "SpotifyResolveError", kind: "shape" });
});

test("resolveSpotifyUrl returns the first hit's track URL", async () => {
  const url = "https://open.spotify.com/track/abc123";
  const result = await resolveSpotifyUrl("REDRED", "코르티스", "tok", {
    fetch: jsonFetch({ body: searchBody(url) }),
  });

  expect(result).toBe(url);
});

test("resolveSpotifyUrl hits the search endpoint with a scoped query and Bearer auth", async () => {
  const seen: { url: string; init?: RequestInit }[] = [];
  const spyFetch: typeof fetch = (async (url: string, init?: RequestInit) => {
    seen.push({ url, init });
    return new Response(
      JSON.stringify(searchBody("https://open.spotify.com/track/abc123")),
      { status: 200 },
    );
  }) as typeof fetch;

  await resolveSpotifyUrl("REDRED", "코르티스", "tok-xyz", { fetch: spyFetch });

  const url = new URL(seen[0].url);
  expect(url.origin + url.pathname).toBe("https://api.spotify.com/v1/search");
  expect(url.searchParams.get("q")).toBe("track:REDRED artist:코르티스");
  expect(url.searchParams.get("type")).toBe("track");
  expect(url.searchParams.get("limit")).toBe("1");
  const auth = (seen[0].init?.headers as Record<string, string>).Authorization;
  expect(auth).toBe("Bearer tok-xyz");
});

test("resolveSpotifyUrl falls back to the free-text query when the scoped one misses", async () => {
  const recovered = "https://open.spotify.com/track/recovered";
  const seen: string[] = [];
  const routingFetch: typeof fetch = (async (url: string) => {
    const q = new URL(url).searchParams.get("q") ?? "";
    seen.push(q);
    const body = q.startsWith("track:")
      ? { tracks: { items: [] } } // scoped pass misses
      : searchBody(recovered); // free-text pass hits
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;

  const result = await resolveSpotifyUrl("REDRED", "코르티스", "tok", {
    fetch: routingFetch,
  });

  expect(result).toBe(recovered);
  expect(seen).toEqual(["track:REDRED artist:코르티스", "REDRED 코르티스"]);
});

test("resolveSpotifyUrl throws miss when no query matches", async () => {
  await expect(
    resolveSpotifyUrl("x", "y", "tok", {
      fetch: jsonFetch({ body: { tracks: { items: [] } } }),
    }),
  ).rejects.toMatchObject({ name: "SpotifyResolveError", kind: "miss" });
});

test("resolveSpotifyUrl throws auth on 401", async () => {
  await expect(
    resolveSpotifyUrl("x", "y", "tok", {
      fetch: jsonFetch({ status: 401, body: {} }),
    }),
  ).rejects.toMatchObject({ name: "SpotifyResolveError", kind: "auth" });
});

test("resolveSpotifyUrl throws http on other non-OK status", async () => {
  await expect(
    resolveSpotifyUrl("x", "y", "tok", {
      fetch: jsonFetch({ status: 429, body: {} }),
    }),
  ).rejects.toMatchObject({ name: "SpotifyResolveError", kind: "http" });
});

test("resolveSpotifyUrl throws shape on an unexpected payload", async () => {
  await expect(
    resolveSpotifyUrl("x", "y", "tok", {
      fetch: jsonFetch({ body: { tracks: { items: [{ nope: true }] } } }),
    }),
  ).rejects.toMatchObject({ name: "SpotifyResolveError", kind: "shape" });
});

test("resolveSpotifyUrl throws network when fetch rejects", async () => {
  const failingFetch: typeof fetch = (async () => {
    throw new TypeError("boom");
  }) as typeof fetch;

  await expect(
    resolveSpotifyUrl("x", "y", "tok", { fetch: failingFetch }),
  ).rejects.toBeInstanceOf(SpotifyResolveError);
});

test("createSpotifyResolver fetches the token once and reuses it across calls", async () => {
  let tokenCalls = 0;
  const routingFetch: typeof fetch = (async (url: string) => {
    if (url === "https://accounts.spotify.com/api/token") {
      tokenCalls += 1;
      return new Response(JSON.stringify(TOKEN_BODY), { status: 200 });
    }
    return new Response(
      JSON.stringify(searchBody("https://open.spotify.com/track/abc123")),
      { status: 200 },
    );
  }) as typeof fetch;

  const resolve = createSpotifyResolver({
    clientId: "id",
    clientSecret: "secret",
    fetch: routingFetch,
    now: () => 0,
  });

  await resolve("a", "b");
  await resolve("c", "d");

  expect(tokenCalls).toBe(1);
});

test("createSpotifyResolver re-fetches the token and retries once on a cached-token 401", async () => {
  let tokenCalls = 0;
  let searchCalls = 0;
  const routingFetch: typeof fetch = (async (url: string) => {
    if (url === "https://accounts.spotify.com/api/token") {
      tokenCalls += 1;
      return new Response(JSON.stringify(TOKEN_BODY), { status: 200 });
    }
    searchCalls += 1;
    // First search 401s (token invalidated early); the retry succeeds.
    if (searchCalls === 1) return new Response("{}", { status: 401 });
    return new Response(
      JSON.stringify(searchBody("https://open.spotify.com/track/abc123")),
      { status: 200 },
    );
  }) as typeof fetch;

  const resolve = createSpotifyResolver({
    clientId: "id",
    clientSecret: "secret",
    fetch: routingFetch,
    now: () => 0,
  });

  const result = await resolve("a", "b");

  expect(result).toBe("https://open.spotify.com/track/abc123");
  expect(tokenCalls).toBe(2); // initial + forced refresh after the 401
});

test("createSpotifyResolver propagates a second consecutive auth failure", async () => {
  const routingFetch: typeof fetch = (async (url: string) => {
    if (url === "https://accounts.spotify.com/api/token") {
      return new Response(JSON.stringify(TOKEN_BODY), { status: 200 });
    }
    return new Response("{}", { status: 401 });
  }) as typeof fetch;

  const resolve = createSpotifyResolver({
    clientId: "id",
    clientSecret: "secret",
    fetch: routingFetch,
    now: () => 0,
  });

  await expect(resolve("a", "b")).rejects.toMatchObject({
    name: "SpotifyResolveError",
    kind: "auth",
  });
});

test("createSpotifyResolver refreshes the token after it nears expiry", async () => {
  let tokenCalls = 0;
  const routingFetch: typeof fetch = (async (url: string) => {
    if (url === "https://accounts.spotify.com/api/token") {
      tokenCalls += 1;
      return new Response(JSON.stringify(TOKEN_BODY), { status: 200 });
    }
    return new Response(
      JSON.stringify(searchBody("https://open.spotify.com/track/abc123")),
      { status: 200 },
    );
  }) as typeof fetch;

  let clock = 0;
  const resolve = createSpotifyResolver({
    clientId: "id",
    clientSecret: "secret",
    fetch: routingFetch,
    now: () => clock,
    refreshSkewMs: 60_000,
  });

  await resolve("a", "b");
  // Advance past (lifetime - skew): 3600s - 60s = 3540s.
  clock = 3_541_000;
  await resolve("c", "d");

  expect(tokenCalls).toBe(2);
});
