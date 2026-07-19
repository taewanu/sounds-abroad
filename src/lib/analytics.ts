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
  // Which discovery surface produced a play — the core "what earns plays" metric.
  track_played: {
    country: string;
    source: "globe_tap" | "autoplay_on_select" | "mini_player_next" | "tour";
  };

  // How the user reached the next track, and how deep they were when they did.
  // `method` separates the advance surfaces; `from_rank` measures per-country
  // consumption depth (do they get deep into the 25 or bail near the top?).
  next_executed: {
    country: string;
    method: "edge_tap" | "mini_player" | "auto_advance" | "chart_roll";
    from_rank: number;
  };

  // A preview failed to play. `reason` splits the causes so the iOS silent-audio
  // bug (#148) becomes a measured rate distinct from an outright missing preview.
  preview_playback_failed: {
    country: string;
    reason:
      | "audiocontext_interrupted"
      | "empty_preview_url"
      | "autoplay_blocked"
      | "load_error";
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
