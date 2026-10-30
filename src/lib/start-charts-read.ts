/**
 * Starts the chart read and leaves it on `window[key]` for the screen to take
 * over. The page inlines this function's source as a script, so its body may
 * use only its parameters and browser globals.
 */
export function startChartsRead(
  route: string,
  timeoutMs: number,
  key: string,
): Promise<Response> {
  const controller = new AbortController();
  // Bounds only the wait for the response to start, so a slow download still
  // finishes while a server that never answers ends in the failure.
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const read = fetch(route, { signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  );
  // An early failure is handled once the screen attaches to the read.
  read.catch(() => {});
  (window as unknown as Record<string, Promise<Response>>)[key] = read;
  return read;
}
