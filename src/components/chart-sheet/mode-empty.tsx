'use client';

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
export function ModeEmpty({ countryName, playlist, onOpenPlaylist }: ModeEmptyProps) {
  return (
    <li className="px-2 py-10 text-center">
      <p className="text-body font-semibold text-fg-1">Nothing is only here today</p>
      <p className="mx-auto mt-2 max-w-[36ch] text-small text-fg-3">
        Every song on {countryName}&rsquo;s chart is charting somewhere else too.
        {playlist === null ? '' : ' Its playlists are still its own.'}
      </p>
      {playlist === null ? null : (
        <button
          type="button"
          onClick={() => onOpenPlaylist(playlist.id)}
          title={playlist.name}
          className="mt-4 max-w-[70%] truncate rounded-pill border border-fg-1/15 bg-fg-1/10 px-4 py-2 text-small text-fg-1 transition-colors duration-150 hover:bg-fg-1/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aurora"
        >
          Open {playlist.name}
        </button>
      )}
    </li>
  );
}
