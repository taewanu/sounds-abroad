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
  let timer = setTimeout(() => controller.abort(), timeoutMs);
  // An idle timeout: it restarts on the response and on each body chunk, so a
  // slow download finishes while one that goes quiet ends in the failure.
  const restart = () => {
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(), timeoutMs);
  };
  const read = fetch(route, { signal: controller.signal }).then(
    (res) => {
      restart();
      const body = res.body?.pipeThrough(
        new TransformStream({
          transform(chunk, out) {
            restart();
            out.enqueue(chunk);
          },
          flush() {
            clearTimeout(timer);
          },
        }),
      );
      return new Response(body, res);
    },
    (err: unknown) => {
      clearTimeout(timer);
      throw err;
    },
  );
  // An early failure is handled once the screen attaches to the read.
  read.catch(() => {});
  (window as unknown as Record<string, Promise<Response>>)[key] = read;
  return read;
}
