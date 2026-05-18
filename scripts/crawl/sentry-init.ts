import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (!dsn) {
  throw new Error("NEXT_PUBLIC_SENTRY_DSN missing — set as GitHub Secret.");
}

Sentry.init({
  dsn,
  environment: "production-cron",
  release: process.env.GITHUB_SHA?.slice(0, 7),
  tracesSampleRate: 0,
});
