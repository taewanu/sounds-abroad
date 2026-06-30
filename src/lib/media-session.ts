import type { Track } from "@/lib/chart-schema";

export interface MediaSessionDeps {
  mediaSession: MediaSession | null;
  metadataCtor?: typeof MediaMetadata;
}

export interface MediaSessionHandlers {
  play: () => void;
  pause: () => void;
}

export interface MediaSessionSkipHandlers {
  nexttrack: () => void;
  previoustrack: () => void;
}

function defaultDeps(): MediaSessionDeps {
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  return {
    mediaSession: nav && "mediaSession" in nav ? nav.mediaSession : null,
    metadataCtor:
      typeof MediaMetadata !== "undefined" ? MediaMetadata : undefined,
  };
}

/**
 * Publishes the now-playing track to the OS media UI (iOS Dynamic Island /
 * lock screen). Metadata only, no transport action handlers. No-ops where
 * MediaSession is unsupported so it never throws.
 */
export function setNowPlaying(
  track: Track,
  deps: MediaSessionDeps = defaultDeps(),
): void {
  const { mediaSession, metadataCtor } = deps;
  if (!mediaSession || !metadataCtor) return;
  mediaSession.metadata = new metadataCtor({
    title: track.name,
    artist: track.artist,
    artwork: [{ src: track.artworkUrl, sizes: "600x600", type: "image/jpeg" }],
  });
}

/**
 * Mirrors live playback state to the OS. iOS needs this (alongside action
 * handlers) to treat the session as actively playing, which is what renders
 * the title/artist text and the live waveform in the Dynamic Island. Metadata
 * alone shows only static artwork.
 */
export function setPlaybackState(
  state: MediaSessionPlaybackState,
  deps: MediaSessionDeps = defaultDeps(),
): void {
  if (!deps.mediaSession) return;
  deps.mediaSession.playbackState = state;
}

/**
 * Registers play/pause transport handlers. iOS requires at least these for a
 * reliable now-playing presentation; without them it falls back to a minimal,
 * art-only card. Seek is out of scope.
 */
export function setActionHandlers(
  handlers: MediaSessionHandlers,
  deps: MediaSessionDeps = defaultDeps(),
): void {
  const { mediaSession } = deps;
  if (!mediaSession) return;
  mediaSession.setActionHandler("play", handlers.play);
  mediaSession.setActionHandler("pause", handlers.pause);
}

/**
 * Registers the OS skip controls. Separate from play/pause because routing them
 * needs the chart data to find the adjacent track, which lives in the chart UI,
 * not the audio store that wires play/pause.
 */
export function setSkipHandlers(
  handlers: MediaSessionSkipHandlers,
  deps: MediaSessionDeps = defaultDeps(),
): void {
  const { mediaSession } = deps;
  if (!mediaSession) return;
  mediaSession.setActionHandler("nexttrack", handlers.nexttrack);
  mediaSession.setActionHandler("previoustrack", handlers.previoustrack);
}

export function clearNowPlaying(deps: MediaSessionDeps = defaultDeps()): void {
  if (!deps.mediaSession) return;
  deps.mediaSession.metadata = null;
  deps.mediaSession.playbackState = "none";
}
