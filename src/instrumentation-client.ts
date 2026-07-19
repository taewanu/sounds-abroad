// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import posthog from "posthog-js";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // First-class deployment metadata (Sentry UI gets dedicated filters / release grouping).
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",
  release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7),

  // Add optional integrations for additional features
  integrations: [Sentry.replayIntegration()],

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 0.1,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Define how likely Replay events are sampled.
  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate: 0.1,

  // Define how likely Replay events are sampled when an error occurs.
  replaysOnErrorSampleRate: 1.0,

  // Privacy-by-default: skip auto-capture of IP / cookies / headers.
  // Non-PII context is opted in below via Sentry.setContext().
  sendDefaultPii: false,
});

// Manual opt-in: rich non-PII context for learning and debugging.
if (typeof window !== "undefined") {
  Sentry.setContext("app_locale", {
    language: navigator.language,
    languages: navigator.languages?.slice(0, 3).join(","),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  Sentry.setContext("viewport", {
    width: window.innerWidth,
    height: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
  });

  Sentry.setContext("browser_features", {
    colorScheme: window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light",
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches,
    touch: "ontouchstart" in window,
    online: navigator.onLine,
  });

  // Network info: supported in Chrome / Edge, partial in Safari / Firefox.
  interface NetworkInformation {
    effectiveType?: string;
    downlink?: number;
    saveData?: boolean;
  }
  const conn = (navigator as Navigator & { connection?: NetworkInformation })
    .connection;
  if (conn) {
    Sentry.setContext("network", {
      effectiveType: conn.effectiveType,
      downlink: conn.downlink,
      saveData: conn.saveData,
    });
  }
}

// Product analytics (PostHog), tuned for #250. autocapture stays off (no click
// noise, and it can't see the WebGL globe gestures anyway): product events fire
// by hand via track() (src/lib/analytics.ts). capture_pageview is on as
// 'history_change' so Web Analytics (source, geo, sessions) works across SPA
// routes. Session replay IS on to watch how people handle the globe gestures,
// with inputs masked (there is no login/PII, so nothing else needs masking).
// identified_only skips person profiles for anonymous visitors. Off entirely
// when the key is unset, so the app runs identically before the project exists.
const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
if (posthogKey) {
  posthog.init(posthogKey, {
    api_host:
      process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    autocapture: false,
    capture_pageview: "history_change",
    disable_session_recording: false,
    session_recording: { maskAllInputs: true },
    person_profiles: "identified_only",
  });
  // Tag every event with the deploy env so dev/preview traffic is filterable.
  posthog.register({
    app_env: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
