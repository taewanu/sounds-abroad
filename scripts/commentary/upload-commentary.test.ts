import { expect, test, vi } from "vitest";

import { COMMENTARY_PATHNAME, readLiveCommentary } from "./upload-commentary";

test("reads the object every publish overwrites", async () => {
  const read = vi.fn(async () => ({}));

  await readLiveCommentary(read);

  expect(read).toHaveBeenCalledWith(COMMENTARY_PATHNAME);
});

test("keeps an entry the schema would reject, so a merge can't erase it", async () => {
  const stored = { kept: { lead: "missing every other field" } };

  const live = await readLiveCommentary(async () => stored);

  expect(live).toEqual(stored);
});

test("a store never published reads as empty", async () => {
  expect(await readLiveCommentary(async () => null)).toEqual({});
});

test("a failed read throws rather than reading as empty", async () => {
  await expect(
    readLiveCommentary(async () => {
      throw new Error("read failed");
    }),
  ).rejects.toThrow("read failed");
});

test.each([[[]], ["text"], [42]])(
  "a payload that isn't a JSON object (%j) throws rather than merging",
  async (payload) => {
    await expect(readLiveCommentary(async () => payload)).rejects.toThrow(
      "is not a JSON object",
    );
  },
);
