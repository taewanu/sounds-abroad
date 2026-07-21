import type { ChartRef } from "@/lib/chart-ref";

/** What the songs chart is called on the rail. */
export const SONGS_CHART_LABEL = "Top Songs";

/** The id of the track list a chart's tab controls. */
export const CHART_PANEL_ID = "chart-panel";

/** The id of one chart's tab, so the panel can name what labels it. */
export function chartTabId(ref: ChartRef): string {
  return `chart-tab-${ref}`;
}

/**
 * How far each key moves focus along the rail. Home and End are absolute rather
 * than a step, so they are named instead of numbered.
 */
const KEY_STEP: Record<string, number | "first" | "last" | undefined> = {
  ArrowRight: 1,
  ArrowLeft: -1,
  Home: "first",
  End: "last",
};

/**
 * Moves focus along a tab list, wrapping at both ends so it has no dead end.
 * Charts that cannot be opened are not focus stops.
 *
 * Focus alone does not open a chart: opening one costs a read, so arrowing
 * across the rail under automatic activation would fire a request per keystroke.
 */
export function focusAlongTabs(
  rail: HTMLElement,
  key: string,
  focused: Element | null,
): boolean {
  const step = KEY_STEP[key];
  if (step === undefined) return false;

  const tabs = [
    ...rail.querySelectorAll<HTMLButtonElement>("[role='tab']:not([disabled])"),
  ];
  if (tabs.length === 0) return false;

  const from = tabs.indexOf(focused as HTMLButtonElement);
  const to =
    step === "first"
      ? 0
      : step === "last"
        ? tabs.length - 1
        : (Math.max(from, 0) + step + tabs.length) % tabs.length;

  tabs[to]?.focus();
  return true;
}
