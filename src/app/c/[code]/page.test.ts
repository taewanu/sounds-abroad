import { describe, expect, test } from "vitest";

import { COUNTRIES } from "@/lib/countries";

import { generateMetadata } from "./page";

describe("generateMetadata", () => {
  test("titles every country page without a chart depth", async () => {
    for (const { code, name } of COUNTRIES) {
      const metadata = await generateMetadata({
        params: Promise.resolve({ code }),
      });

      expect(metadata.title).toBe(`${name} — Top Songs on Sounds Abroad`);
      expect(String(metadata.title)).not.toMatch(/\d/);
    }
  });
});
