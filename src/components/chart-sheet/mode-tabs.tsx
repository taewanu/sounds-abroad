"use client";

import {
  CHART_MODES,
  CHART_MODE_LABELS,
  type ChartMode,
} from "@/lib/chart-mode";

export interface ModeTabsProps {
  /** The mode on screen. */
  current: ChartMode;
  /** The mode whose rows are still being read, while one is. */
  waiting: ChartMode | null;
  onOpen: (mode: ChartMode) => void;
}

/**
 * The two questions the songs chart answers, as peers.
 *
 * Toggle buttons in a group rather than a second tab list: the rail above
 * already owns the panel's tabs, and these do not swap the panel, they narrow
 * what it lists. Two controls, so each is its own tab stop and the roving
 * tabindex the rail needs would cost more than it saves.
 */
export function ModeTabs({ current, waiting, onOpen }: ModeTabsProps) {
  return (
    <div
      role="group"
      aria-label="Chart mode"
      className="border-fg-1/10 mx-6 mb-2 flex gap-5 border-b"
    >
      {CHART_MODES.map((mode) => {
        const selected = mode === current;
        return (
          <button
            key={mode}
            type="button"
            aria-pressed={selected}
            onClick={() => onOpen(mode)}
            className={`focus-visible:outline-aurora text-small -mb-px border-b-2 pt-1.5 pb-2 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 ${
              selected
                ? "border-sunrise text-fg-1 font-semibold"
                : "text-fg-2 border-transparent"
            } ${waiting === mode ? "chart-tab-waiting" : ""}`}
          >
            {CHART_MODE_LABELS[mode]}
          </button>
        );
      })}
    </div>
  );
}
