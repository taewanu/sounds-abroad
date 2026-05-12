import { z } from "zod";

export interface AppleRssTrack {
  rank: number;
  id: string;
  name: string;
  artist: string;
  appleUrl: string;
  artworkUrl: string;
}

export class AppleRssError extends Error {
  constructor(
    public readonly cc: string,
    message: string,
  ) {
    super(message);
    this.name = "AppleRssError";
  }
}

export interface FetchAppleRssOptions {
  fetch?: typeof fetch;
}

const RssTrackSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  artistName: z.string().min(1),
  url: z.url(),
  artworkUrl100: z.url(),
});

const RssResponseSchema = z.object({
  feed: z.object({
    results: z.array(RssTrackSchema).min(1).max(25),
  }),
});

function rssUrl(cc: string): string {
  return `https://rss.marketingtools.apple.com/api/v2/${cc}/music/most-played/25/songs.json`;
}

export async function fetchAppleRss(
  cc: string,
  options: FetchAppleRssOptions = {},
): Promise<AppleRssTrack[]> {
  const doFetch = options.fetch ?? globalThis.fetch;
  const url = rssUrl(cc);

  let res: Response;
  try {
    res = await doFetch(url);
  } catch (err) {
    throw new AppleRssError(
      cc,
      `Apple RSS fetch failed: ${err instanceof Error ? err.message : "network error"}`,
    );
  }

  if (!res.ok) {
    throw new AppleRssError(
      cc,
      `Apple RSS returned ${res.status} ${res.statusText}`,
    );
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch (err) {
    throw new AppleRssError(
      cc,
      `Apple RSS invalid JSON: ${err instanceof Error ? err.message : "parse error"}`,
    );
  }

  const parsed = RssResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new AppleRssError(
      cc,
      `Apple RSS shape mismatch: ${parsed.error.message}`,
    );
  }

  return parsed.data.feed.results.map((raw, idx) => ({
    rank: idx + 1,
    id: raw.id,
    name: raw.name,
    artist: raw.artistName,
    appleUrl: raw.url,
    artworkUrl: raw.artworkUrl100.replace("/100x100bb.jpg", "/600x600bb.jpg"),
  }));
}
