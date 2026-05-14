export type Throttle = <T>(fn: () => Promise<T>) => Promise<T>;

const GAP_MS = 3000; // Apple iTunes API: 20 requests/min/IP

export function createThrottle(): Throttle {
  let nextAllowedStart = 0;

  return async <T>(fn: () => Promise<T>): Promise<T> => {
    const now = Date.now();
    const scheduledStart = Math.max(now, nextAllowedStart);
    nextAllowedStart = scheduledStart + GAP_MS;
    const wait = scheduledStart - now;
    if (wait > 0) await new Promise<void>((r) => setTimeout(r, wait));
    return fn();
  };
}
