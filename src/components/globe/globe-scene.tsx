"use client";

import { Suspense, use, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { PerspectiveCamera } from "three";

import { COUNTRIES } from "@/lib/countries";
import { validateCountryCode } from "@/lib/country-code";
import { getCountryOutlinesPromise } from "@/lib/topo-loader";

import { cameraForViewport } from "./camera-fit";
import { CountryFill } from "./country-fill";
import { CountryOutlinesLayer } from "./country-outlines";
import { CountryPins } from "./country-pins";
import { StarBackdrop } from "./star-backdrop";
import { useCameraArc } from "./use-camera-arc";

const ISO_BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c.isoNum]));

function CountryLayers({
  hoveredIsoNum,
  selectedIsoNum,
}: {
  hoveredIsoNum: number | null;
  selectedIsoNum: number | null;
}) {
  const outlines = use(getCountryOutlinesPromise());
  if (!outlines) return null;
  return (
    <>
      <CountryOutlinesLayer data={outlines} hoveredIsoNum={hoveredIsoNum} />
      <CountryFill
        selectedIsoNum={selectedIsoNum}
        byIsoRings={outlines.byIsoRings}
      />
    </>
  );
}

function SceneContent() {
  const searchParams = useSearchParams();
  const selectedCode = validateCountryCode(searchParams.get("cc"));

  const [hoveredCode, setHoveredCode] = useState<string | null>(null);
  const hoveredIsoNum =
    hoveredCode !== null && hoveredCode !== selectedCode
      ? (ISO_BY_CODE.get(hoveredCode) ?? null)
      : null;
  const selectedIsoNum =
    selectedCode !== null ? (ISO_BY_CODE.get(selectedCode) ?? null) : null;

  const { isAnimating } = useCameraArc({ targetCode: selectedCode });

  const handleSelect = useCallback(
    (code: string) => {
      if (isAnimating) return;
      window.history.pushState(null, "", `?cc=${code}`);
    },
    [isAnimating],
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
        <CountryLayers
          hoveredIsoNum={hoveredIsoNum}
          selectedIsoNum={selectedIsoNum}
        />
      </Suspense>
      <CountryPins
        selectedCode={selectedCode}
        hoveredCode={hoveredCode}
        onSelect={handleSelect}
        onHoverChange={setHoveredCode}
      />
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

// Keeps the globe a consistent size across aspect ratios on resize.
// The FOV math lives in camera-fit.ts.
function AspectCameraFit() {
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const get = useThree((s) => s.get);

  useEffect(() => {
    const camera = get().camera;
    if (!(camera instanceof PerspectiveCamera)) return;
    camera.fov = cameraForViewport(width / height).fov;
    camera.updateProjectionMatrix();
  }, [get, width, height]);

  return null;
}

export function GlobeScene() {
  // Fade in once the renderer exists, so the globe arrives over the dark
  // background instead of popping in when its chunk finishes loading.
  const [ready, setReady] = useState(false);
  return (
    <Canvas
      camera={{ fov: 45, position: [0, 0, 3.5] }}
      dpr={[1, 2]}
      gl={{ antialias: true }}
      onCreated={() => setReady(true)}
      className={`transition-opacity duration-700 ease-out ${
        ready ? "opacity-100" : "opacity-0"
      }`}
    >
      <AspectCameraFit />
      <SceneContent />
    </Canvas>
  );
}
