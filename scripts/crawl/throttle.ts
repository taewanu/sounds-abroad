export type Throttle = <T>(fn: () => Promise<T>) => Promise<T>;

const GAP_MS = 3000; // Apple iTunes API: 20 requests/min/IP

export function createThrottle(): Throttle {
  let lastStart = Number.NEGATIVE_INFINITY;

  return async <T>(fn: () => Promise<T>): Promise<T> => {
    const wait = lastStart + GAP_MS - Date.now();
    if (wait > 0) await new Promise<void>((r) => setTimeout(r, wait));
    lastStart = Date.now();
    return fn();
  };
}
