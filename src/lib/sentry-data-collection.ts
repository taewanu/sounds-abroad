import type { NodeOptions } from "@sentry/node";

// Privacy-by-default baseline for every Sentry.init: no IP, cookies, bodies or
// identifying headers, all of which an unset dataCollection would collect.
const PII_DENYLIST = { deny: ["forwarded", "-ip", "remote-", "via", "-user"] };

export const dataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: { request: PII_DENYLIST, response: PII_DENYLIST },
  httpBodies: [],
  urlQueryParams: PII_DENYLIST,
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  graphQL: { document: false, variables: false },
} satisfies NonNullable<NodeOptions["dataCollection"]>;
