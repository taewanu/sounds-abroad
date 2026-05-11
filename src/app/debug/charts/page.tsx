import { notFound } from "next/navigation";
import { fetchCharts } from "@/lib/charts-client";

export const dynamic = "force-dynamic";

export default async function DebugChartsPage() {
  if (process.env.ENABLE_DEBUG !== "1") {
    notFound();
  }
  const url = process.env.CHARTS_BLOB_URL;
  if (!url) {
    notFound();
  }

  const charts = await fetchCharts(url);

  return (
    <main className="bg-void text-fg-1 min-h-dvh px-6 py-10 font-mono text-xs">
      <header className="mb-8">
        <h1 className="font-display text-fg-1 text-2xl italic">Charts debug</h1>
        <p className="text-fg-3 mt-1">lastUpdated: {charts.lastUpdated}</p>
      </header>

      {Object.entries(charts.countries).map(([cc, country]) => (
        <section key={cc} className="mb-8">
          <h2 className="text-fg-2 mb-2 text-sm tracking-widest uppercase">
            {cc.toUpperCase()} — {country.name}
            {!country.valid ? " (invalid)" : ""}
          </h2>
          <ol className="space-y-1">
            {country.tracks.map((track) => (
              <li key={track.rank} className="text-fg-1">
                <span className="text-fg-3">{track.rank}.</span> {track.name}{" "}
                <span className="text-fg-3">—</span> {track.artist}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </main>
  );
}
