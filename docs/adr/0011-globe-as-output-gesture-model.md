# ADR-0011: Globe-as-output gesture model

**Status:** Accepted (2026-06-19)

## Context

The v1 globe is a direct-manipulation control: OrbitControls free-rotate, and selection means tapping a small pin (`country-pins.tsx`, hit-sphere radius 0.07). Two forces break this for v2.0.0. First, v1.3.0 took the globe from 40 to 63 countries, raising pin density so tiny, clustered pins (Europe, East Asia) are hard to hit. Second, free-rotate lets the globe come to rest on empty ocean, a non-state the product has no use for. The original motivation for the redesign was exactly the small-country selection pain.

The reframe that drove the design: a globe gesture has two separable axes, **selection** (which country) and **motion** (how the view moves). v1 fused them (drag the camera, tap a pin). Splitting them lets the globe become **output** — the camera is no longer something you aim, it is something that travels to whatever country a gesture selects. The selection logic and the camera animation become independent.

A throwaway spike (`spike/gesture-feel`, route `/spike/gestures`) validated the feel by hand on the real 63-pin globe before this decision. It is preserved as a branch, not merged.

This ADR records the interaction model and the selection semantics. It builds on the existing `?cc=` selection contract (`chart-screen.tsx`) and the camera-arc animation (`use-camera-arc.ts`), both of which predate it.

## Decision

**Remove free-rotate. The globe is output: gestures select a country, and the camera arcs to center it.** OrbitControls is dropped. A spin controller owns the camera.

### Input gestures

- **Fling (drag-and-release with momentum):** spin the globe with inertia; on coming to rest, snap to a country. This is the **serendipity** gesture — "show me something near here," not a precise aim.
- **Tap:** jump straight to the nearest country to the tap point. This is the **intent** gesture — "I want that one." A tap can land on empty ocean and still resolve, since selection is by nearest country, not by hitting a pin.
- **Spring-snap with overshoot:** the settle is an under-damped spring, so the view glides slightly past the country and springs back. Tactile, not a hard stop.
- Spin is **2D** (free in both axes, within |elevation| ≤ 75° so the view never flips over a pole), not locked to left/right. Horizontal-only lock was rejected: it pins the latitude band and so makes a predictable subset of countries reachable, defeating coverage.

### Selection semantics: the fairness hybrid

A fling does **not** select the geometrically nearest country to the rest point. Pure-nearest snapping starves small countries wedged between large neighbours: their region of "nearest" directions is tiny, so a fling almost never lands there. Instead:

- **Geography picks the region:** the candidate pool is the nearest N countries (N = 10) to the rest direction, by dot product of unit vectors.
- **A deck-style anti-repeat weighting picks the country:** a weighted random draw from that pool, biased toward not-yet-visited countries (visited weight 0.08 vs 1). A per-session visited set, reset on reload, drives the bias.

So a fling lands roughly where you pushed, but not on a predictable exact country, and the same few countries do not repeat. A **tap stays deterministic** (exact nearest) as the precise-intent escape hatch.

**Fling non-determinism is intended, not a defect.** This is the Tinder split: swipe for the next serendipitous card, search for a specific person. The ADR records it so the randomness is never "fixed" as a bug later.

**Structural reachability was verified, not assumed.** A sweep of 24,240 rest points (1.5° grid over the reachable sphere) confirmed all 63 countries appear in some fling pool: zero structurally starved. This proves _reachability_ (no country is permanently locked out), not _uniform probability_ (a clustered country still needs a fling toward its neighbourhood; the anti-repeat weighting handles the rut once there). That weaker guarantee — "nothing is locked out" — is the right one for a discovery toy.

### Selection wiring

- **Landing commits immediately and reversibly:** each settle updates the chart-sheet to the landed country and writes `?cc=`. No preview-then-confirm step, which would tax the spin-and-discover loop.
- **Audio does not auto-play.** The mini player keeps playing the prior country while you explore; selection and playback are decoupled (the v1 behavior).
- **Sheet posture:** `peek` is explore mode (≈65% of globe exposed and grabbable), `full` is read mode (covers the globe, suspends spin). They are mutually exclusive by hit-target: a drag on the exposed canvas spins, a drag on the sheet moves the sheet, so no arbitration code is needed. On settle, a `hidden`/`closed` sheet rises to `peek` so the result surfaces itself.
- **History uses `replaceState`, not `pushState`.** v1 pushed a history entry per selection because selections were few and deliberate; v2 flings are rapid and many, so per-fling `pushState` would flood history and overload the mobile system-back gesture into "previous country." Back = exit; an explicit on-screen undo affordance is the right tool if undo is wanted, not the back button. The shared `?cc=` URL is unaffected: it captures current state, never history.

### Accessibility

The `?cc=` contract means any control that writes it is a complete, equal selection path. Accessibility is therefore "offer a second writer," not "make the globe itself navigable":

- v2.0.0 ships the globe as the primary path plus a **minimal semantic country list** (a real list of buttons writing `?cc=`) as the deterministic / keyboard / screen-reader path. It may be plain and may live inside the sheet's `full` state.
- `prefers-reduced-motion` collapses the camera arc to an instant cut. This is a rendering flag on the arc, independent of which control fired.
- A keyboard "fling" was rejected as awkward and high-effort; the list serves the same user intent (pick a country fast) better.

### Feel values

The model's tuned constants — sensitivity 1.4, friction 2.5, bounce 0.45, a quick settle (a fling hands off to the snap spring at 2 rad/s, spring frequency 17), 2D spin, fairness on — ship as **named constants**, not a user setting and not a retained dev panel. The spike's sliders were a tool for finding the values, not a product feature. Re-tuning, if ever needed, reruns the preserved spike branch.

### Scope

- **In v2.0.0:** free-rotate removal, inertial spin + spring-snap, fairness-hybrid selection, minimal accessibility list, landing haptic (progressive enhancement), single Profile, swipe-shuffle folded in (it conflicted with free-rotate, so it is part of removing it), 63 countries.
- **Out (v2.x):** the A-Z scroll ruler (an independently valuable device deserving its own design slice), the multi-lens Profile shell, persisted (cross-session) visited history.

### Haptics

A landing fires `navigator.vibrate` as progressive enhancement. It is a non-load-bearing accent: iOS Safari does not support `navigator.vibrate`, so the landing's primary signal stays visual (the camera settling, the sheet updating). Native-grade iOS haptics are deferred to any future PWA/native shell.

## Consequences

**Positive**

- Fixes the original pain: selection no longer requires hitting a tiny pin, since fling and tap both resolve to a country with no pin-sized target.
- Keeps the playful globe feel (inertia + spring) while removing its one dead state (resting on ocean).
- Selection stays a single `?cc=` write, so the globe, the accessibility list, deep links, and reduced-motion all share one code path and one source of truth.
- Coverage is reachable-for-all and rut-resistant without a rigid deck that would override the user's regional aim.

**Negative**

- A fling is non-deterministic, so it cannot be the thing a shareable link or a back-button reproduces. Mitigated: links capture `?cc=` state, tap gives determinism, and an explicit undo can be added.
- The fairness weighting guarantees reachability, not uniform probability; a heavily clustered country is still less likely per random fling. Accepted for a toy; the list gives a guaranteed path to any specific country.
- Touch tap-vs-spin disambiguation (8px threshold) and Android haptics can only be finally tuned on real devices, not in the web spike.

**Neutral**

- The visited set is per-session and in-memory; a reload is a deliberate fresh start. Cross-session persistence is a v2.x option, not a gap.
- The minimal accessibility list is intentionally unstyled-by-default; the polished ruler that supersedes it is a separate v2.x slice.
- `replaceState` removes browser-level undo; this is a deliberate trade, with an explicit affordance as the replacement if needed.
