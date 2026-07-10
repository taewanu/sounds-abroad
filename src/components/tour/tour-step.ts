// Pure step machine for the first-run onboarding tour. No DOM and no timers:
// the host translates real events (a user selection, the sheet opening, a track
// preview) into these and renders from the returned state. Staying pure is what
// makes the three beats unit-testable.

export type Beat = "gesture" | "sheet" | "audio" | "done";

// The teachable beats, in the order the tour runs them. "done" is the terminal
// state, not a beat to teach.
export type TeachBeat = Exclude<Beat, "done">;
export const TEACH_ORDER: TeachBeat[] = ["gesture", "sheet", "audio"];

// The tour runs an ordered subset of the teachable beats (only the un-learned
// ones, decided by the record). `index` is how many of `beats` are complete, so
// `beats[index]` is the current one and `beats.slice(0, index)` is what the user
// performed this run. `dismissed` (the X) ends the run without learning the rest.
export interface TourState {
  beats: TeachBeat[];
  index: number;
  dismissed: boolean;
}

export type TourEvent =
  | { type: "USER_SELECTED" } // the user flung or tapped a country
  | { type: "SHEET_OPENED" } // the user pulled the chart sheet to full
  | { type: "TRACK_PREVIEWED" } // the user tapped a track to preview it
  | { type: "SKIP" }; // dismiss (the X) or Escape

// The event that completes each beat. A beat advances only when the user
// performs its real gesture on the live target; there is no tap-to-skip a step.
const EVENT_FOR: Record<TeachBeat, TourEvent["type"]> = {
  gesture: "USER_SELECTED",
  sheet: "SHEET_OPENED",
  audio: "TRACK_PREVIEWED",
};

// No auto-demo: each beat opens inviting the user to perform the gesture
// themselves, so the tour never drives the globe, sheet, or selection. A hint,
// not a scripted motion, teaches it. Defaults to the full sequence.
export function initialTourState(beats: TeachBeat[] = TEACH_ORDER): TourState {
  return { beats, index: 0, dismissed: false };
}

// The beat to render, or "done" once dismissed or past the last beat.
export function currentBeat(state: TourState): Beat {
  if (state.dismissed || state.index >= state.beats.length) return "done";
  return state.beats[state.index];
}

// The beats the user actually performed this run, to fold into the record as
// learned. A dismissal doesn't retroactively learn the beats it skipped.
export function learnedSoFar(state: TourState): TeachBeat[] {
  return state.beats.slice(0, state.index);
}

export function tourReducer(state: TourState, event: TourEvent): TourState {
  if (currentBeat(state) === "done") return state;
  // The single exit is the X (SKIP), so the dim never competes with the gesture
  // for the same tap.
  if (event.type === "SKIP") return { ...state, dismissed: true };
  const beat = state.beats[state.index];
  return event.type === EVENT_FOR[beat]
    ? { ...state, index: state.index + 1 }
    : state;
}
