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
