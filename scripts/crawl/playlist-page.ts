import { z } from "zod";

export interface PlaylistTrack {
  rank: number;
  id: string;
  name: string;
  artist: string;
  appleUrl: string;
  artworkUrl: string;
}

export type PlaylistPageErrorKind =
  "network" | "http" | "missing-block" | "json" | "shape";

export class PlaylistPageError extends Error {
  constructor(
    public readonly playlistId: string,
    public readonly kind: PlaylistPageErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "PlaylistPageError";
  }
}

export interface FetchPlaylistPageOptions {
  fetch?: typeof fetch;
}

const ARTWORK_SIZE = 600;

/**
 * The block Apple embeds its page state in. Undocumented and unversioned, which
 * is why a break here has to be detectable rather than merely survivable: see
 * ADR-0015. This constant is the single point that a rename would move.
 */
const SERVER_DATA_BLOCK =
  /<script type="application\/json" id="serialized-server-data">([\s\S]*?)<\/script>/;

/** The section holding the playlist's tracks, among header/footer/spacer kinds. */
const TRACK_SECTION_KIND = "trackLockup";

const TrackLockupSchema = z.object({
  title: z.string().min(1),
  artistName: z.string().min(1),
  contentDescriptor: z.object({
    identifiers: z.object({ storeAdamID: z.string().min(1) }),
    url: z.url(),
  }),
  artwork: z.object({
    dictionary: z.object({ url: z.string().min(1) }),
  }),
});

const PageSchema = z.object({
  data: z
    .array(
      z.object({
        data: z.object({
          sections: z.array(
            z.object({
              itemKind: z.string().optional(),
              items: z.array(z.unknown()).optional(),
            }),
          ),
        }),
      }),
    )
    .min(1),
});

/** Fills Apple's `{w}x{h}bb.{f}` artwork template. */
function renderArtwork(template: string, size = ARTWORK_SIZE): string {
  return template
    .replace("{w}", String(size))
    .replace("{h}", String(size))
    .replace("{f}", "jpg");
}

/**
 * Reads a playlist's tracks out of the page's embedded state.
 *
 * An individual item that no longer matches is skipped rather than failing the
 * playlist, but a track section that yields nothing usable is a broken contract,
 * not an empty playlist, so it throws.
 */
export function parsePlaylistPage(
  html: string,
  playlistId: string,
): PlaylistTrack[] {
  const block = SERVER_DATA_BLOCK.exec(html);
  if (!block) {
    throw new PlaylistPageError(
      playlistId,
      "missing-block",
      "playlist page carries no serialized-server-data block",
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(block[1]);
  } catch (err) {
    throw new PlaylistPageError(
      playlistId,
      "json",
      `serialized-server-data invalid JSON: ${err instanceof Error ? err.message : "parse error"}`,
    );
  }

  const page = PageSchema.safeParse(json);
  if (!page.success) {
    throw new PlaylistPageError(
      playlistId,
      "shape",
      `serialized-server-data shape mismatch: ${page.error.message}`,
    );
  }

  const section = page.data.data[0].data.sections.find(
    (candidate) => candidate.itemKind === TRACK_SECTION_KIND,
  );
  if (!section) {
    throw new PlaylistPageError(
      playlistId,
      "shape",
      `playlist page has no ${TRACK_SECTION_KIND} section`,
    );
  }

  const tracks: PlaylistTrack[] = [];
  for (const raw of section.items ?? []) {
    const item = TrackLockupSchema.safeParse(raw);
    if (!item.success) continue;

    tracks.push({
      rank: tracks.length + 1,
      id: item.data.contentDescriptor.identifiers.storeAdamID,
      name: item.data.title,
      artist: item.data.artistName,
      appleUrl: item.data.contentDescriptor.url,
      artworkUrl: renderArtwork(item.data.artwork.dictionary.url),
    });
  }

  if (tracks.length === 0) {
    throw new PlaylistPageError(
      playlistId,
      "shape",
      `playlist page yielded no usable tracks from ${section.items?.length ?? 0} items`,
    );
  }

  return tracks;
}

export async function fetchPlaylistPage(
  playlistId: string,
  appleUrl: string,
  options: FetchPlaylistPageOptions = {},
): Promise<PlaylistTrack[]> {
  const doFetch = options.fetch ?? globalThis.fetch;

  let res: Response;
  try {
    res = await doFetch(appleUrl);
  } catch (err) {
    throw new PlaylistPageError(
      playlistId,
      "network",
      `playlist page fetch failed: ${err instanceof Error ? err.message : "network error"}`,
    );
  }

  if (!res.ok) {
    throw new PlaylistPageError(
      playlistId,
      "http",
      `playlist page returned ${res.status} ${res.statusText}`,
    );
  }

  return parsePlaylistPage(await res.text(), playlistId);
}
