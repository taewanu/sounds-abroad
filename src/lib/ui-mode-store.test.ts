import { beforeEach, describe, expect, test } from "vitest";

import { uiModeStore } from "./ui-mode-store";

describe("uiModeStore", () => {
  beforeEach(() => {
    uiModeStore.setState({ readMode: false, settleSignal: 0 });
  });

  test("starts out of read mode with no settle yet", () => {
    expect(uiModeStore.getState().readMode).toBe(false);
    expect(uiModeStore.getState().settleSignal).toBe(0);
  });

  test("setReadMode toggles the flag", () => {
    uiModeStore.getState().setReadMode(true);
    expect(uiModeStore.getState().readMode).toBe(true);

    uiModeStore.getState().setReadMode(false);
    expect(uiModeStore.getState().readMode).toBe(false);
  });

  test("signalSettle increments so a repeat landing still fires subscribers", () => {
    uiModeStore.getState().signalSettle();
    uiModeStore.getState().signalSettle();
    expect(uiModeStore.getState().settleSignal).toBe(2);
  });
});
