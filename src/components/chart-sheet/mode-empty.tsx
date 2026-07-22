export interface ModeEmptyProps {
  /** The country whose chart came back empty, named so the claim is about it. */
  countryName: string;
  /** Whether the country carries playlists to send the listener to. */
  hasPlaylists: boolean;
}

/**
 * What Only here says when it holds nothing.
 *
 * An empty list alone reads as a chart that failed to load rather than as an
 * answer, and this is an answer: every song this country is playing is playing
 * somewhere else too. Where the country has playlists, they are the other place
 * its own taste shows, so the listener is pointed back at the rail rather than
 * left at a dead end.
 */
export function ModeEmpty({ countryName, hasPlaylists }: ModeEmptyProps) {
  return (
    <li className="px-2 py-10 text-center">
      <p className="text-fg-1 text-body font-semibold">
        Nothing is only here today
      </p>
      <p className="text-fg-3 text-small mx-auto mt-2 max-w-[36ch]">
        Every song on {countryName}&rsquo;s chart is charting somewhere else
        too.
        {hasPlaylists ? " Its playlists are its own, though." : ""}
      </p>
    </li>
  );
}
