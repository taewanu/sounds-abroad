import { createHash, timingSafeEqual } from "node:crypto";

import { revalidateTag } from "next/cache";
import * as Sentry from "@sentry/nextjs";

import { MUSIC_CHARTS_TAG } from "@/lib/cache-tags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const BREADCRUMB = {
  category: "revalidate",
  ok: "revalidate.ok",
  unauthorized: "revalidate.unauthorized",
} as const;

export const MISCONFIGURED_MESSAGE = "REVALIDATE_SECRET is not configured";

function sha256(s: string): Buffer {
  return createHash("sha256").update(s).digest();
}

function extractBearer(req: Request): string {
  const h = req.headers.get("authorization") ?? "";
  return h.startsWith("Bearer ") ? h.slice(7) : "";
}

export async function revalidateCharts(req: Request): Promise<Response> {
  const expected = process.env.REVALIDATE_SECRET;
  if (!expected) {
    Sentry.captureMessage(MISCONFIGURED_MESSAGE, "error");
    return new Response(JSON.stringify({ ok: false }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  const presented = extractBearer(req);
  const ok = timingSafeEqual(sha256(presented), sha256(expected));

  Sentry.addBreadcrumb({
    category: BREADCRUMB.category,
    level: ok ? "info" : "warning",
    message: ok ? BREADCRUMB.ok : BREADCRUMB.unauthorized,
    data: { tag: MUSIC_CHARTS_TAG },
  });

  if (!ok) {
    return new Response(JSON.stringify({ ok: false }), {
      status: 401,
      headers: {
        "content-type": "application/json",
        "www-authenticate": 'Bearer realm="revalidate"',
      },
    });
  }

  revalidateTag(MUSIC_CHARTS_TAG, "max");
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

export { revalidateCharts as POST };
