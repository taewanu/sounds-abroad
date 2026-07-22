"use client";

export interface ModeEmptyProps {
  /** The country whose chart came back empty, named so the claim is about it. */
  countryName: string;
  /** The chart to send the listener to, where the country carries one. */
  playlist: { id: string; name: string } | null;
  onOpenPlaylist: (id: string) => void;
}

/**
 * What Only here says when it holds nothing. An empty list alone reads as a
 * chart that failed to load rather than as the answer it is, and a country with
 * playlists is sent to one rather than left at a dead end.
 */
export function ModeEmpty({
  countryName,
  playlist,
  onOpenPlaylist,
}: ModeEmptyProps) {
  return (
    <li className="px-2 py-10 text-center">
      <p className="text-fg-1 text-body font-semibold">
        Nothing is only here today
      </p>
      <p className="text-fg-3 text-small mx-auto mt-2 max-w-[36ch]">
        Every song on {countryName}&rsquo;s chart is charting somewhere else
        too.
        {playlist === null ? "" : " Its playlists are still its own."}
      </p>
      {playlist === null ? null : (
        <button
          type="button"
          onClick={() => onOpenPlaylist(playlist.id)}
          title={playlist.name}
          className="focus-visible:outline-aurora bg-fg-1/10 text-fg-1 rounded-pill text-small border-fg-1/15 hover:bg-fg-1/15 mt-4 max-w-[70%] truncate border px-4 py-2 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Open {playlist.name}
        </button>
      )}
    </li>
  );
}
