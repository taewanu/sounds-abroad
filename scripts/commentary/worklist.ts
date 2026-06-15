import type { ChartFile } from "../../src/lib/chart-schema";
import {
  DEFAULT_LANG,
  commentaryKey,
  type CommentaryStore,
} from "../../src/lib/commentary-store";

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
  countries: { cc: string; rank: number }[];
}

export interface WorklistOptions {
  lang?: string;
  /** A climb of at least this many ranks counts as significant. */
  jumpBy?: number;
  /** Entering this rank or better counts as significant. */
  topDebutMax?: number;
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
  options?: WorklistOptions;
}): WorklistItem[] {
  const lang = input.options?.lang ?? DEFAULT_LANG;
  const jumpBy = input.options?.jumpBy ?? DEFAULT_JUMP_BY;
  const topDebutMax = input.options?.topDebutMax ?? DEFAULT_TOP_DEBUT_MAX;

  const current = aggregateByKey(input.current, lang);
  const previousBest = bestRankByKey(input.previous, lang);
  const hasHistory = input.previous !== null;

  const items: WorklistItem[] = [];
  for (const [key, agg] of current) {
    if (key in input.commentary) continue; // cache hit: never regenerate
    const reason = classify(
      agg.bestRank,
      previousBest.get(key),
      hasHistory,
      jumpBy,
      topDebutMax,
    );
    if (!reason) continue;
    items.push({
      key,
      artist: agg.artist,
      name: agg.name,
      bestRank: agg.bestRank,
      reason,
      countries: [...agg.countries].sort((a, b) => a.rank - b.rank),
    });
  }

  return items.sort(
    (a, b) => a.bestRank - b.bestRank || a.key.localeCompare(b.key),
  );
}
