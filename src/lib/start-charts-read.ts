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
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Gives one wait, for the response or for a body chunk, timeoutMs before the
  // read aborts, so a slow download finishes while one that goes quiet fails.
  const within = <T>(wait: Promise<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(), timeoutMs);
    return wait;
  };
  const read = (async () => {
    try {
      const res = await within(fetch(route, { signal: controller.signal }));
      const reader = res.body?.getReader();
      const chunks: BlobPart[] = [];
      while (reader) {
        const { done, value } = await within(reader.read());
        if (done) break;
        chunks.push(value);
      }
      return new Response(new Blob(chunks), res);
    } finally {
      clearTimeout(timer);
    }
  })();
  // An early failure is handled once the screen attaches to the read.
  read.catch(() => {});
  (window as unknown as Record<string, Promise<Response>>)[key] = read;
  return read;
}
