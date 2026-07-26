import { expect, test } from "vitest";

import {
  AppleArtworkUrlSchema,
  ApplePreviewUrlSchema,
  AppleStorefrontUrlSchema,
  HttpsUrlSchema,
  PlaylistIdSchema,
  SpotifyUrlSchema,
} from "./url-schema";

// Each host-pinned schema paired with a URL valid for it apart from the axis
// under test, so a refusal proves that axis rather than the host.
const PINNED = [
  { schema: AppleStorefrontUrlSchema, host: "music.apple.com", path: "/kr/1" },
  {
    schema: AppleArtworkUrlSchema,
    host: "is1-ssl.mzstatic.com",
    path: "/a.jpg",
  },
  {
    schema: ApplePreviewUrlSchema,
    host: "audio-ssl.itunes.apple.com",
    path: "/a.m4a",
  },
  { schema: SpotifyUrlSchema, host: "open.spotify.com", path: "/track/1" },
] as const;

const SCRIPT_BEARING = [
  "javascript:alert(1)",
  "JavaScript:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "vbscript:msgbox(1)",
];

test.each(PINNED)("$host refuses a script-bearing scheme", ({ schema }) => {
  for (const url of SCRIPT_BEARING) {
    expect(schema.safeParse(url).success).toBe(false);
  }
});

test("an any-host URL refuses a script-bearing scheme too", () => {
  for (const url of SCRIPT_BEARING) {
    expect(HttpsUrlSchema.safeParse(url).success).toBe(false);
  }
});

// Transport and host are each proved by a pair rather than by reading zod's
// internals: the accepted URL and the refused one differ in one axis, so the
// refusal can only be that axis.
test.each(PINNED)(
  "$host is accepted over TLS and refused in plaintext",
  ({ schema, host, path }) => {
    expect(schema.safeParse(`https://${host}${path}`).success).toBe(true);
    expect(schema.safeParse(`http://${host}${path}`).success).toBe(false);
  },
);

test("an any-host URL is accepted over TLS and refused in plaintext", () => {
  expect(HttpsUrlSchema.safeParse("https://example.com/a").success).toBe(true);
  expect(HttpsUrlSchema.safeParse("http://example.com/a").success).toBe(false);
});

test.each(PINNED)(
  "$host refuses an unexpected host over the same transport",
  ({ schema, host, path }) => {
    expect(schema.safeParse(`https://${host}${path}`).success).toBe(true);
    expect(schema.safeParse(`https://example.com${path}`).success).toBe(false);
  },
);

test("artwork accepts any image shard, since the shard in a URL varies", () => {
  const shards = [
    "https://is1-ssl.mzstatic.com/image/thumb/a/b/600x600bb.jpg",
    "https://is5-ssl.mzstatic.com/image/thumb/a/b/600x600bb.jpg",
    "https://mzstatic.com/image/thumb/a/b/600x600bb.jpg",
  ];

  for (const url of shards) {
    expect(AppleArtworkUrlSchema.safeParse(url).success).toBe(true);
  }
});

// A suffix comparison that forgets the dot accepts `evilmzstatic.com`, and one
// that searches anywhere in the host accepts `mzstatic.com.evil.test`. Both read
// as the pinned domain to a careless check and neither is the storefront's.
test.each([
  "https://evilmzstatic.com/image/a.jpg",
  "https://mzstatic.com.evil.test/image/a.jpg",
  "https://notmzstatic.com/image/a.jpg",
])("artwork refuses the lookalike host %s", (url) => {
  expect(AppleArtworkUrlSchema.safeParse(url).success).toBe(false);
});

// The hosts that carry no subdomain in the published payload are pinned exactly,
// so a subdomain of one is refused rather than trusted by inheritance.
test.each([
  { schema: AppleStorefrontUrlSchema, url: "https://evil.music.apple.com/1" },
  { schema: SpotifyUrlSchema, url: "https://evil.open.spotify.com/track/1" },
])("$url is refused despite ending in a pinned host", ({ schema, url }) => {
  expect(schema.safeParse(url).success).toBe(false);
});

test("a citation accepts any host, because which sources are citable is decided elsewhere", () => {
  const citations = [
    "https://www.billboard.com/music/chart-beat/story",
    "https://pitchfork.com/reviews/albums/slug/",
  ];

  for (const url of citations) {
    expect(HttpsUrlSchema.safeParse(url).success).toBe(true);
  }
});

// The playlist page carries artwork with its dimensions still unfilled. The
// placeholders sit in the final path segment, so the host stays checkable, and
// one schema covers both forms.
test("artwork accepts a URL whose dimensions are still placeholders", () => {
  const template =
    "https://is1-ssl.mzstatic.com/image/thumb/Features/v4/a/b/c.png/{w}x{h}bb.{f}";

  expect(AppleArtworkUrlSchema.safeParse(template).success).toBe(true);
});

test("artwork refuses a placeholder-bearing URL on an unexpected host", () => {
  expect(
    AppleArtworkUrlSchema.safeParse("https://example.com/{w}x{h}bb.{f}")
      .success,
  ).toBe(false);
});

const PUBLISHED_ID = "pl.d838905f50af4200a2ebbc614922dee9";

test("a playlist id of the shape the feed emits is accepted", () => {
  expect(PlaylistIdSchema.safeParse(PUBLISHED_ID).success).toBe(true);
});

// What the unconstrained schema let through: anything non-empty, including a
// value that walks out of the prefix it is written under.
test.each([
  "../../commentary/v1/commentary",
  `${PUBLISHED_ID}/../../charts`,
  "pl./../charts",
  "pl%2F..%2Fcharts",
  "pl.D838905F50AF4200A2EBBC614922DEE9",
  "pl.tooshort",
  `${PUBLISHED_ID}a`,
  "pl.",
  "",
])("a playlist id of %j is refused", (id) => {
  expect(PlaylistIdSchema.safeParse(id).success).toBe(false);
});

test("a refusal names the expectation rather than repeating the rejected value", () => {
  const result = AppleArtworkUrlSchema.safeParse("javascript:alert(1)");

  expect(result.success).toBe(false);
  if (result.success) return;
  expect(result.error.issues[0].message).toBe("must be an https artwork URL");
});
