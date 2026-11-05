// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

import { dataCollection } from "./src/lib/sentry-data-collection";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // First-class deployment metadata (Sentry UI gets dedicated filters / release grouping).
  environment: process.env.VERCEL_ENV ?? "development",
  release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7),

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 0.1,

  dataCollection,
});

// Server-only deployment metadata not covered by Sentry's first-class fields above.
Sentry.setContext("vercel", {
  branch: process.env.VERCEL_GIT_COMMIT_REF,
  region: process.env.VERCEL_REGION,
});
