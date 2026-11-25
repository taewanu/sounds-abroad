import { notFound } from 'next/navigation';

import { fetchCharts } from '@/lib/charts-client';

export default async function DebugChartsPage() {
  if (process.env.ENABLE_DEBUG !== '1') {
    notFound();
  }
  const url = process.env.CHARTS_BLOB_URL;
  if (!url) {
    notFound();
  }

  const charts = await fetchCharts(url);

  return (
    <main className="min-h-dvh bg-void px-6 py-10 font-mono text-xs text-fg-1">
      <header className="mb-8">
        <h1 className="font-display text-2xl text-fg-1 italic">Charts debug</h1>
        <p className="mt-1 text-fg-3">lastUpdated: {charts.lastUpdated}</p>
      </header>

      {Object.entries(charts.countries).map(([cc, country]) => (
        <section key={cc} className="mb-8">
          <h2 className="mb-2 text-sm tracking-widest text-fg-2 uppercase">
            {cc.toUpperCase()} — {country.name}
            {!country.valid ? ' (invalid)' : ''}
          </h2>
          <ol className="space-y-1">
            {country.tracks.map((track) => (
              <li key={track.rank} className="text-fg-1">
                <span className="text-fg-3">{track.rank}.</span> {track.name}{' '}
                <span className="text-fg-3">—</span> {track.artist}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </main>
  );
}
