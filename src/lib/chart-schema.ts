import { z } from "zod";

export const CommentarySchema = z.object({
  lead: z.string().min(1),
  detail: z.string().min(1).optional(),
  tag: z.string().min(1).optional(),
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
  spotifySearchUrl: z.url(),
  commentary: CommentarySchema.nullable().optional(),
});

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

export type Commentary = z.infer<typeof CommentarySchema>;
export type Track = z.infer<typeof TrackSchema>;
export type Country = z.infer<typeof CountrySchema>;
export type ChartFile = z.infer<typeof ChartFileSchema>;
