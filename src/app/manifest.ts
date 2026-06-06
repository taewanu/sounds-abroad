import type { MetadataRoute } from "next";

// theme/background use the app's deepest surface token (--color-void) so the
// install splash and address bar match the globe canvas.
const VOID = "#050608";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sounds Abroad",
    short_name: "Sounds Abroad",
    description:
      "A 3D globe-based world music discovery web app — explore trending music around the world.",
    start_url: "/",
    display: "standalone",
    background_color: VOID,
    theme_color: VOID,
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
