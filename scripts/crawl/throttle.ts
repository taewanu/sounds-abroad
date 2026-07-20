export type Throttle = <T>(fn: () => Promise<T>) => Promise<T>;

const ITUNES_GAP_MS = 3000; // Apple iTunes API: 20 requests/min/IP

// Spotify's per-app limit is far more generous than iTunes'. A small gap on a
// separate throttle lets resolution calls fill iTunes' idle 3s windows instead
// of serializing behind them, keeping the crawl inside its runtime budget.
const SPOTIFY_GAP_MS = 200;

export function createThrottle(gapMs: number = ITUNES_GAP_MS): Throttle {
  let nextAllowedStart = 0;

  return async <T>(fn: () => Promise<T>): Promise<T> => {
    const now = Date.now();
    const scheduledStart = Math.max(now, nextAllowedStart);
    nextAllowedStart = scheduledStart + gapMs;
    const wait = scheduledStart - now;
    if (wait > 0) await new Promise<void>((r) => setTimeout(r, wait));
    return fn();
  };
}

export function createSpotifyThrottle(): Throttle {
  return createThrottle(SPOTIFY_GAP_MS);
}

// Playlist pages come from music.apple.com, not the iTunes API, so they do not
// draw on that per-IP budget. Twenty pages at four-way concurrency returned in
// 4.4s with no rate-limiting observed; the gap here is politeness, not a
// measured ceiling.
const PLAYLIST_PAGE_GAP_MS = 250;

export function createPlaylistPageThrottle(): Throttle {
  return createThrottle(PLAYLIST_PAGE_GAP_MS);
}
