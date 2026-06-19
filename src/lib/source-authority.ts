import type { Commentary } from "./chart-schema";

/**
 * Deterministic guard that every claim rests on authoritative sources, part of
 * the code-primary publish gate (ADR-0008). It judges where a blurb's sources
 * come from and how many there are, never what the blurb claims. Three rules
 * apply: a denylist of known-bad domains, a minimum source count, and a
 * requirement that at least one source sits on the authority allowlist.
 *
 * Sources are tiered by what they can vouch for. The authority allowlist is
 * journalism with editorial accountability: one such source, cited, vouches a
 * blurb for either claim tier. Chart and certification bodies are separate:
 * they certify a position or a metric ("debuted at #2"), never a narrative
 * cause, so they corroborate a blurb but never satisfy the authority rule
 * alone. A denylist alone cannot vouch credibility, only block known offenders;
 * the allowlist is what an automated drafting pass needs, since a model picking
 * sources has none of a human author's judgment about which outlets to trust.
 * Both lists grow from the source pass/fail log (ADR-0009) as drafting shows
 * which outlets it reaches for.
 */

export interface SourceViolation {
  rule:
    | "denied-source"
    | "too-few-sources"
    | "no-authoritative-source"
    | "chart-body-not-authoritative";
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

// Authority allowlist: journalism credible enough that one source, cited,
// vouches a blurb for either claim tier (model b, ADR-0008/0009). A blurb needs
// at least one source from this set; its other sources need only avoid the
// denylist. Grouped by region so non-English tracks are not starved under
// fail-closed-drop. Match is on registrable domain; a subdomain counts too.
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
  // Electronic / dance specialists.
  "residentadvisor.net",
  "mixmag.net",
  "djmag.com",
  "thelineofbestfit.com",
  // General press with established music desks.
  "theguardian.com",
  "npr.org",
  "bbc.com",
  "bbc.co.uk",
  // Industry trades.
  "musicbusinessworldwide.com",
  "pollstar.com",
  // East Asia.
  "soompi.com",
  "yna.co.kr",
  "joins.com",
  "koreaherald.com",
  "koreatimes.co.kr",
  "osen.co.kr",
  "chosun.com",
  "starnewskorea.com",
  "xportsnews.com",
  "newsen.com",
  "natalie.mu",
  "realsound.jp",
  "asahi.com",
  "mainichi.jp",
  "scmp.com",
  "sixthtone.com",
  // Southeast Asia.
  "bandwagon.asia",
  "billboardphilippines.com",
  "rappler.com",
  "inquirer.net",
  "philstar.com",
  "nylonmanila.com",
  "pophariini.com",
  "thestandard.co",
  "vietcetera.com",
  "fungjai.com",
  // South Asia.
  "rollingstoneindia.com",
  "thehindu.com",
  "hindustantimes.com",
  "filmcompanion.in",
  "bollywoodhungama.com",
  "dawn.com",
  // Latin America & Iberia.
  "remezcla.com",
  "indierocks.mx",
  "shock.co",
  "indiehoy.com",
  "rockaxis.com",
  "lanacion.com.ar",
  "jenesaispop.com",
  "mondosonoro.com",
  // Brazil / Lusophone.
  "tenhomaisdiscosqueamigos.com",
  "rollingstone.com.br",
  "folha.uol.com.br",
  "globo.com",
  // Francophone.
  "abcdrduson.com",
  "lesinrocks.com",
  "tsugi.fr",
  "lemonde.fr",
  "liberation.fr",
  "booska-p.com",
  "konbini.com",
  "mouv.fr",
  // MENA.
  "ma3azef.com",
  "scenenoise.com",
  "milleworld.com",
  // Sub-Saharan Africa.
  "okayafrica.com",
  "musicinafrica.net",
  "pulse.ng",
  "notjustok.com",
  "pulse.com.gh",
  "ghanamusic.com",
  "texxandthecity.com",
  "bubblegumclub.co.za",
]);

// Chart and certification bodies. They are authoritative for a position or a
// metric, never a cause, so a blurb may cite them as corroboration but cannot
// rest its authority on them alone. Not denied (they count toward the source
// floor); simply outside the authority allowlist. Match is on registrable
// domain; a subdomain counts too.
export const CHART_BODY_DOMAINS = new Set([
  "officialcharts.com",
  "oricon.co.jp",
  "billboard-japan.com",
  "circlechart.kr",
  "snepmusique.com",
  "turntablecharts.com",
  "los40.com",
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

/** Whether a domain is, or sits under, any member of a registrable-domain set. */
function matchesDomainSet(domain: string, set: Set<string>): boolean {
  if (set.has(domain)) return true;
  for (const member of set) {
    if (domain.endsWith(`.${member}`)) return true;
  }
  return false;
}

function isDenied(domain: string): boolean {
  return matchesDomainSet(domain, DENIED_DOMAINS);
}

function isAllowed(domain: string): boolean {
  return matchesDomainSet(domain, AUTHORITY_ALLOWLIST);
}

function isChartBody(domain: string): boolean {
  return matchesDomainSet(domain, CHART_BODY_DOMAINS);
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

  // Authority rule: a blurb needs at least one journalism source. A chart body
  // corroborates a rank, never a cause, so a chart-body-only blurb still fails
  // here, with a sharper reason than one that cited nothing credible at all.
  const hasJournalism = entry.sources.some((source) => {
    const domain = registrableDomain(source);
    return domain !== null && isAllowed(domain);
  });

  if (!hasJournalism) {
    const citedChartBody = entry.sources.some((source) => {
      const domain = registrableDomain(source);
      return domain !== null && isChartBody(domain);
    });

    violations.push(
      citedChartBody
        ? {
            rule: "chart-body-not-authoritative",
            source: "cited a chart body but no journalism source",
          }
        : {
            rule: "no-authoritative-source",
            source: `none of ${entry.sources.length} source(s) is on the authority allowlist`,
          },
    );
  }

  return violations;
}
