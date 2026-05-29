import { useEffect, useRef } from "react";
import {
  CanvasTexture,
  type MeshBasicMaterial,
  RepeatWrapping,
  SRGBColorSpace,
} from "three";

import type { CountryRings } from "@/lib/country-outlines";

const FILL_R = 1.003;
const CANVAS_W = 2048;
const CANVAS_H = 1024;
// #FF6B47 sunrise × α 0.55 — selected-state brand color.
const FILL_COLOR = "rgba(255, 107, 71, 0.55)";
// Aligns the equirectangular canvas (lon=0 at canvas-x=CANVAS_W/2) with three.js
// SphereGeometry default seam, given the project's latLonToVec3 (lon=0 → +Z axis).
const UV_OFFSET_X = 0.25;

interface CountryFillProps {
  selectedIsoNum: number | null;
  byIsoRings: Map<number, CountryRings>;
}

export function CountryFill({ selectedIsoNum, byIsoRings }: CountryFillProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textureRef = useRef<CanvasTexture | null>(null);
  const materialRef = useRef<MeshBasicMaterial | null>(null);

  useEffect(() => {
    const canvas = document.createElement("canvas");
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
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    if (selectedIsoNum !== null) {
      const rings = byIsoRings.get(selectedIsoNum);
      if (rings) {
        ctx.fillStyle = FILL_COLOR;
        ctx.beginPath();
        for (const ring of rings) {
          for (let i = 0; i < ring.length; i++) {
            const [lon, lat] = ring[i];
            const x = ((lon + 180) / 360) * CANVAS_W;
            const y = ((90 - lat) / 180) * CANVAS_H;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
        }
        ctx.fill("evenodd");
      }
    }
    texture.needsUpdate = true;
  }, [selectedIsoNum, byIsoRings]);

  return (
    <mesh>
      <sphereGeometry args={[FILL_R, 64, 64]} />
      <meshBasicMaterial ref={materialRef} transparent depthWrite={false} />
    </mesh>
  );
}
