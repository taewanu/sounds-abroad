"use client";

import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import { SONGS_CHART, type ChartRef } from "@/lib/chart-ref";
import type { Playlist } from "@/lib/chart-schema";

export const SONGS_CHART_LABEL = "Top Songs";

// How far each key moves focus along the rail. Home and End are absolute rather
// than a step, so they are named instead of numbered.
const KEY_STEP: Record<string, number | "first" | "last" | undefined> = {
  ArrowRight: 1,
  ArrowLeft: -1,
  Home: "first",
  End: "last",
};

export interface ChartRailProps {
  /** The country's playlists, in the order the crawl received them. */
  playlists: readonly Playlist[];
  /** The chart on screen. */
  current: ChartRef;
  /** The chart asked for, while its track list is still in flight. */
  pending: ChartRef | null;
  /** Charts whose track list would not load. */
  failed: ReadonlySet<ChartRef>;
  onOpen: (ref: ChartRef) => void;
}

/**
 * The country's charts, as peers.
 *
 * Renders from the metadata already in the payload, so seeing what a country
 * offers costs no fetch; only opening one does (ADR-0016). The songs chart is
 * pinned first as the default rather than as a parent, and the playlists follow
 * in the order the storefront ranks them (ADR-0017).
 *
 * Labels are the playlist names as published. Truncation is left to layout: a
 * normalisation rule would fire for a small minority and could not shorten the
 * genuinely long descriptive names anyway.
 */
export function ChartRail({
  playlists,
  current,
  pending,
  failed,
  onOpen,
}: ChartRailProps) {
  // A country with no playlists has nothing to choose between, and the row it
  // would cost is scarce at the smaller snaps.
  if (playlists.length === 0) return null;

  const entries: { ref: ChartRef; label: string }[] = [
    { ref: SONGS_CHART, label: SONGS_CHART_LABEL },
    ...playlists.map((playlist) => ({
      ref: playlist.id,
      label: playlist.name,
    })),
  ];

  const active = pending ?? current;

  // Arrows move focus between charts; opening one stays on Enter or Space.
  // Focus alone must not open, because opening a playlist chart costs a read
  // and arrowing across the rail would fire one per key.
  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const step = KEY_STEP[event.key];
    if (step === undefined) return;
    const tabs = [
      ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
        "[role='tab']:not([disabled])",
      ),
    ];
    if (tabs.length === 0) return;
    const from = tabs.indexOf(document.activeElement as HTMLButtonElement);
    // Wraps, so the rail has no dead end in either direction.
    const to =
      step === "first"
        ? 0
        : step === "last"
          ? tabs.length - 1
          : (Math.max(from, 0) + step + tabs.length) % tabs.length;
    event.preventDefault();
    tabs[to]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label="Charts"
      aria-orientation="horizontal"
      onKeyDown={handleKeyDown}
      className="flex shrink-0 gap-2 overflow-x-auto px-4 pb-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {entries.map(({ ref, label }, index) => {
        // The asked-for chart reads as selected the moment it is tapped, so the
        // tap is acknowledged before its track list arrives.
        const selected = active === ref;
        const unavailable = failed.has(ref);
        return (
          <button
            key={ref}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-disabled={unavailable || undefined}
            aria-posinset={index + 1}
            aria-setsize={entries.length}
            disabled={unavailable}
            // Roving tabindex: the rail is one tab stop, so reaching the track
            // list does not mean tabbing past every chart the country carries.
            tabIndex={selected ? 0 : -1}
            title={label}
            onClick={() => onOpen(ref)}
            className={`focus-visible:outline-aurora rounded-pill text-small max-w-[42vw] shrink-0 truncate border px-3.5 py-1.5 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-30 ${
              selected
                ? "bg-fg-1 text-void border-transparent font-semibold"
                : "bg-fg-1/5 text-fg-2 border-fg-1/10"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
