import type { Commentary } from "./chart-schema";

/**
 * Deterministic guard against reproducing song lyrics in commentary, the
 * programmatic backstop behind the human read-through (ADR-0007). Commentary is
 * prose ABOUT a song, never its words. The heuristics are tuned to flag rather
 * than miss: a cleared false positive costs a reviewer a glance, a reproduced
 * line that slips through is a licensing problem.
 */

export interface LyricRisk {
  rule: "quoted-span" | "verse-lines" | "repeated-line";
  excerpt: string;
}

// A quoted run this long reads as a reproduced line; titles and short phrases
// sit comfortably under it. Only straight/typographic DOUBLE quotes count —
// apostrophes ("don't", "the artist's") would otherwise pair up across prose.
const MAX_QUOTED_WORDS = 6;

// Several short lines in a row that never resolve into a sentence are
// verse-shaped; prose commentary runs in sentences that close with punctuation.
const MIN_VERSE_LINES = 3;
const VERSE_LINE_MAX_WORDS = 9;

// A whole line repeated is a chorus hallmark (and never how prose reads). Short
// enough to skip section labels, long enough to catch a hook.
const MIN_REPEATED_LINE_WORDS = 2;

function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

function endsASentence(line: string): boolean {
  return /[.!?]["”]?$/.test(line.trim());
}

function findQuotedSpans(text: string): LyricRisk[] {
  const risks: LyricRisk[] = [];
  const pattern = /["“]([^"“”\n]+)["”]/g;
  for (const match of text.matchAll(pattern)) {
    if (wordCount(match[1]) > MAX_QUOTED_WORDS) {
      risks.push({ rule: "quoted-span", excerpt: match[0] });
    }
  }
  return risks;
}

function findVerseRuns(lines: string[]): LyricRisk[] {
  let run: string[] = [];
  for (const line of lines) {
    const isVerse =
      line.trim() !== "" &&
      wordCount(line) <= VERSE_LINE_MAX_WORDS &&
      !endsASentence(line);
    if (isVerse) {
      run.push(line.trim());
    } else {
      if (run.length >= MIN_VERSE_LINES) {
        return [{ rule: "verse-lines", excerpt: run.join(" / ") }];
      }
      run = [];
    }
  }
  return run.length >= MIN_VERSE_LINES
    ? [{ rule: "verse-lines", excerpt: run.join(" / ") }]
    : [];
}

function findRepeatedLines(lines: string[]): LyricRisk[] {
  const seen = new Set<string>();
  for (const raw of lines) {
    const line = raw.trim().toLowerCase().replace(/\s+/g, " ");
    if (wordCount(line) < MIN_REPEATED_LINE_WORDS) continue;
    if (seen.has(line)) {
      return [{ rule: "repeated-line", excerpt: raw.trim() }];
    }
    seen.add(line);
  }
  return [];
}

/** Every lyric risk in a single block of text. */
export function findLyricRisks(text: string): LyricRisk[] {
  const lines = text.split("\n");
  return [
    ...findQuotedSpans(text),
    ...findVerseRuns(lines),
    ...findRepeatedLines(lines),
  ];
}

/** Every lyric risk across a commentary entry's human-authored fields. */
export function lintCommentary(entry: Commentary): LyricRisk[] {
  const fields = [entry.lead, entry.detail, entry.tag].filter(
    (f): f is string => typeof f === "string",
  );
  return fields.flatMap(findLyricRisks);
}
