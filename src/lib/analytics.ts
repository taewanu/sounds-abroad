import posthog from "posthog-js";

/**
 * The single call site for product analytics (#250). Callers only ever use
 * track(); swapping or dual-shipping the analytics backend never touches them.
 */

/**
 * The event catalogue: each key is an event name, each value the exact shape of
 * the properties that event carries. Typing it means a misspelled event name or
 * a missing property is a compile error, not a silently-absent dashboard column
 * discovered weeks later.
 */
export interface AnalyticsEvent {
  // A track started from a fresh selection, not an advance; those are
  // next_executed. `source` is which surface the user picked it from.
  track_played: {
    country: string;
    source: "track_row" | "gem_card";
  };

  // The user advanced to another track. Every next/prev surface routes through
  // one seam, so `direction` and `outcome` come from there. `outcome` names how
  // far the move reached: within the chart, on to the country's next chart, or
  // out into a fresh country. `from_rank` is the rank they left, measuring
  // consumption depth within a chart.
  next_executed: {
    country: string;
    direction: "next" | "prev";
    outcome: "adjacent" | "continued" | "rolled" | "back_rolled";
    from_rank: number;
  };

  // A chart was opened from the selector. The evidence the playlist axis is
  // judged by: it costs a daily crawl whether or not anyone opens one, so
  // whether they do is the question. `loaded` false is an ordinary outcome, not
  // an error, since a country carried forward can advertise a chart the latest
  // run never wrote, and counting those separates "nobody looks" from "it is
  // broken". Cached reopens carry `cached`, so a fetch count is recoverable.
  chart_opened: {
    country: string;
    chart: "songs" | "playlist";
    loaded: boolean;
    cached: boolean;
  };

  // A mode of the songs chart was opened. Whether anyone reads the second one is
  // the evidence the deeper crawl is judged on: taking a storefront's whole
  // hundred rather than its first quarter is what makes Only here answerable, and
  // it costs every run whether or not the mode is ever opened. Reported on the
  // ask rather than once the rows settle, so a mode whose tail never landed still
  // counts as asked for; the row count is left out for the same reason, since at
  // the ask the chart it would count may still be in flight.
  chart_mode_opened: {
    country: string;
    mode: "most_played" | "only_here";
  };

  // A preview failed to play. `reason` splits the detectable causes; `errorName`
  // carries the DOMException name when present, to tell the iOS silent-audio bug
  // (#148, a rejected play) apart from a plain load failure.
  preview_playback_failed: {
    country: string;
    reason: "load_error" | "play_rejected" | "empty_preview_url";
    errorName?: string;
  };

  // A 30-second preview played to the end instead of being skipped. The core
  // music engagement signal: which countries' tracks hold attention to the end.
  preview_completed: {
    country: string;
    rank: number;
  };

  // The user deliberately paused (tapped pause), the third listen-end state
  // beside completed and skipped: they stopped without finishing or advancing.
  // Only the intentional pause, not background-tab / device / handoff pauses.
  preview_paused: {
    country: string;
    rank: number;
  };

  // The why-trending commentary card was opened, measuring whether this
  // discovery surface gets used. Fires on open, not close.
  commentary_opened: {
    country: string;
    rank: number;
  };

  // The user followed a track out to Apple Music or Spotify for full playback,
  // a conversion signal that the preview created real interest. `destination`
  // splits where the tap actually lands: a Spotify link is the exact track only
  // when the crawl resolved one, and otherwise a search the user finishes by
  // hand. Recorded per tap because it cannot be reconstructed later.
  deeplink_out: {
    country: string;
    platform: "apple" | "spotify";
    destination: "track" | "search";
    rank: number;
  };
}

/**
 * Fire a named analytics event. No-ops during SSR and when PostHog is not
 * initialised (no key configured), so callers never have to guard.
 */
export function track<E extends keyof AnalyticsEvent>(
  event: E,
  properties: AnalyticsEvent[E],
): void {
  if (typeof window === "undefined") return;
  posthog.capture(event, properties);
}
