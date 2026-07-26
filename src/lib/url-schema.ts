import { z } from "zod";

/**
 * What a URL or a playlist id is allowed to be, in one place.
 *
 * A bare URL validator accepts `javascript:` and `data:`, so the schemas said
 * "some URL" while those values went on to become a link target and an inline
 * style rule. Nothing else stands between the charts store and the document,
 * which is why the rule lives here rather than per field: two copies of it
 * drift, and the drift is silent. The serving schemas and the crawl's ingestion
 * schemas both read from here.
 */

/** A URL on the named host, over TLS. */
function httpsUrlOn(hostname: RegExp, subject: string) {
  return z.url({
    protocol: /^https$/,
    hostname,
    error: `must be an https ${subject} URL`,
  });
}

/**
 * Matches a domain and any subdomain, and nothing that merely ends in the same
 * letters: the leading group has to end in a dot, so `evilmzstatic.com` fails,
 * and the anchor closes the pattern, so `mzstatic.com.evil.test` fails too.
 */
function domainAndSubdomains(domain: string): RegExp {
  return new RegExp(`^([a-z0-9-]+\\.)*${domain.replace(/\./g, "\\.")}$`);
}

function exactly(host: string): RegExp {
  return new RegExp(`^${host.replace(/\./g, "\\.")}$`);
}

/**
 * A URL on any host, over TLS.
 *
 * For commentary citations, whose host cannot be pinned because the point of a
 * citation is to name an outside publication. Which publications count is a
 * separate judgement with its own module, and restating any part of it here
 * would create a second list to keep in step.
 */
export const CitationUrlSchema = z.url({
  protocol: /^https$/,
  error: "must be an https citation URL",
});

/** The page a listener opens to play a track. */
export const AppleStorefrontUrlSchema = httpsUrlOn(
  exactly("music.apple.com"),
  "storefront",
);

/**
 * Cover art, pinned to the image domain rather than to one host: the shard in an
 * artwork URL varies, so pinning one would refuse a healthy chart the day a run
 * met another. Also covers artwork whose dimensions are still placeholders,
 * which sit in the final path segment and so leave the host checkable.
 */
export const AppleArtworkUrlSchema = httpsUrlOn(
  domainAndSubdomains("mzstatic.com"),
  "artwork",
);

/**
 * An audio preview. Pinned to one host, unlike artwork: previews carry no shard,
 * so allowing subdomains here would buy nothing and accept a host the storefront
 * never serves from.
 */
export const ApplePreviewUrlSchema = httpsUrlOn(
  exactly("audio-ssl.itunes.apple.com"),
  "preview",
);

/** A deep link out to the other streaming service. */
export const SpotifyUrlSchema = httpsUrlOn(
  exactly("open.spotify.com"),
  "Spotify",
);

/**
 * What a playlist id may be.
 *
 * Not a URL, but fenced for the same reason: an id reaches the key the crawl
 * writes under, so an id carrying a separator reaches a key the write credential
 * should never touch. Pinned to the shape the storefront feed emits, and the one
 * rule holds on both sides, because the only ids a reader ever sees are the ones
 * the crawl wrote under it.
 */
export const PlaylistIdSchema = z
  .string()
  .regex(/^pl\.[0-9a-f]{32}$/, "must be a storefront playlist id");
