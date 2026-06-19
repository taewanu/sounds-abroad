import type { Commentary } from "./chart-schema";

/**
 * Deterministic guard that every claim rests on authoritative sources, part of
 * the code-primary publish gate (ADR-0008). It is tier-independent: it judges
 * where a blurb's sources come from and how many there are, never what the
 * blurb claims. The playbook's source-authority policy is codified here so an
 * under-sourced blurb hard-blocks publish in code, not by a reviewer
 * remembering the policy. Three rules apply: a denylist of known-bad domains,
 * a minimum source count, and (model b, ADR-0008/0009) a requirement that at
 * least one source sits on a curated authority allowlist. A denylist alone
 * cannot vouch for credibility, only block known offenders; the allowlist is
 * what an automated drafting pass needs, since a model picking sources has none
 * of a human author's judgment about which outlets are trustworthy.
 */

export interface SourceViolation {
  rule: "denied-source" | "too-few-sources" | "no-authoritative-source";
  source: string;
}

// Two credible sources is the floor for a grounded blurb (playbook source
// policy); below it, stay conservative or write nothing.
const MIN_SOURCES = 2;

// Registrable domains we never source a claim from. Lyrics sites reproduce the
// words we license around; fan wikis and gossip/SEO farms are unreliable. The
// match is on registrable domain, so any subdomain (lyrics.example) is covered.
const DENIED_DOMAINS = new Set([
  // Lyrics sites: pure lyrics, no editorial context to ground a claim on.
  // (Genius is deliberately absent: its credits and annotations can ground a
  // claim, and its lyric-reproduction risk is caught by the no-lyric lint.)
  "azlyrics.com",
  "metrolyrics.com",
  "lyrics.com",
  "musixmatch.com",
  // Fan wikis: community-edited, not authoritative.
  "fandom.com",
  "wikia.com",
  // Gossip / SEO content farms.
  "tmz.com",
  "popsugar.com",
]);

// Curated authority allowlist: outlets credible enough that one of them, cited,
// vouches for a blurb (model b, ADR-0008/0009 "one top-tier source can stand in
// for corroboration"). A blurb needs at least one source from this set; its
// other sources need only avoid the denylist. Starts with global music
// journalism, the major chart bodies, and a few strong regional outlets so
// non-English tracks are not starved. It grows from the source pass/fail log
// (ADR-0009) as the drafting pass shows which credible outlets it reaches for.
export const AUTHORITY_ALLOWLIST = new Set([
  // Global music journalism.
  "billboard.com",
  "pitchfork.com",
  "rollingstone.com",
  "nme.com",
  "stereogum.com",
  "consequence.net",
  "spin.com",
  "thefader.com",
  "complex.com",
  "xxlmag.com",
  "vulture.com",
  "variety.com",
  // General press with established music desks.
  "theguardian.com",
  "npr.org",
  "bbc.com",
  "bbc.co.uk",
  // Industry trades and chart bodies.
  "musicbusinessworldwide.com",
  "officialcharts.com",
  "pollstar.com",
  // Regional outlets, so non-English tracks can clear the bar.
  "soompi.com",
  "remezcla.com",
]);

/**
 * The registrable domain of a URL: host minus any leading "www." and lowered.
 * A bare two-label domain ("example.com") is returned as-is; this is a
 * pragmatic match, not a full public-suffix resolution.
 */
function registrableDomain(url: string): string | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  return host.replace(/^www\./, "");
}

function isDenied(domain: string): boolean {
  if (DENIED_DOMAINS.has(domain)) return true;
  // A subdomain of a denied domain is denied too (lyrics.example.com under
  // example.com), matched on the registrable-domain suffix.
  for (const denied of DENIED_DOMAINS) {
    if (domain.endsWith(`.${denied}`)) return true;
  }
  return false;
}

function isAllowed(domain: string): boolean {
  if (AUTHORITY_ALLOWLIST.has(domain)) return true;
  // A subdomain of an allowlisted outlet counts too (music.theguardian.com).
  for (const allowed of AUTHORITY_ALLOWLIST) {
    if (domain.endsWith(`.${allowed}`)) return true;
  }
  return false;
}

/** Every source-authority violation across a commentary entry's sources. */
export function findSourceViolations(entry: Commentary): SourceViolation[] {
  const violations: SourceViolation[] = [];

  for (const source of entry.sources) {
    const domain = registrableDomain(source);
    if (domain !== null && isDenied(domain)) {
      violations.push({ rule: "denied-source", source });
    }
  }

  if (entry.sources.length < MIN_SOURCES) {
    violations.push({
      rule: "too-few-sources",
      source: `${entry.sources.length} of ${MIN_SOURCES} required`,
    });
  }

  const hasAuthority = entry.sources.some((source) => {
    const domain = registrableDomain(source);
    return domain !== null && isAllowed(domain);
  });
  if (!hasAuthority) {
    violations.push({
      rule: "no-authoritative-source",
      source: `none of ${entry.sources.length} source(s) is on the authority allowlist`,
    });
  }

  return violations;
}
