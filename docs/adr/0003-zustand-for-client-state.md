# ADR-0003: Zustand for client state

**Status:** Accepted (2026-05-22)

## Context

Phase 3 introduces cross-component client state — audio playback shared between `<TrackRow>` and `<MiniPlayer>` (Slice 3). Phase 5 will add globe ↔ `<ChartScreen>` selection state. The existing pattern (`ChartPickStore` at `src/lib/chart-pick-store.ts`) is a hand-rolled `useSyncExternalStore` + plain class — fine for init-once narrow state, but the boilerplate compounds with each new store, and there is no built-in selector model for re-render control.

Options weighed:

- **React Context** — no selector model; consumers re-render on any change. Acceptable for low-frequency state.
- **Zustand** — minimal API, selector-based subscriptions, framework-agnostic vanilla store, optional Provider.
- **Redux Toolkit** — boilerplate too heavy for V1 surface.
- **Jotai / Valtio** — capable; would add a third state pattern alongside `ChartPickStore`.
- **Continue hand-rolled** — verbose at scale; no selector ergonomics.

## Decision

Use **Zustand 5.0.13** for cross-component client state from Phase 3 onward, with the vanilla `createStore` + Provider pattern per Zustand's official Next.js guide:

- `createAudioStore(factory = defaultFactory)` exposes a vanilla store factory — accepts a dependency-injected `audioFactory` for unit testing.
- `<AudioStoreProvider>` mounts the store via `useState(() => createAudioStore())` at the `<ChartScreen>` boundary; `useAudioStore(selector)` reads via React Context.
- Tests use the factory directly: unit tests pass a mock factory and assert against vanilla `getState()/.setState()`; component tests wrap subtrees in `<AudioStoreProvider>` with a test-provisioned store.

Reserve the hand-rolled `useSyncExternalStore` + class pattern (ChartPickStore) for **narrow single-purpose stores** where caller-side runtime DI is essential (e.g. `rng`) and there is no per-component re-render hot path. Zustand's setup overhead is not justified there.

### Why `createStore` over `create()`

`createStore` returns a pure vanilla store object. `create()` mixes hook + vanilla into one — workable but couples unit tests to the React hook surface and obstructs per-test fresh instances. Vanilla separation makes the DI factory pattern clean.

### Why Provider over module singleton

Zustand's Next.js guidance: "store should not be shared across requests... created per request via a factory." Even though the audio store mutates only on client interaction (no SSR leak path today), Provider gives:

- Per-mount isolation for component tests
- Future-proofing if server-rendered state ever flows in
- A scoped boundary Slice 3's mini player shares cleanly with TrackRow

Cost: +1 file (`src/providers/audio-store-provider.tsx`, ~30 lines).

## Consequences

**Positive**

- Cross-component state without prop drilling.
- Selector-based subscriptions cap re-render scope.
- DI factory enables clean unit tests; Provider enables clean component tests.
- Standard pattern for future stores (globe state in Phase 5).

**Negative**

- One additional production dependency (~3KB minified + gzip).
- Two state patterns coexist (Zustand + ChartPickStore's hand-rolled class). Documented above so future contributors know when to pick which.
- Provider boilerplate per store.

**Neutral**

- Zustand v5 → v6 migration may apply later; v5 is current stable.
