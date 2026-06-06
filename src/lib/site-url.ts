// Canonical production origin, defined once and shared by metadataBase, robots,
// sitemap, and the manifest. Pointed at the .app domain ahead of DNS: deploys
// keep using the Vercel URL, and OG/canonical links resolve once it goes live.
export const SITE_URL = "https://soundsabroad.app";
