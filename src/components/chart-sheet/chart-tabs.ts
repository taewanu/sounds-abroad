import type { ChartRef } from '@/lib/chart-ref';

/** What the songs chart is called on the rail. */
export const SONGS_CHART_LABEL = 'Top Songs';

/** The id of the track list a chart's tab controls. */
export const CHART_PANEL_ID = 'chart-panel';

/** The id of one chart's tab, so the panel can name what labels it. */
export function chartTabId(ref: ChartRef): string {
  return `chart-tab-${ref}`;
}
