"use client";

import { Suspense, use, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Canvas, useThree } from "@react-three/fiber";
import { PerspectiveCamera } from "three";

import { COUNTRIES } from "@/lib/countries";
import { validateCountryCode } from "@/lib/country-code";
import { getCountryOutlinesPromise } from "@/lib/topo-loader";

import { usePrefersReducedMotion } from "../use-prefers-reduced-motion";

import { cameraForViewport } from "./camera-fit";
import { CountryFill } from "./country-fill";
import { CountryOutlinesLayer } from "./country-outlines";
import { CountryPins } from "./country-pins";
import { addVisited } from "./spin-select";
import { SpinSnapControls } from "./spin-snap-controls";
import { StarBackdrop } from "./star-backdrop";

const ISO_BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c.isoNum]));

// Locked feel values from the gesture spike (ADR-0011). Named, not tunable.
const SPIN_SENSITIVITY = 1.4;
const SPIN_FRICTION = 2.5;
const SPIN_BOUNCE = 0.6;
const SPIN_HORIZONTAL_LOCK = false;
const SPIN_FAIR = true;
const FALLBACK_CODE = "us";

// Pins no longer handle selection; the canvas-level tap does. A stable no-op
// keeps CountryPins' required onSelect from getting a new ref each render.
const NO_OP = () => {};

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
  const reducedMotion = usePrefersReducedMotion();

  const [hoveredCode, setHoveredCode] = useState<string | null>(null);
  const hoveredIsoNum =
    hoveredCode !== null && hoveredCode !== selectedCode
      ? (ISO_BY_CODE.get(hoveredCode) ?? null)
      : null;
  const selectedIsoNum =
    selectedCode !== null ? (ISO_BY_CODE.get(selectedCode) ?? null) : null;

  // Per-session anti-repeat memory for the fairness-weighted fling; resets on
  // reload. Seeded once with whatever the globe first centered on.
  const [initialCode] = useState(() => selectedCode ?? FALLBACK_CODE);
  const [visited, setVisited] = useState<ReadonlySet<string>>(
    () => new Set([initialCode]),
  );

  // A landing is a selection: write ?cc= (replaceState, so rapid flinging
  // doesn't flood history) and record the country as visited.
  const handleSettle = useCallback((code: string) => {
    window.history.replaceState(null, "", `?cc=${code}`);
    setVisited((prev) => addVisited(prev, code));
  }, []);

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
        onSelect={NO_OP}
        onHoverChange={setHoveredCode}
      />
      <SpinSnapControls
        initialCode={initialCode}
        targetCode={selectedCode}
        reducedMotion={reducedMotion}
        sensitivity={SPIN_SENSITIVITY}
        friction={SPIN_FRICTION}
        bounce={SPIN_BOUNCE}
        horizontalLock={SPIN_HORIZONTAL_LOCK}
        fair={SPIN_FAIR}
        visited={visited}
        onSettle={handleSettle}
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
      style={{ touchAction: "none" }}
      className={`transition-opacity duration-700 ease-out ${
        ready ? "opacity-100" : "opacity-0"
      }`}
    >
      <AspectCameraFit />
      <SceneContent />
    </Canvas>
  );
}
