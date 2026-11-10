"use client";

import { useState } from "react";

/**
 * The 48px cover thumbnail every track surface shows. An image element rather
 * than a background, because an address placed in a style string can close the
 * `url()` and add declarations of its own. Loaded eagerly, as a background was:
 * a lazy image waits until it is near the screen, so a cover reached by a long
 * scroll or a swipe would start loading later than it used to. Decorative beside
 * the track's title, so hidden from assistive tech.
 */
export function TrackArtwork({ url }: { url: string }) {
  // A failed image draws the browser's broken-image mark, where a failed
  // background left the placeholder alone, so the element goes instead.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  return (
    <div
      aria-hidden="true"
      className="bg-fg-1/5 relative h-12 w-12 shrink-0 rounded-lg after:absolute after:inset-0 after:rounded-[inherit] after:shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
    >
      {failedUrl === url ? null : (
        <img
          // Keyed so a new address mounts a new element: a reused one keeps
          // painting the previous cover until the next has loaded.
          key={url}
          src={url}
          alt=""
          onError={() => setFailedUrl(url)}
          className="pointer-events-none h-full w-full rounded-[inherit] object-cover select-none"
        />
      )}
    </div>
  );
}
