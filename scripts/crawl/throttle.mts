export interface ThrottleOptions {
  rpm: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export type Throttle = <T>(fn: () => Promise<T>) => Promise<T>;

export function createThrottle(opts: ThrottleOptions): Throttle {
  const gapMs = Math.ceil(60_000 / opts.rpm);
  const now = opts.now ?? (() => Date.now());
  const sleep =
    opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let lastStart = Number.NEGATIVE_INFINITY;

  return async <T,>(fn: () => Promise<T>): Promise<T> => {
    const wait = lastStart + gapMs - now();
    if (wait > 0) await sleep(wait);
    lastStart = now();
    return fn();
  };
}
