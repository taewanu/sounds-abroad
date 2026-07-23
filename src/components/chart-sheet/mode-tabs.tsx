"use client";

import { useLayoutEffect, useRef, useState } from "react";

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
 * Toggle buttons in a group rather than a second tab list: the rail above owns
 * the panel's tabs, and these narrow what it lists rather than swapping it. One
 * underline travels between them so a switch reads as a single movement; its
 * place is measured, the two labels being different widths.
 */
export function ModeTabs({ current, waiting, onOpen }: ModeTabsProps) {
  const railRef = useRef<HTMLDivElement | null>(null);
  // `span` is a scaleX factor over the bar's one pixel, not a width.
  const [underline, setUnderline] = useState({ left: 0, span: 0 });

  // Measured after layout so the bar paints in place rather than travelling from
  // the left edge on arrival, and re-measured on a resize, the labels reflowing
  // with the sheet.
  useLayoutEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const place = () => {
      const active = rail.querySelector<HTMLElement>('[aria-pressed="true"]');
      if (active) {
        setUnderline({ left: active.offsetLeft, span: active.offsetWidth });
      }
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [current]);

  return (
    <div
      ref={railRef}
      role="group"
      aria-label="Chart mode"
      className="border-fg-1/10 relative mx-6 mb-2 flex gap-5 border-b"
    >
      {CHART_MODES.map((mode) => {
        const selected = mode === current;
        return (
          <button
            key={mode}
            type="button"
            aria-pressed={selected}
            onClick={() => onOpen(mode)}
            className={`focus-visible:outline-aurora text-small pt-1.5 pb-2 transition-colors duration-200 ease-[var(--ease-spring)] focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none ${
              selected ? "text-fg-1 font-semibold" : "text-fg-2"
            } ${waiting === mode ? "chart-tab-waiting" : ""}`}
          >
            {CHART_MODE_LABELS[mode]}
          </button>
        );
      })}
      {/* Sits on the group's own bottom rule, so the two read as one edge. One
          pixel wide and scaled to the label it is under, so travelling between
          two labels of different widths animates transform alone rather than
          resizing the bar every frame. */}
      <span
        aria-hidden
        style={{
          transform: `translateX(${underline.left}px) scaleX(${underline.span})`,
        }}
        className="bg-sunrise absolute -bottom-px left-0 h-0.5 w-px origin-left transition-transform duration-200 ease-[var(--ease-spring)] motion-reduce:transition-none"
      />
    </div>
  );
}
