import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// happy-dom has no Web Audio API. Shim a no-op AudioContext so code that arms
// the real engine in a test (e.g. the first-pointerdown unlock) doesn't throw;
// tests that assert audio behavior inject a mock engine instead.
class StubAudioNode {
  connect<T>(target: T): T {
    return target;
  }
}
class StubGainNode extends StubAudioNode {
  gain = { value: 1 };
}
class StubAudioContext {
  state: "suspended" | "running" = "suspended";
  destination = new StubAudioNode();
  createMediaElementSource() {
    return new StubAudioNode();
  }
  createGain() {
    return new StubGainNode();
  }
  resume() {
    this.state = "running";
    return Promise.resolve();
  }
}
(globalThis as { AudioContext?: unknown }).AudioContext ??= StubAudioContext;

afterEach(() => {
  cleanup();
});
