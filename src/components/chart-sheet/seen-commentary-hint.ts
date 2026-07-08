import { createSeenFlag } from "@/lib/create-seen-flag";

// One-time gate for the commentary-discovery pulse, persisted across sessions
// and kept separate from the tour's flag so each surfaces on its own schedule.
export const commentarySeen = createSeenFlag(
  "sounds-abroad:commentary-hint-seen:v1",
);
