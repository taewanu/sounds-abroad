import { beforeEach, describe, expect, test } from "vitest";

import { globeChartStore } from "./globe-chart-store";

describe("globeChartStore", () => {
  beforeEach(() => {
    globeChartStore.setState({
      readMode: false,
      settleSignal: 0,
      skipSignal: { dir: 1, nonce: 0 },
      listening: false,
      skip: () => false,
    });
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

  test("signalSkip records the direction and bumps the nonce", () => {
    globeChartStore.getState().signalSkip(-1);

    expect(globeChartStore.getState().skipSignal).toEqual({
      dir: -1,
      nonce: 1,
    });
  });

  test("signalSkip bumps the nonce on a repeated direction so the cue replays", () => {
    globeChartStore.getState().signalSkip(1);
    globeChartStore.getState().signalSkip(1);

    expect(globeChartStore.getState().skipSignal).toEqual({ dir: 1, nonce: 2 });
  });
});
