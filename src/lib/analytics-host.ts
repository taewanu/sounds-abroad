/**
 * The analytics processor's origin, read by both the client init and the
 * content-security policy so the connect allowance cannot drift from where
 * events are actually sent.
 */
export const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
