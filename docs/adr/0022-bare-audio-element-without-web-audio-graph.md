# ADR-0022: Play the bare audio element, with no Web Audio graph

**Status:** Accepted (2026-10-29). Supersedes [ADR-0006](0006-web-audio-graph-for-volume.md), whose graph existed only to give the slider a volume path on iOS.

## Context

ADR-0006 routed the preview's `<audio>` element through an `AudioContext` (element → `MediaElementSource` → `GainNode` → destination), because iOS ignores `HTMLMediaElement.volume` and a slider bound to it would do nothing on an iPhone.

On iOS that graph is a single point of silence. The context is interrupted when the page leaves the foreground, `resume()` does not clear the interruption, and `createMediaElementSource` has bound the element to that context for good, so the element plays on into a graph with no output. Three reported symptoms trace to it (#375, #148):

| Path                               | Symptom                                          |
| ---------------------------------- | ------------------------------------------------ |
| Autoplay                           | Starts silent                                    |
| Return from background, then pause | Repeats a fragment and will not stop             |
| Lock while playing                 | Lock screen shows playing, headphones are silent |

The forcing question: does any platform still need the graph? Where element volume is honoured, `element.volume` does what the gain node does. Where it is locked, the hardware buttons set the level, so the slider has nothing to offer.

## Decision

**The engine plays a bare `<audio>` element with no `AudioContext`; `setVolume` writes `element.volume`, and the mini player renders no volume slider where the element's volume is locked.**

- The `AudioEngine` seam gains one field, `volumeAdjustable`, which the engine reads from its own element. The store mirrors it for the mini player, so neither the store nor the component learns which platform it runs on.
- `crossOrigin = "anonymous"` goes with the graph. It was there only so a cross-origin preview could flow through Web Audio.
- Mute stays `volume → 0` with the slider's restore-on-unmute; it now writes the element instead of the gain.

### Detecting a locked volume

The engine reads `element.matches(":volume-locked")`, the pseudo-class MDN defines as matching a media element whose volume is "locked" by the user, an operating system or user agent preference (MDN, ":volume-locked CSS pseudo-class", last modified 2026-04-17, read 2026-10-29).

- WebKit, `Source/WebCore/html/HTMLMediaElement.cpp` on main, read 2026-10-29: `defaultVolumeLocked()` is true on iOS only for the small-screen interface idiom, so an iPhone is locked and an iPad is not. On a locked element `setVolume` stores the written value and queues a task that restores the old one, with no `volumechange` event.
- That revert is why a write-then-read probe was rejected: a synchronous read sees the written value until the later task restores it, so the probe reports a locked element as settable.
- Support, per the web-platform-dx web-features entry "Media element pseudo-classes" (read 2026-10-29): Safari and iOS Safari 15.4 (2022-03-14) and Firefox 150. Chrome and Edge do not support it, and `matches()` throws a `SyntaxError` on a selector the engine cannot parse; the engine treats that one error as unlocked and lets any other propagate.
- User-agent sniffing was rejected: an iPad reports a desktop UA, other iOS browsers run WebKit under their own UA strings, and the lock follows the interface idiom rather than the OS.

### Alternatives rejected

- **Keep the graph where volume is honoured, drop it only where it is locked.** Leaves the iPad on an `AudioContext` that the same backgrounding interrupts, and keeps two engines for a gain node that does what `element.volume` already does.
- **Keep the graph everywhere and resume it on `visibilitychange`.** `resume()` is what fails to clear the interruption; another call site for it does not change that.

## Consequences

- An iPhone has no in-app volume or mute. The hardware buttons are the only volume control there.
- #38 (real-time EQ bars from an `AnalyserNode`) has no graph to tap. Reintroducing an `AudioContext` for it would bring back the silence and wedging a stuck context causes on iOS (#148, #375), so that feature has to answer them before it ships.
- An iPhone on iOS before 15.4 has no `:volume-locked`, so it renders a slider that does nothing.
- The mechanism is inferred from the symptoms and the WebKit source, not traced on a device. It stays unconfirmed until a preview deployment passes all three paths in the table on an iPhone and on an iPad, and the slider still sets the level on desktop.
