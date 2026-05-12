export type Throttle = <T>(fn: () => Promise<T>) => Promise<T>;

export function createThrottle(rpm: number): Throttle {
  const gapMs = Math.ceil(60_000 / rpm);
  let lastStart = Number.NEGATIVE_INFINITY;

  return async <T,>(fn: () => Promise<T>): Promise<T> => {
    const wait = lastStart + gapMs - Date.now();
    if (wait > 0) await new Promise<void>((r) => setTimeout(r, wait));
    lastStart = Date.now();
    return fn();
  };
}
