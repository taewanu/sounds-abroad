import { beforeEach, describe, expect, test } from "vitest";

import { globeChartStore } from "./globe-chart-store";

describe("globeChartStore", () => {
  beforeEach(() => {
    globeChartStore.setState({ readMode: false, settleSignal: 0 });
  });

  test("starts out of read mode with no settle yet", () => {
    expect(globeChartStore.getState().readMode).toBe(false);
    expect(globeChartStore.getState().settleSignal).toBe(0);
  });

  test("setReadMode toggles the flag", () => {
    globeChartStore.getState().setReadMode(true);
    expect(globeChartStore.getState().readMode).toBe(true);

    globeChartStore.getState().setReadMode(false);
    expect(globeChartStore.getState().readMode).toBe(false);
  });

  test("signalSettle increments so a repeat landing still fires subscribers", () => {
    globeChartStore.getState().signalSettle();
    globeChartStore.getState().signalSettle();
    expect(globeChartStore.getState().settleSignal).toBe(2);
  });
});
