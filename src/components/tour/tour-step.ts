// Pure step machine for the first-run onboarding tour. No DOM and no timers:
// the host translates real events (a demo fling settling, a user selection, the
// sheet opening, a track preview) into these and renders from the returned
// state. Staying pure is what makes the three beats unit-testable.

export type Beat = "gesture" | "sheet" | "audio" | "done";

// Only meaningful while beat === "gesture": whether the scripted demo is still
// playing ("watch") or the user has been handed control ("try").
export type GesturePhase = "watch" | "try";

export interface TourState {
  beat: Beat;
  gesturePhase: GesturePhase;
}

export type TourEvent =
  | { type: "GHOST_DONE" } // the scripted demo fling settled
  | { type: "USER_SELECTED" } // the user flung or tapped a country
  | { type: "SHEET_OPENED" } // the user pulled the chart sheet to full
  | { type: "TRACK_PREVIEWED" } // the user tapped a track to preview it
  | { type: "NEXT" } // the explicit Next control
  | { type: "SKIP" }; // Skip, dismiss, or Escape

// Under reduced motion the scripted ghost fling never runs, so the gesture beat
// opens already inviting the user to try: there is nothing to watch.
export function initialTourState(reducedMotion: boolean): TourState {
  return { beat: "gesture", gesturePhase: reducedMotion ? "try" : "watch" };
}

export function tourReducer(state: TourState, event: TourEvent): TourState {
  // Skip ends the tour from any beat; dismissing counts as seen.
  if (event.type === "SKIP") return { ...state, beat: "done" };
  if (state.beat === "done") return state;

  switch (state.beat) {
    case "gesture":
      // A completed selection at any phase means the gesture landed, so move
      // on; the demo settling only hands over control, it does not advance.
      if (event.type === "GHOST_DONE") return { ...state, gesturePhase: "try" };
      if (event.type === "USER_SELECTED" || event.type === "NEXT")
        return { ...state, beat: "sheet" };
      return state;
    case "sheet":
      return event.type === "SHEET_OPENED" || event.type === "NEXT"
        ? { ...state, beat: "audio" }
        : state;
    case "audio":
      return event.type === "TRACK_PREVIEWED" || event.type === "NEXT"
        ? { ...state, beat: "done" }
        : state;
    default:
      return state;
  }
}
