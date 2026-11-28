import { useEffect, useMemo, useRef } from 'react';
import { CanvasTexture, type MeshBasicMaterial, RepeatWrapping, SRGBColorSpace } from 'three';

import type { CountryRings } from '@/lib/country-outlines';

import { fillCountryRings } from './country-fill-path';
import { TIER2_COLOR } from './country-outlines';

const CANVAS_W = 2048;
const CANVAS_H = 1024;
// Aligns the equirectangular canvas (lon=0 at canvas-x=CANVAS_W/2) with three.js
// SphereGeometry default seam, given the project's latLonToVec3 (lon=0 → +Z axis).
const UV_OFFSET_X = 0.25;

const SELECTED_R = 1.003;
// Sunrise, the selected-state brand color.
const SELECTED_COLOR = '#FF6B47';
const SELECTED_OPACITY = 0.55;

// Inside the hovered border at 1.002, so the depth test keeps the fill off that border.
const CHARTED_R = 1.001;
// A starting value that has not been tuned on a device.
const CHARTED_OPACITY = 0.18;
// Drawn before the other transparent layers, so the outlines and the selected fill sit on top.
const CHARTED_RENDER_ORDER = -1;

interface RingFillProps {
  countries: readonly CountryRings[];
  color: string;
  opacity: number;
  radius: number;
  renderOrder?: number;
}

// One canvas texture on one sphere, repainted only when `countries` or `color` changes.
function RingFill({ countries, color, opacity, radius, renderOrder = 0 }: RingFillProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textureRef = useRef<CanvasTexture | null>(null);
  const materialRef = useRef<MeshBasicMaterial | null>(null);

  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    const tex = new CanvasTexture(canvas);
    tex.offset.x = UV_OFFSET_X;
    // RepeatWrapping required because offset.x shifts sample u into [0.25, 1.25];
    // default ClampToEdge would smear the rightmost canvas column across lon=-90 to -180.
    tex.wrapS = RepeatWrapping;
    tex.colorSpace = SRGBColorSpace;
    canvasRef.current = canvas;
    textureRef.current = tex;
    const mat = materialRef.current;
    if (mat) {
      mat.map = tex;
      mat.needsUpdate = true;
    }
    return () => {
      tex.dispose();
      canvasRef.current = null;
      textureRef.current = null;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const texture = textureRef.current;
    if (!canvas || !texture) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = color;
    for (const rings of countries) fillCountryRings(ctx, rings, CANVAS_W, CANVAS_H);
    texture.needsUpdate = true;
  }, [countries, color]);

  return (
    <mesh renderOrder={renderOrder}>
      <sphereGeometry args={[radius, 64, 64]} />
      <meshBasicMaterial ref={materialRef} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}

interface SelectedCountryFillProps {
  selectedIsoNum: number | null;
  byIsoRings: Map<number, CountryRings>;
}

export function SelectedCountryFill({ selectedIsoNum, byIsoRings }: SelectedCountryFillProps) {
  const rings = selectedIsoNum !== null ? byIsoRings.get(selectedIsoNum) : undefined;
  const countries = useMemo(() => (rings ? [rings] : []), [rings]);
  return (
    <RingFill
      countries={countries}
      color={SELECTED_COLOR}
      opacity={SELECTED_OPACITY}
      radius={SELECTED_R}
    />
  );
}

export function ChartedCountryFill({ byIsoRings }: { byIsoRings: Map<number, CountryRings> }) {
  const countries = useMemo(() => [...byIsoRings.values()], [byIsoRings]);
  return (
    <RingFill
      countries={countries}
      color={TIER2_COLOR}
      opacity={CHARTED_OPACITY}
      radius={CHARTED_R}
      renderOrder={CHARTED_RENDER_ORDER}
    />
  );
}
