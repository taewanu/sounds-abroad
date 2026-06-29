import { z } from "zod";

/**
 * Which kind of claim a blurb makes, set at authoring time. `what-it-is` is a
 * stable note about the song itself; `why-charting` is a time-sensitive note
 * about its current chart movement, which carries a higher risk of going stale.
 */
export const ClaimSchema = z.enum(["what-it-is", "why-charting"]);

export const CommentarySchema = z.object({
  lead: z.string().min(1),
  detail: z.string().min(1).optional(),
  tag: z.string().min(1),
  claim: ClaimSchema,
  sources: z.array(z.url()).min(1),
  generatedAt: z.iso.datetime(),
});

const TrackFields = z.object({
  rank: z.number().int().min(1).max(25),
  name: z.string().min(1),
  artist: z.string().min(1),
  previewUrl: z.url().nullable(),
  artworkUrl: z.url(),
  appleUrl: z.url(),
  spotifyUrl: z.url(),
  commentary: CommentarySchema.nullable().optional(),
});

// Accept the legacy `spotifySearchUrl` field so a blob published before the
// rename still validates; the next crawl rewrites it as `spotifyUrl`. Without
// this, parsing a pre-rename blob throws and the served chart route fails.
const TrackSchema = z.preprocess((value) => {
  if (
    value &&
    typeof value === "object" &&
    !("spotifyUrl" in value) &&
    "spotifySearchUrl" in value
  ) {
    const { spotifySearchUrl, ...rest } = value as Record<string, unknown>;
    return { ...rest, spotifyUrl: spotifySearchUrl };
  }
  return value;
}, TrackFields);

const CountrySchema = z.object({
  name: z.string().min(1),
  valid: z.boolean(),
  tracks: z.array(TrackSchema).max(25),
});

export const ChartFileSchema = z.object({
  lastUpdated: z.iso.datetime(),
  countries: z
    .record(z.string().regex(/^[a-z]{2}$/), CountrySchema)
    .refine((c) => Object.keys(c).length > 0, {
      message: "countries must have at least one entry",
    }),
});

export type Claim = z.infer<typeof ClaimSchema>;
export type Commentary = z.infer<typeof CommentarySchema>;
export type Track = z.infer<typeof TrackSchema>;
export type Country = z.infer<typeof CountrySchema>;
export type ChartFile = z.infer<typeof ChartFileSchema>;
