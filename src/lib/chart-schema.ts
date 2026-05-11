import { z } from "zod";

const TrackSchema = z.object({
  rank: z.number().int().min(1).max(25),
  name: z.string().min(1),
  artist: z.string().min(1),
  previewUrl: z.url(),
  artworkUrl: z.url(),
  appleUrl: z.url(),
  spotifySearchUrl: z.url(),
});

const CountrySchema = z.object({
  name: z.string().min(1),
  valid: z.boolean(),
  tracks: z.array(TrackSchema).max(25),
});

export const ChartFileSchema = z.object({
  lastUpdated: z.iso.datetime(),
  countries: z.record(z.string().regex(/^[a-z]{2}$/), CountrySchema),
});

export type Track = z.infer<typeof TrackSchema>;
export type Country = z.infer<typeof CountrySchema>;
export type ChartFile = z.infer<typeof ChartFileSchema>;
