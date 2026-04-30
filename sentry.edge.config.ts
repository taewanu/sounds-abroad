// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // First-class deployment metadata (Sentry UI gets dedicated filters / release grouping).
  environment: process.env.VERCEL_ENV ?? "development",
  release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7),

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 0.1,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Privacy-by-default: skip auto-capture of IP / cookies / headers.
  sendDefaultPii: false,
});

// Server-only deployment metadata not covered by Sentry's first-class fields above.
Sentry.setContext("vercel", {
  branch: process.env.VERCEL_GIT_COMMIT_REF,
  region: process.env.VERCEL_REGION,
});
