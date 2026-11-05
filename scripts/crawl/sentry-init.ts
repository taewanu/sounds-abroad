import * as Sentry from "@sentry/node";

import { dataCollection, v10Behavior } from "../../src/lib/sentry-options";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (!dsn) {
  throw new Error("NEXT_PUBLIC_SENTRY_DSN missing: set it as a GitHub Secret.");
}

Sentry.init({
  dsn,
  environment: "production-cron",
  release: process.env.GITHUB_SHA?.slice(0, 7),
  tracesSampleRate: 0,
  dataCollection,
  ...v10Behavior,
});
