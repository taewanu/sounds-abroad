import type { Track } from "@/lib/chart-schema";

export interface MediaSessionDeps {
  mediaSession: MediaSession | null;
  metadataCtor?: typeof MediaMetadata;
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
 * lock screen). Metadata-only, no transport action handlers. No-ops where
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

export function clearNowPlaying(deps: MediaSessionDeps = defaultDeps()): void {
  if (!deps.mediaSession) return;
  deps.mediaSession.metadata = null;
}
