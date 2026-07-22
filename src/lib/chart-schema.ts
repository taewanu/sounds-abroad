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

const TrackSchema = z.object({
  rank: z.number().int().min(1).max(25),
  name: z.string().min(1),
  artist: z.string().min(1),
  previewUrl: z.url().nullable(),
  artworkUrl: z.url(),
  appleUrl: z.url(),
  spotifyUrl: z.url(),
  commentary: CommentarySchema.nullable().optional(),
  spread: z.number().int().min(1).optional(),
});

/**
 * One genre and how many of a playlist's tracks carry it. The crawl bakes the
 * whole distribution rather than a single label, so the labelling rule stays a
 * read-time judgement (ADR-0013, extended by ADR-0015): the top genre's share
 * ranges widely between playlists, and any rule for it will need tuning without
 * waiting on a re-crawl.
 */
export const PlaylistGenreSchema = z.object({
  name: z.string().min(1),
  count: z.number().int().min(1),
});

/**
 * What a country carries about a playlist. Enough to render the chart selector
 * with no fetch; the track list travels separately (ADR-0016).
 */
export const PlaylistSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  appleUrl: z.url(),
  artworkUrl: z.url(),
  genres: z.array(PlaylistGenreSchema),
  trackCount: z.number().int().min(1),
  spread: z.number().int().min(1).optional(),
});

const CountrySchema = z.object({
  name: z.string().min(1),
  valid: z.boolean(),
  tracks: z.array(TrackSchema).max(25),
  // Both additive-optional, so a blob predating the playlist axis still parses.
  // Validity is per-axis: a playlist failure must not roll back a fresh songs
  // chart, which a single country-level flag would do (ADR-0015).
  playlists: z.array(PlaylistSchema).optional(),
  playlistsValid: z.boolean().optional(),
});

const PlaylistTrackSchema = z.object({
  rank: z.number().int().min(1),
  name: z.string().min(1),
  artist: z.string().min(1),
  previewUrl: z.url().nullable(),
  artworkUrl: z.url(),
  appleUrl: z.url(),
  // The search form only: an exact /track/{id} costs a Spotify call per track,
  // which this axis carries too many tracks to afford. Optional like every
  // other additive field here, so blobs written before it still parse.
  spotifyUrl: z.url().optional(),
});

/** One playlist's track list, published as its own blob (ADR-0016). */
export const PlaylistFileSchema = z.object({
  id: z.string().min(1),
  lastUpdated: z.iso.datetime(),
  tracks: z.array(PlaylistTrackSchema).min(1),
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
export type PlaylistGenre = z.infer<typeof PlaylistGenreSchema>;
export type Playlist = z.infer<typeof PlaylistSchema>;
export type PlaylistTrack = z.infer<typeof PlaylistTrackSchema>;
export type PlaylistFile = z.infer<typeof PlaylistFileSchema>;

/**
 * What a rendered row accepts: a track from either axis. Both `Track` and
 * `PlaylistTrack` satisfy it structurally, so neither schema has to loosen: the
 * songs axis keeps `spotifyUrl` required, and a payload missing it still fails
 * validation on read rather than rendering a dead link.
 */
export type ChartTrack = {
  rank: number;
  name: string;
  artist: string;
  previewUrl: string | null;
  artworkUrl: string;
  appleUrl: string;
  spotifyUrl?: string;
  commentary?: Commentary | null;
  spread?: number;
};
