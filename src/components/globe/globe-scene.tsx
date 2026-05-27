"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";

import { COUNTRIES } from "@/lib/countries";
import type { CountryOutlines } from "@/lib/country-outlines";
import { loadCountryOutlines } from "@/lib/topo-loader";

import { CountryOutlinesLayer } from "./country-outlines";
import { CountryPins } from "./country-pins";
import { StarBackdrop } from "./star-backdrop";

const ALL_CODES = COUNTRIES.map((c) => c.code);

function validateCode(raw: string | null): string | null {
  if (raw === null) return null;
  const lower = raw.toLowerCase();
  return ALL_CODES.includes(lower) ? lower : null;
}

export function GlobeScene() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedCode = validateCode(searchParams.get("cc"));

  const [outlines, setOutlines] = useState<CountryOutlines | null>(null);
  const [userInteracted, setUserInteracted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadCountryOutlines()
      .then((data) => {
        if (!cancelled) setOutlines(data);
      })
      .catch((err: unknown) => {
        console.error("Failed to load country outlines", err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelect = useCallback(
    (code: string) => {
      setUserInteracted(true);
      router.push(`/?cc=${code}`);
    },
    [router],
  );

  return (
    <Canvas
      camera={{ fov: 45, position: [0, 0, 3.5] }}
      dpr={[1, 2]}
      gl={{ antialias: true }}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 3, 5]} intensity={1.2} />
      <StarBackdrop />
      <mesh>
        <sphereGeometry args={[1, 64, 64]} />
        <meshStandardMaterial
          color="#0a1a2a"
          roughness={0.95}
          metalness={0.05}
        />
      </mesh>
      {outlines && <CountryOutlinesLayer data={outlines} />}
      <CountryPins selectedCode={selectedCode} onSelect={handleSelect} />
      <OrbitControls
        autoRotate={!userInteracted}
        autoRotateSpeed={0.4}
        enableZoom={false}
        enablePan={false}
        enableDamping
        makeDefault
        onStart={() => setUserInteracted(true)}
      />
    </Canvas>
  );
}
