// Prerendered, so a read costs no function invocation.
export const dynamic = "force-static";

/** Reports which commit is deployed. */
export function serveHealth(): Response {
  return Response.json({ sha: process.env.VERCEL_GIT_COMMIT_SHA ?? null });
}

export { serveHealth as GET };
