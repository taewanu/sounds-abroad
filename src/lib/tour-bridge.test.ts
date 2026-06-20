import { describe, expect, test } from "vitest";

import { createTourBridge } from "./tour-bridge";

describe("createTourBridge", () => {
  test("initial state: no fling requested, not active, globe not ready", () => {
    const bridge = createTourBridge();

    expect(bridge.getState().ghostFlingNonce).toBe(0);
    expect(bridge.getState().ghostFlingActive).toBe(false);
    expect(bridge.getState().globeReady).toBe(false);
  });

  test("requestGhostFling bumps the nonce and marks a fling active", () => {
    const bridge = createTourBridge();

    bridge.getState().requestGhostFling();

    expect(bridge.getState().ghostFlingNonce).toBe(1);
    expect(bridge.getState().ghostFlingActive).toBe(true);
  });

  test("consecutive requests accumulate the nonce so a re-open re-fires", () => {
    const bridge = createTourBridge();

    bridge.getState().requestGhostFling();
    bridge.getState().requestGhostFling();

    expect(bridge.getState().ghostFlingNonce).toBe(2);
  });

  test("resolveGhostFling clears active without touching the nonce", () => {
    const bridge = createTourBridge();
    bridge.getState().requestGhostFling();

    bridge.getState().resolveGhostFling();

    expect(bridge.getState().ghostFlingActive).toBe(false);
    expect(bridge.getState().ghostFlingNonce).toBe(1);
  });

  test("setGlobeReady toggles the globe-ready gate", () => {
    const bridge = createTourBridge();

    bridge.getState().setGlobeReady(true);

    expect(bridge.getState().globeReady).toBe(true);
  });

  test("each bridge instance holds independent state", () => {
    const a = createTourBridge();
    const b = createTourBridge();

    a.getState().requestGhostFling();

    expect(b.getState().ghostFlingNonce).toBe(0);
  });
});
