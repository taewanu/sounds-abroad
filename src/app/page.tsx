import Image from "next/image";

export default function Home() {
  return (
    <main className="bg-void text-fg-1 flex min-h-dvh flex-col items-center justify-center gap-6 px-6">
      <Image src="/logo-mark-dark.svg" alt="" width={64} height={64} priority />
      <h1 className="font-display text-5xl italic">Sounds Abroad</h1>
      <p className="text-fg-2 max-w-md text-center text-sm">
        Explore trending music around the world.
      </p>
      <p className="text-fg-3 font-mono text-xs tracking-widest uppercase">
        Coming soon
      </p>
    </main>
  );
}
