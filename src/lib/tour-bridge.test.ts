import { describe, expect, test } from "vitest";

import { createTourBridge } from "./tour-bridge";

describe("createTourBridge", () => {
  test("initial state: globe not ready", () => {
    const bridge = createTourBridge();

    expect(bridge.getState().globeReady).toBe(false);
  });

  test("setGlobeReady toggles the globe-ready gate", () => {
    const bridge = createTourBridge();

    bridge.getState().setGlobeReady(true);

    expect(bridge.getState().globeReady).toBe(true);
  });

  test("each bridge instance holds independent state", () => {
    const a = createTourBridge();
    const b = createTourBridge();

    a.getState().setGlobeReady(true);

    expect(b.getState().globeReady).toBe(false);
  });
});
