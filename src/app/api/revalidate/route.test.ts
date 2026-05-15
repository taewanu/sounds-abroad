import { revalidateTag } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { MUSIC_CHARTS_TAG } from "@/lib/cache-tags";

import { BREADCRUMB, revalidateCharts } from "./route";

// First module-mock pattern in this repo. `revalidateTag` and `addBreadcrumb`
// are named ESM exports from third-party modules; `vi.spyOn(globalThis, ...)`
// (the repo's existing pattern) does not apply here.
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ addBreadcrumb: vi.fn() }));

const SECRET = "test-fixture-secret";

function makeReq(headers?: Record<string, string>): Request {
  return new Request("http://test/api/revalidate", {
    method: "POST",
    headers,
  });
}

async function snapshot(
  req: Request,
): Promise<{ status: number; headers: [string, string][]; body: string }> {
  const res = await revalidateCharts(req);
  return {
    status: res.status,
    headers: [...res.headers.entries()].sort(),
    body: await res.text(),
  };
}

beforeEach(() => {
  process.env.REVALIDATE_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.REVALIDATE_SECRET;
  vi.clearAllMocks();
});

test("returns 200 and revalidates MUSIC_CHARTS_TAG with valid bearer", async () => {
  const req = makeReq({ authorization: `Bearer ${SECRET}` });
  const revalidateTagMock = vi.mocked(revalidateTag);
  const addBreadcrumbMock = vi.mocked(Sentry.addBreadcrumb);

  const res = await revalidateCharts(req);
  const body = await res.json();

  expect(res.status).toBe(200);
  expect(body).toEqual({ ok: true });
  expect(revalidateTagMock).toHaveBeenCalledTimes(1);
  expect(revalidateTagMock).toHaveBeenCalledWith(MUSIC_CHARTS_TAG, "max");
  expect(addBreadcrumbMock).toHaveBeenCalledWith({
    category: BREADCRUMB.category,
    level: "info",
    message: BREADCRUMB.ok,
    data: { tag: MUSIC_CHARTS_TAG },
  });
});

test("returns 401 with WWW-Authenticate when Authorization header is missing", async () => {
  const req = makeReq();
  const revalidateTagMock = vi.mocked(revalidateTag);
  const addBreadcrumbMock = vi.mocked(Sentry.addBreadcrumb);

  const res = await revalidateCharts(req);
  const body = await res.json();

  expect(res.status).toBe(401);
  expect(body).toEqual({ ok: false });
  expect(res.headers.get("www-authenticate")).toBe('Bearer realm="revalidate"');
  expect(revalidateTagMock).not.toHaveBeenCalled();
  expect(addBreadcrumbMock).toHaveBeenCalledWith({
    category: BREADCRUMB.category,
    level: "warning",
    message: BREADCRUMB.unauthorized,
    data: { tag: MUSIC_CHARTS_TAG },
  });
});

test("returns 401 when bearer token is wrong", async () => {
  const req = makeReq({ authorization: "Bearer wrong" });
  const revalidateTagMock = vi.mocked(revalidateTag);
  const addBreadcrumbMock = vi.mocked(Sentry.addBreadcrumb);

  const res = await revalidateCharts(req);
  const body = await res.json();

  expect(res.status).toBe(401);
  expect(body).toEqual({ ok: false });
  expect(res.headers.get("www-authenticate")).toBe('Bearer realm="revalidate"');
  expect(revalidateTagMock).not.toHaveBeenCalled();
  expect(addBreadcrumbMock).toHaveBeenCalledWith({
    category: BREADCRUMB.category,
    level: "warning",
    message: BREADCRUMB.unauthorized,
    data: { tag: MUSIC_CHARTS_TAG },
  });
});

test("401 responses are byte-identical for missing vs wrong bearer", async () => {
  const reqMissing = makeReq();
  const reqWrong = makeReq({ authorization: "Bearer wrong" });

  const missing = await snapshot(reqMissing);
  const wrong = await snapshot(reqWrong);

  expect(missing).toEqual(wrong);
});

test("returns 500 when REVALIDATE_SECRET env var is unset", async () => {
  delete process.env.REVALIDATE_SECRET;
  const req = makeReq({ authorization: `Bearer ${SECRET}` });
  const revalidateTagMock = vi.mocked(revalidateTag);

  const res = await revalidateCharts(req);

  expect(res.status).toBe(500);
  expect(revalidateTagMock).not.toHaveBeenCalled();
});
