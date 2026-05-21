import type { Track } from "@/lib/chart-schema";

export interface TrackRowProps {
  track: Track;
}

export function TrackRow({ track }: TrackRowProps) {
  return (
    <li className="flex items-center gap-3 py-2">
      <span className="text-fg-3 text-body w-7 text-right font-mono tabular-nums">
        {track.rank}
      </span>
      <div
        aria-hidden="true"
        style={{ backgroundImage: `url(${track.artworkUrl})` }}
        className="bg-fg-1/5 h-12 w-12 shrink-0 rounded-md bg-cover bg-center"
      />
      <div className="min-w-0 flex-1">
        <p className="text-fg-1 text-body truncate font-medium">{track.name}</p>
        <p className="text-fg-2 text-small truncate">{track.artist}</p>
      </div>
    </li>
  );
}
