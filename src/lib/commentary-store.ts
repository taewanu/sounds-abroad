import { z } from "zod";

import { CommentarySchema, type Commentary } from "./chart-schema";

/**
 * The out-of-band commentary store: a flat map from track key to one
 * human-curated blurb. Session-owned — the crawl reads it to bake into the
 * served charts but never writes it (ADR-0007).
 */
export const CommentaryStoreSchema = z.record(z.string(), CommentarySchema);

export type CommentaryStore = z.infer<typeof CommentaryStoreSchema>;

/** Commentary is English-only for now; the key carries the language so other
 * languages slot in later without re-keying the store. */
export const DEFAULT_LANG = "en";

/**
 * Folds away differences that don't change which track this is: surrounding and
 * repeated whitespace, case, and Unicode composition (so a title keys the same
 * whether its accents arrive composed or decomposed).
 */
export function normalizeForKey(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Identity of a charting track across countries: same artist + title yields the
 * same key, so a blurb is written once and reused everywhere the track charts.
 */
export function commentaryKey(
  lang: string,
  artist: string,
  name: string,
): string {
  return `${lang}:${normalizeForKey(artist)}|${normalizeForKey(name)}`;
}

/** The stored blurb for a track, or null when none is on file. */
export function commentaryForTrack(
  store: CommentaryStore,
  lang: string,
  artist: string,
  name: string,
): Commentary | null {
  return store[commentaryKey(lang, artist, name)] ?? null;
}
