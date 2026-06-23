import type { ChartFile } from "../../src/lib/chart-schema";
import {
  DEFAULT_LANG,
  commentaryKey,
  type CommentaryStore,
} from "../../src/lib/commentary-store";
import { COUNTRIES, type Region } from "../../src/lib/countries";

import { DEFAULT_MAX_ATTEMPTS, type DropsStore } from "./drops";

/**
 * The worklist for a refinement pass: which charting tracks still need a blurb.
 * A track qualifies only if its movement is significant AND no blurb exists yet,
 * so a pass surfaces a tractable, deduped list instead of every charting track
 * (ADR-0007's quantitative gate, an analog to a significance trigger).
 */

export type WorklistReason = "new-entry" | "rank-jump" | "top-debut";

export interface WorklistItem {
  key: string;
  artist: string;
  name: string;
  bestRank: number;
  reason: WorklistReason;
  confidence: ConfidenceLevel;
  countries: { cc: string; rank: number }[];
}

export interface WorklistOptions {
  lang?: string;
  /** A climb of at least this many ranks counts as significant. */
  jumpBy?: number;
  /** Entering this rank or better counts as significant. */
  topDebutMax?: number;
  /**
   * Drop low-confidence positions entirely instead of down-ranking them. Default
   * false: they stay on the list but sort after every confident item, so a pass
   * spends effort on solid stories first and reaches thin-market noise last.
   */
  suppressLowConfidence?: boolean;
  /**
   * Re-attempts a gate-dropped track gets before it falls off the list. Defaults
   * to DEFAULT_MAX_ATTEMPTS so a track that keeps dropping stops re-spending a
   * drafter call every batch.
   */
  maxAttempts?: number;
}

const DEFAULT_JUMP_BY = 10;
const DEFAULT_TOP_DEBUT_MAX = 10;

interface Aggregate {
  artist: string;
  name: string;
  bestRank: number;
  countries: { cc: string; rank: number }[];
}

function aggregateByKey(
  chart: ChartFile,
  lang: string,
): Map<string, Aggregate> {
  const byKey = new Map<string, Aggregate>();
  for (const [cc, country] of Object.entries(chart.countries)) {
    if (!country.valid) continue;
    for (const track of country.tracks) {
      const key = commentaryKey(lang, track.artist, track.name);
      const existing = byKey.get(key);
      if (existing) {
        existing.countries.push({ cc, rank: track.rank });
        existing.bestRank = Math.min(existing.bestRank, track.rank);
      } else {
        byKey.set(key, {
          artist: track.artist,
          name: track.name,
          bestRank: track.rank,
          countries: [{ cc, rank: track.rank }],
        });
      }
    }
  }
  return byKey;
}

/**
 * Whether a track's chart footprint is solid enough to be worth writing about,
 * orthogonal to how far it moved. The artifact this guards against: an album
 * deep cut sitting near the top of one or two small storefronts and nowhere
 * else, with no broad reach. Such a position is most likely a thin-market quirk,
 * not a real story.
 *
 * Confidence is "ok" only on genuine breadth, since we hold no artist-home-market
 * data and, by default, no day-over-day volatility. Two signals stand in for it:
 *   1. cross-region reach: charting in 2+ distinct regions (a hit spilling past
 *      its home region), or
 *   2. a broad same-region footprint: 3+ distinct countries even within one
 *      region (sustained regional reach, not a one-off storefront).
 * Anything thinner is "low": a lone storefront, or two storefronts that share a
 * region (adjacent markets alone don't separate a real regional hit from a
 * thin-market quirk). Adjacency is necessary but not sufficient; breadth is.
 */
export type ConfidenceLevel = "low" | "ok";

const BROAD_FOOTPRINT_MIN = 3;

const REGION_BY_CC = new Map<string, Region>(
  COUNTRIES.map((c) => [c.code, c.region]),
);

export function chartConfidence(
  countries: readonly { cc: string }[],
): ConfidenceLevel {
  const distinctCountries = new Set(countries.map((c) => c.cc));
  const distinctRegions = new Set<Region>();
  for (const cc of distinctCountries) {
    const region = REGION_BY_CC.get(cc);
    if (region) distinctRegions.add(region);
  }

  // Spilled past one region: a hit, not a single-market quirk.
  if (distinctRegions.size > 1) return "ok";

  // Broad reach within a single region still reads as a real story.
  if (distinctCountries.size >= BROAD_FOOTPRINT_MIN) return "ok";

  // A lone storefront, or a same-region pair: too thin to trust.
  return "low";
}

function bestRankByKey(
  chart: ChartFile | null,
  lang: string,
): Map<string, number> {
  const best = new Map<string, number>();
  if (!chart) return best;
  for (const country of Object.values(chart.countries)) {
    if (!country.valid) continue;
    for (const track of country.tracks) {
      const key = commentaryKey(lang, track.artist, track.name);
      const prev = best.get(key);
      if (prev === undefined || track.rank < prev) best.set(key, track.rank);
    }
  }
  return best;
}

function classify(
  cur: number,
  prev: number | undefined,
  hasHistory: boolean,
  jumpBy: number,
  topDebutMax: number,
): WorklistReason | null {
  if (!hasHistory) {
    // No prior snapshot to diff against (e.g. a first pass): fall back to
    // absolute prominence so the list stays tractable instead of surfacing the
    // whole long tail.
    return cur <= topDebutMax ? "top-debut" : null;
  }
  if (prev === undefined) return "new-entry";
  if (prev - cur >= jumpBy) return "rank-jump";
  if (cur <= topDebutMax && prev > topDebutMax) return "top-debut";
  return null;
}

export function computeWorklist(input: {
  current: ChartFile;
  previous: ChartFile | null;
  commentary: CommentaryStore;
  /** Per-key record of prior gate drops; tracks at the attempt budget are skipped. */
  drops?: DropsStore;
  options?: WorklistOptions;
}): WorklistItem[] {
  const lang = input.options?.lang ?? DEFAULT_LANG;
  const jumpBy = input.options?.jumpBy ?? DEFAULT_JUMP_BY;
  const topDebutMax = input.options?.topDebutMax ?? DEFAULT_TOP_DEBUT_MAX;
  const suppressLowConfidence = input.options?.suppressLowConfidence ?? false;
  const maxAttempts = input.options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const drops = input.drops ?? {};

  const current = aggregateByKey(input.current, lang);
  const previousBest = bestRankByKey(input.previous, lang);
  const hasHistory = input.previous !== null;

  const items: WorklistItem[] = [];
  for (const [key, agg] of current) {
    if (key in input.commentary) continue; // cache hit: never regenerate
    if ((drops[key]?.attempts ?? 0) >= maxAttempts) continue; // tombstoned: retries spent
    const reason = classify(
      agg.bestRank,
      previousBest.get(key),
      hasHistory,
      jumpBy,
      topDebutMax,
    );
    if (!reason) continue;
    const confidence = chartConfidence(agg.countries);
    if (confidence === "low" && suppressLowConfidence) continue;
    items.push({
      key,
      artist: agg.artist,
      name: agg.name,
      bestRank: agg.bestRank,
      reason,
      confidence,
      countries: [...agg.countries].sort((a, b) => a.rank - b.rank),
    });
  }

  // Confident items first so a pass spends effort on them before any retained
  // low-confidence ones; within a tier, by best rank then key for stability.
  const confidenceWeight = (c: ConfidenceLevel) => (c === "low" ? 1 : 0);
  return items.sort(
    (a, b) =>
      confidenceWeight(a.confidence) - confidenceWeight(b.confidence) ||
      a.bestRank - b.bestRank ||
      a.key.localeCompare(b.key),
  );
}
