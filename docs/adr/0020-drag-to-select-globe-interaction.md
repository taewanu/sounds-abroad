# ADR-0020: Drag-to-select globe interaction

**Status:** Accepted (2026-07-30). Supersedes ADR-0011 (globe-as-output gesture
model). ADR-0011's fairness draw is narrowed, not retired; see "What carries
over" below.

## Context

ADR-0011 set out to fix small-country selection and did not. Its escape hatch
for precise aim was a tap resolving to the nearest country, which at 63-pin
density still asks a fingertip to distinguish neighbours a few pixels apart.
Observed behaviour is that people reach for pinch-zoom instead, and zoom cannot
help: zoomed in the surrounding world is gone, so you no longer know where you
are aiming; zoomed out the targets are back to sub-fingertip. Dense regions are
the worst case, where a dozen countries sit under one thumb.

Two further problems accumulated after ADR-0011 shipped.

**The globe acquired a second job.** A fling changes the country and a double
tap near either edge skips a track. Both are unfamiliar gestures on one surface,
neither announces its outcome, and the first tap of the edge pair is swallowed
with no feedback at all so that the second can be recognised. That wait is a
**deferred-select window**, and it is a standing source of timing bugs: every
other event has to be reconciled against a decision not yet made.

**The pin is the wrong target.** It is a dot rather than a country, so the
largest countries offer a tiny target inside a huge landmass, and the smallest
are entirely covered by the marker meant to point at them.

Underneath all three sits one missing property: nothing on the globe says what
it is about to do before it does it.

## Decision

**The globe means place, and it shows you where you are going before you commit.**

### Selection is continuous, and the centre is a promise

Dragging spins the globe as before, and the country passing through the centre
is enlarged, highlighted, and named. That indication is a promise: release now
and you land there.

**Release speed decides which rule picks the landing.**

- **A slow release is deterministic.** It lands on the country nearest the rest
  direction, which is the country that was indicated.
- **A fast flick is drawn.** The indication switches off, because nothing is
  legible at that speed, and the anti-repeat weighted draw picks the landing,
  which is revealed as the spin settles into it.

**The threshold is legibility, not preference.** It is the spin speed above
which a viewer can no longer read which country is enlarged, expressed in
radians per second and fixed by hand on a device. Defining it this way makes
the two rules coherent rather than arbitrary: the app may choose freely exactly
when it made no promise the user could read.

### The fairness draw narrows rather than retires

ADR-0011 gave every landing to the draw. It now governs only landings the user
was not shown in advance. This is the same guarantee applied more honestly: an
indication the user could read is a promise the landing has to keep, and drawing
against it would make the globe lie.

The reachability property ADR-0011 verified still holds and still matters,
because it is the flick path that needs it. The near-neighbour guard in the
selection code also stands, and is worth recording here since no ADR has stated
it: where no candidate falls within the angle that counts as a genuine
neighbourhood, the landing takes the single nearest country instead of
straddling an ocean.

Small-country starvation is now defended twice rather than once. The draw covers
the flick path, and on the deliberate path enlargement makes a small country as
easy to aim at as a large one, which is the problem ADR-0011 could not reach.

### Discrete travel: a single tap on either half

**A single tap on the left half of the globe steps one country west; the right
half steps east.** It is the same sequence the drag walks, taken one item at a
time.

- **Single, not double.** Assigning anything to a double tap reopens the
  deferred-select window. Leaving a double tap unassigned means two taps are
  simply two steps, so rapid repeated tapping carries you further at no cost,
  and the window disappears from the code.
- **Halves, not thirds, and no centre zone.** Instagram Stories and Tinder, the
  products that made a bare edge tap ordinary, both split their surface in two
  and reserve no centre. Stories, which needs a pause, puts it on press-and-hold
  rather than on a tap. Nothing on the globe competes for a tap once track
  skipping leaves, so nothing needs a third zone. If a third meaning is ever
  wanted, this is the decision to revisit.
- **The tap distance threshold is the only guard** against a failed drag reading
  as a step, and it is tuned accordingly.

### Track navigation leaves the globe

Skipping tracks moves to the mini-player swipe, on the object it acts on. The
globe carries one meaning, which is the whole point: the rule a user learns is
that touching the globe takes them somewhere new.

The edge affordances that advertised a track skip now advertise travel, and the
left and right form fits a direction more literally than it fitted a skip.

### Pins are removed

Pins stopped being the selection target some time ago: a tap already resolves to
the nearest country at the canvas level, and the pin meshes are left handling
only pointer hover. Nothing now needs them to be hittable.

What survives is what pins genuinely carried, which is set membership: the
countries that have charts are painted as a quiet fill, so a resting globe still
shows where you can go. That fill is produced once, and the selected country's
highlight stays separate from it, so a landing does not repaint every country.

This should also be cheaper, and the saving is to be measured rather than
assumed. Countries are painted into a canvas texture on one mesh, so the
number painted does not affect the draw call count, while each pin rendered two
separate meshes of its own.

### Size is one channel carrying two intensities

- **At rest**, the selected country is slightly raised, highlighted, and named.
  This states where you are.
- **While dragging**, the country at the centre is strongly raised, highlighted,
  and named. This promises where you will be.
- The resting emphasis releases when a drag begins, so only one country is ever
  emphasised.
- During a fast flick all of it is off.

One channel with two strengths beats two channels. The user learns "the big one
is what matters now" and reads the difference in degree without being taught it.
Because the two never occur together, they cannot be confused.

### Reduced motion suppresses the distortion, not the information

The enlargement is suppressed. The name label and the highlight remain.
Reduced motion asks for less movement, not less information, and the label
carries the information without moving. This follows ADR-0011's own precedent,
which cut the settle animation to an instant jump rather than removing the
settle. A rotating object filling the screen is a stronger vestibular trigger
than most interfaces produce, so this is a floor rather than a courtesy.

### The country list is the supported precise route

Once a tap means travel, no gesture aims at a named country any more, so the
deterministic path is the country list, and it is taught rather than left to be
discovered.
ADR-0011 introduced that list as the keyboard and screen-reader path; it now
serves everyone, which is also how it stays maintained.

**The write mode follows the writer, not the URL.** ADR-0011 chose
`replaceState` for every write on the grounds that flings are rapid and would
flood history, and ADR-0018 and ADR-0019 both restated that as settled. It is no
longer true, so the three writers are set out here:

- **A gesture landing pushes.** This already ships, and it is what makes the
  earlier blanket statements stale.
- **A settle the user did not aim replaces.** An external link or a shuffle
  landing is not something the user should have to walk back through.
- **A list pick pushes. This is the change.** It still replaces today. A pick
  from a list is the most deliberate selection the app offers, so replacing was
  the least defensible of the three.

### The shuffle button plays what it lands on

Pressing the button lands on a drawn country and plays that country's Local Gem,
so hearing something new costs no decisions.

This is the one place playback may start automatically. ADR-0011 kept selection
and playback decoupled, and later investigation found two independent obstacles
to changing that for a landing: iOS starts audio only from inside a user
gesture, and a settle arrives a second or more after the finger lifts, so its
playback call is detached from the gesture; and the audio context the volume
control needs can stick in an interrupted state that resuming does not clear.

A button press is itself the gesture, so the first obstacle does not arise, and
resuming the context from inside a press is the path that was already understood
to leave it running. That is why the button is the exception. Both claims are to
be confirmed on a device before the change ships, because the second obstacle is
the one that has surprised this codebase before.

The rule therefore becomes "gestures move, the button moves and plays", which is
narrower than a blanket prohibition and keeps every other path silent.

What the button plays is chosen in one place, so a later content lens can change
the answer without redesigning the control. No lens indirection is built while
one answer exists.

### A pointer highlights without enlarging

Hovering lights up the border of the country under the cursor and names it. It
does not enlarge it, because size means "about to be selected" and a click steps
rather than selects; enlarging under the cursor would promise what a click does
not deliver.

The hit test moves off the pin meshes and onto the same nearest-country
geometry the selection math already provides, so hover survives their removal.

Cursor-driven enlargement is therefore not the default, and it would also give
the pointer a second selection rule to learn. It stays available as a fallback if
border highlighting proves too subtle in practice. The interaction is designed
for touch, since a fat fingertip on a small screen is the problem being solved
and a cursor has neither constraint.

### Feel values stay named constants

The tuned values ship as named constants, not a setting and not a retained
panel, as under ADR-0011. They are found on a real device with a throwaway
tuner, because they interact: a stronger enlargement wants a smaller lens radius,
and a smaller tap threshold moves where the release-speed split belongs. ADR-0011
could name its numbers because its spike had already run; these are deliberately
absent here because the tuning pass precedes implementation and has not run yet.
The constants in the code are the record once it has.

Effects that cannot be asserted in a unit test, which is the distortion, the name
labels, the fade between emphasis levels, the landing haptic, and mobile
autoplay, are verified on a real device from a preview deployment as a merge
gate.

### What carries over

Unchanged from ADR-0011: the globe is output rather than a camera you aim; 2D
inertial spin bounded short of the poles; the spring settle with overshoot; the
anti-repeat weighted draw and its reachability guarantee; the per-session visited
set; the reduced-motion cut; the landing haptic as progressive enhancement; and
the URL as the single source of truth for the selected country.

Arriving after ADR-0011 and load-bearing here: the gesture machine was extracted
into a pure reducer, which is what makes this a change of transitions rather
than a rewrite of pointer handling.

## Consequences

**Positive**

- Aims at the problem ADR-0011 did not reach. Selection stops being a matter of
  hitting a target, so country size no longer decides how hard a country is to
  choose.
- Removes the need for zoom by moving magnification from the camera to the
  render, so the world stays on screen while the point of interest grows.
- The globe carries one meaning, so its gestures stop competing and the rule can
  be stated in one sentence.
- Only one input stays unfamiliar, the throw, and it is the one the product is
  identified by. Every other input is something the user already knows.
- Removes the deferred-tap window, and with it a class of bug rather than an
  instance of one.
- Should reduce the globe's draw calls, since the pin layer was its largest
  consumer. To be measured when the pins come off.

**Negative**

- Reaching a named country now requires the list or a long drag. Mitigated by
  making the list a taught, first-class route, but it is a real loss for anyone
  who could already hit a large country's pin.
- A single tap on either half means a stray tap changes country. Mitigated by
  the tap distance threshold and by pushed history, so the cost of a mistake is
  one back gesture.
- The distortion is the first GPU-level effect in the codebase, so it carries
  verification the rest of the interface does not: frame rate on low-end
  hardware, and correct behaviour under reduced motion.
- Users who learned the previous gestures must relearn, and what the app stored
  about which gestures they had performed must be invalidated, since those
  entries now name lessons that no longer exist. This is why the change is a
  major version.

**Neutral**

- The teaching flow is re-authored rather than extended. Lessons are identified
  by the input they teach, not by a category, so changing what is taught changes
  the identifier and a stale stored entry simply stops matching. That covers the
  named lessons; the contextual hint's record carries no identifier at all, so
  both stored records move to a new key version and the abandoned keys are
  cleaned up.
- No centre-tap meaning exists. This is reserved rather than rejected.
- Cursor-driven enlargement is recorded as a fallback if border highlighting
  proves too subtle, not as a planned addition.
