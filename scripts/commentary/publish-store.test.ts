import { expect, test, vi } from "vitest";

import type { Commentary } from "../../src/lib/chart-schema";
import type { CommentaryStore } from "../../src/lib/commentary-store";

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

function deps(live: CommentaryStore): PublishStoreDeps {
  return {
    readLiveStore: vi.fn(async () => live),
    backupLiveStore: vi.fn(async () => "backup-url"),
    uploadStore: vi.fn(async () => "store-url"),
  };
}

test("a publish keeps the live cards and adds the survivors", async () => {
  const live = { existing: card("live") };
  const survivors = { added: card("new") };
  const store = deps(live);

  const result = await publishStore(survivors, { replace: false }, store);

  expect(store.uploadStore).toHaveBeenCalledWith({ ...live, ...survivors });
  expect(result.total).toBe(2);
});

test("a survivor with a live card's key replaces only that card", async () => {
  const live = { kept: card("kept"), corrected: card("wrong") };
  const correction = card("right");
  const store = deps(live);

  await publishStore({ corrected: correction }, { replace: false }, store);

  expect(store.uploadStore).toHaveBeenCalledWith({
    kept: live.kept,
    corrected: correction,
  });
});

test("replace makes the survivors the whole store", async () => {
  const survivors = { only: card("only") };
  const store = deps({ removed: card("removed") });

  const result = await publishStore(survivors, { replace: true }, store);

  expect(store.uploadStore).toHaveBeenCalledWith(survivors);
  expect(result.total).toBe(1);
});

test.each([false, true])(
  "the live store is backed up before it is overwritten (replace: %s)",
  async (replace) => {
    const store = deps({ existing: card("live") });

    const result = await publishStore(
      { added: card("new") },
      { replace },
      store,
    );

    expect(result.backupUrl).toBe("backup-url");
    expect(
      vi.mocked(store.backupLiveStore).mock.invocationCallOrder[0],
    ).toBeLessThan(vi.mocked(store.uploadStore).mock.invocationCallOrder[0]);
  },
);

test("an empty live store has nothing to back up", async () => {
  const store = deps({});

  const result = await publishStore(
    { added: card("new") },
    { replace: false },
    store,
  );

  expect(store.backupLiveStore).not.toHaveBeenCalled();
  expect(result.backupUrl).toBeNull();
});

test("a failed read writes nothing", async () => {
  const store = deps({});
  vi.mocked(store.readLiveStore).mockRejectedValue(new Error("read failed"));

  await expect(
    publishStore({ added: card("new") }, { replace: false }, store),
  ).rejects.toThrow("read failed");

  expect(store.backupLiveStore).not.toHaveBeenCalled();
  expect(store.uploadStore).not.toHaveBeenCalled();
});

test("a failed backup leaves the live store untouched", async () => {
  const store = deps({ existing: card("live") });
  vi.mocked(store.backupLiveStore).mockRejectedValue(
    new Error("backup failed"),
  );

  await expect(
    publishStore({ added: card("new") }, { replace: false }, store),
  ).rejects.toThrow("backup failed");

  expect(store.uploadStore).not.toHaveBeenCalled();
});
