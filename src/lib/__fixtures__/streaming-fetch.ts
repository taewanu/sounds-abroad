import { vi } from "vitest";

/**
 * A fetch whose body sends one chunk every `gapMs` and, like a real body,
 * errors once its request aborts. Without `closes` it goes quiet after the
 * last chunk, as a stalled download does.
 */
export function streamingFetch(
  chunks: string[],
  gapMs: number,
  { closes }: { closes: boolean },
) {
  return vi.fn((_route: string, init: RequestInit) => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        init.signal?.addEventListener("abort", () =>
          controller.error(new DOMException("aborted", "AbortError")),
        );
        chunks.forEach((text, i) =>
          setTimeout(
            () => controller.enqueue(new TextEncoder().encode(text)),
            gapMs * (i + 1),
          ),
        );
        if (closes)
          setTimeout(() => controller.close(), gapMs * (chunks.length + 1));
      },
    });
    return Promise.resolve(new Response(body));
  });
}
