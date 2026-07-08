import { createSeenFlag } from "@/lib/create-seen-flag";

// One-time gate for the edge-tap-to-skip cue, persisted across sessions and kept
// separate from the other hint flags so each surfaces on its own schedule.
export const edgeTapSeen = createSeenFlag(
  "sounds-abroad:edge-tap-hint-seen:v1",
);
