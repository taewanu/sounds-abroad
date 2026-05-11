import { expect, test } from "vitest";
import fixture from "./__fixtures__/charts.json";
import { ChartFileSchema } from "./chart-schema";

test("ChartFileSchema parses the hand-crafted fixture", () => {
  expect(() => ChartFileSchema.parse(fixture)).not.toThrow();
});
