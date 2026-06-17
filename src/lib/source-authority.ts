import type { Commentary } from "./chart-schema";

/**
 * Deterministic guard that every claim rests on authoritative sources, part of
 * the code-primary publish gate (ADR-0008). It is tier-independent: it judges
 * where a blurb's sources come from and how many there are, never what the
 * blurb claims. The playbook's source-authority policy is codified here so a
 * denylisted source or a thin source set hard-blocks publish in code, not by a
 * reviewer remembering the policy.
 */

export interface SourceViolation {
  rule: "denied-source" | "too-few-sources";
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

  return violations;
}
