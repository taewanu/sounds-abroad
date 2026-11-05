import { expect, test, vi } from "vitest";

import type { Commentary } from "../../src/lib/chart-schema";

import { publishStore, type PublishStoreDeps } from "./publish-store";

function card(lead: string): Commentary {
  return {
    lead,
    tag: "new entry",
    claim: "what-it-is",
    sources: ["https://example.com/a", "https://example.org/b"],
    generatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function writers(): PublishStoreDeps {
  return {
    backupLiveStore: vi.fn(async () => "backup-url"),
    uploadStore: vi.fn(async () => "store-url"),
  };
}

test("a publish keeps the live cards and adds the survivors", async () => {
  const live = { existing: card("live") };
  const survivors = { added: card("new") };
  const deps = writers();

  const result = await publishStore(survivors, live, { replace: false }, deps);

  const expected = { ...live, ...survivors };
  expect(deps.uploadStore).toHaveBeenCalledWith(expected);
  expect(result.total).toBe(Object.keys(expected).length);
});

test("a survivor with a live card's key replaces only that card", async () => {
  const live = { kept: card("kept"), corrected: card("wrong") };
  const correction = card("right");
  const deps = writers();

  await publishStore({ corrected: correction }, live, { replace: false }, deps);

  expect(deps.uploadStore).toHaveBeenCalledWith({
    kept: live.kept,
    corrected: correction,
  });
});

test("replace makes the survivors the whole store", async () => {
  const survivors = { only: card("only") };
  const deps = writers();

  const result = await publishStore(
    survivors,
    { removed: card("removed") },
    { replace: true },
    deps,
  );

  expect(deps.uploadStore).toHaveBeenCalledWith(survivors);
  expect(result.total).toBe(Object.keys(survivors).length);
});

test.each([false, true])(
  "the live store is backed up before it is overwritten (replace: %s)",
  async (replace) => {
    const deps = writers();

    const result = await publishStore(
      { added: card("new") },
      { existing: card("live") },
      { replace },
      deps,
    );

    expect(result.backupUrl).toBe(await deps.backupLiveStore());
    expect(
      vi.mocked(deps.backupLiveStore).mock.invocationCallOrder[0],
    ).toBeLessThan(vi.mocked(deps.uploadStore).mock.invocationCallOrder[0]);
  },
);

test("an empty live store has nothing to back up", async () => {
  const deps = writers();

  const result = await publishStore(
    { added: card("new") },
    {},
    { replace: false },
    deps,
  );

  expect(deps.backupLiveStore).not.toHaveBeenCalled();
  expect(result.backupUrl).toBeNull();
});

test("a failed backup leaves the live store untouched", async () => {
  const deps = writers();
  vi.mocked(deps.backupLiveStore).mockRejectedValue(new Error("backup failed"));

  await expect(
    publishStore(
      { added: card("new") },
      { existing: card("live") },
      { replace: false },
      deps,
    ),
  ).rejects.toThrow("backup failed");

  expect(deps.uploadStore).not.toHaveBeenCalled();
});
