# ADR-0006: Web Audio graph for volume control

**Status:** Accepted (2026-06-13)

## Context

v1.1.0 adds a volume slider to the mini player (#84). The obvious binding, `HTMLMediaElement.volume`, is a dead control on the platform that matters most. On iOS, Apple reserves the audio level to the hardware buttons: per the Safari HTML5 Audio and Video Guide, the volume property "is not settable in JavaScript" and reading it "always returns 1." A slider wired to `element.volume` would silently no-op on every iPhone.

Options weighed for a cross-platform volume control:

- **`HTMLMediaElement.volume`** — one line and honored on desktop, but inert on iOS. Rejected: it fails the primary target.
- **Web Audio `GainNode`** — route the `<audio>` element through an `AudioContext` and scale output with a gain node, which iOS honors. Chosen.

## Decision

Volume drives a Web Audio `GainNode`. The browser engine (`src/lib/audio-engine.ts`) builds one graph at construction:

```
new Audio() → AudioContext → createMediaElementSource → GainNode → destination
```

- The element gets `crossOrigin = "anonymous"` before `src`, so a cross-origin preview flows through Web Audio without the silent-output penalty.
- `createMediaElementSource` is once-per-element, so the source binds to the element here; a track switch reassigns `element.src` and never re-wires the graph.
- `setVolume(value)` writes `gain.gain.value`; the store's `volume` (default 1, range 0–1, no amplification above 1) stays the source of truth.
- `context.resume()` is folded into `play()`: a suspended context is silence once the element is routed through it, and iOS only starts audio inside a play gesture.

**Mute is `gain → 0`**, and the slider restores the last audible level on unmute (`muted === (volume === 0)`). It reuses the working gain path instead of `element.muted`, which carries the same iOS read-only doubt once the element is routed through `createMediaElementSource`.

### Why a factory seam over Web Audio in the store

jsdom has no `AudioContext`, so constructing the graph inside the store would break its unit tests under Vitest. The graph sits behind an `AudioEngine` interface built by `createBrowserAudioEngine`, and `createAudioStore(factory)` injects a fake in tests, extending the DI factory of ADR-0003. The store stays pure and environment-agnostic; only the browser implementation touches Web Audio.

## Consequences

**Positive**

- Volume works on iOS, the one platform `element.volume` silently drops.
- The graph has room to grow: a visualizer's analyser node splices into the same `source → gain → destination` chain.
- The `AudioEngine` seam keeps store tests off Web Audio, needing only a small hand-rolled fake.

**Negative**

- An `AudioContext` per engine is heavier than a bare element and is bound by the browser's gesture-to-start rule, handled by resuming inside `play()`.
- Volume lives in two synced places, the store's `volume` and the node's `gain.value`, reconciled only through `setVolume`. A future direct write to either would desync them.

**Neutral**

- The range is fixed at 0–1; Web Audio could amplify above 1, but that is out of scope.
- The seam reuses ADR-0003's DI factory, so it adds no new test pattern.
