"use client";

import { Suspense, use, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";

import { COUNTRIES } from "@/lib/countries";
import { getCountryOutlinesPromise } from "@/lib/topo-loader";

import { CountryOutlinesLayer } from "./country-outlines";
import { CountryPins } from "./country-pins";
import { StarBackdrop } from "./star-backdrop";
import { useCameraArc } from "./use-camera-arc";

const ALL_CODES = COUNTRIES.map((c) => c.code);

function validateCode(raw: string | null): string | null {
  if (raw === null) return null;
  const lower = raw.toLowerCase();
  return ALL_CODES.includes(lower) ? lower : null;
}

function CountryLayers() {
  const outlines = use(getCountryOutlinesPromise());
  if (!outlines) return null;
  return <CountryOutlinesLayer data={outlines} />;
}

function SceneContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedCode = validateCode(searchParams.get("cc"));

  const { isAnimating } = useCameraArc({ targetCode: selectedCode });

  const handleSelect = useCallback(
    (code: string) => {
      if (isAnimating) return;
      router.push(`/?cc=${code}`);
    },
    [router, isAnimating],
  );

  return (
    <>
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
      <Suspense fallback={null}>
        <CountryLayers />
      </Suspense>
      <CountryPins selectedCode={selectedCode} onSelect={handleSelect} />
      <OrbitControls
        autoRotate={selectedCode === null}
        autoRotateSpeed={0.4}
        enableZoom={false}
        enablePan={false}
        enableRotate={!isAnimating}
        enableDamping
        makeDefault
      />
    </>
  );
}

export function GlobeScene() {
  return (
    <Canvas
      camera={{ fov: 45, position: [0, 0, 3.5] }}
      dpr={[1, 2]}
      gl={{ antialias: true }}
    >
      <SceneContent />
    </Canvas>
  );
}
