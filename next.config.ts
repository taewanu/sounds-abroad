import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

import { POSTHOG_HOST } from "./src/lib/analytics-host";
import { APPLE_ARTWORK_DOMAIN, APPLE_PREVIEW_HOST } from "./src/lib/url-schema";

const isDev = process.env.NODE_ENV === "development";

/**
 * The policy is the backstop for the sinks closed at ingestion: an address that
 * slips past every schema still cannot load or connect to an origin this site
 * does not use. Served report-only until its reports from real traffic are
 * reviewed; enforcement is the follow-up, not this header. Static (no nonce) on
 * purpose: a nonce forces per-request rendering, which ADR-0018 rules out, so
 * inline script/style stay allowed, which is the framework's documented shape
 * for statically rendered pages.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // Media hosts come from the ingestion schemas, so the allowance and the
  // validation are one list.
  `img-src 'self' https://*.${APPLE_ARTWORK_DOMAIN}`,
  `media-src https://${APPLE_PREVIEW_HOST}`,
  "font-src 'self'",
  // Error reporting rides the same-origin /monitoring tunnel; analytics is the
  // one processor spoken to directly. Dev adds ws: for hot reload.
  `connect-src 'self' ${POSTHOG_HOST}${isDev ? " ws:" : ""}`,
  // Session replay compresses in a blob: worker; child-src covers old Safari.
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/**
 * Sentry's browser-report intake, derived from the DSN so the reporting target
 * cannot drift from where errors already go. Null when the DSN is absent, and
 * the policy then ships without report directives rather than not at all.
 */
function sentrySecurityEndpoint(): string | null {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return null;
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\//, "");
    if (!url.username || !projectId) return null;
    return `https://${url.host}/api/${projectId}/security/?sentry_key=${url.username}`;
  } catch {
    return null;
  }
}

function cspHeaders() {
  const endpoint = sentrySecurityEndpoint();
  const value = endpoint
    ? `${contentSecurityPolicy}; report-uri ${endpoint}; report-to csp-endpoint`
    : contentSecurityPolicy;
  const headers = [{ key: "Content-Security-Policy-Report-Only", value }];
  if (endpoint) {
    headers.push({
      key: "Reporting-Endpoints",
      value: `csp-endpoint="${endpoint}"`,
    });
  }
  return headers;
}

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  // No preload: submitting to the browser preload list is a near-irreversible commitment.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/(.*)", headers: [...securityHeaders, ...cspHeaders()] },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: process.env.SENTRY_ORG,

  project: process.env.SENTRY_PROJECT,

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  // Strip source maps from the public deployment. They are still uploaded to Sentry for stack-trace de-minification.
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
