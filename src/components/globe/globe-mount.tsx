"use client";

import dynamic from "next/dynamic";

// Defer the Three.js/R3F bundle so it stops competing with the chart for the
// main thread on load. The WebGL canvas is client-only, so ssr:false keeps it
// out of the server render. This wrapper exists to hold the dynamic(ssr:false)
// seam, which is not allowed inside the Server Component layout.
const GlobeScene = dynamic(
  () => import("./globe-scene").then((m) => m.GlobeScene),
  { ssr: false },
);

export function GlobeMount() {
  return <GlobeScene />;
}
