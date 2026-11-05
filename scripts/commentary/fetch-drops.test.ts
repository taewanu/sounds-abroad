import { expect, test, vi } from "vitest";

import { DROPS_PATHNAME } from "./drops";
import { readDrops } from "./fetch-drops";

function validLedger() {
  return {
    "en:artist|song": {
      attempts: 1,
      reasons: ["tier-consistency"],
      lastTriedAt: "2026-06-23T00:00:00.000Z",
    },
  };
}

test("reads the ledger from the key the batch overwrites", async () => {
  const ledger = validLedger();
  const read = vi.fn(async () => ledger);

  const result = await readDrops(read);

  expect(read).toHaveBeenCalledWith(DROPS_PATHNAME);
  expect(result).toEqual(ledger);
});

test("a ledger never written reads as empty", async () => {
  expect(await readDrops(async () => null)).toEqual({});
});

test("a failed read throws rather than erasing the ledger", async () => {
  await expect(
    readDrops(async () => {
      throw new Error("read failed");
    }),
  ).rejects.toThrow("read failed");
});

test("a schema mismatch throws rather than overwriting from a bad read", async () => {
  await expect(readDrops(async () => ({ "en:a|b": {} }))).rejects.toThrow(
    /schema validation/,
  );
});
