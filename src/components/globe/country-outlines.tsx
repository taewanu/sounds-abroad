import type { CountryOutlines } from "@/lib/country-outlines";

const TIER1_COLOR = "#3a4a5a";
const TIER1_OPACITY = 0.8;
const TIER2_COLOR = "#88aacc";
const TIER2_OPACITY = 0.85;
const HOVER_OUTLINE_COLOR = "#FF8866";
const LINE_R_HOVER = 1.002;

interface CountryOutlinesLayerProps {
  data: CountryOutlines;
  hoveredIsoNum?: number | null;
}

export function CountryOutlinesLayer({
  data,
  hoveredIsoNum,
}: CountryOutlinesLayerProps) {
  const hoveredPositions =
    hoveredIsoNum !== null && hoveredIsoNum !== undefined
      ? data.byIso.get(hoveredIsoNum)
      : null;

  return (
    <>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[data.tier1Positions, 3]}
            count={data.tier1Positions.length / 3}
          />
        </bufferGeometry>
        <lineBasicMaterial
          color={TIER1_COLOR}
          transparent
          opacity={TIER1_OPACITY}
        />
      </lineSegments>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[data.tier2Positions, 3]}
            count={data.tier2Positions.length / 3}
          />
        </bufferGeometry>
        <lineBasicMaterial
          color={TIER2_COLOR}
          transparent
          opacity={TIER2_OPACITY}
        />
      </lineSegments>
      {hoveredPositions && (
        <group scale={[LINE_R_HOVER, LINE_R_HOVER, LINE_R_HOVER]}>
          <lineSegments>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                args={[hoveredPositions, 3]}
                count={hoveredPositions.length / 3}
              />
            </bufferGeometry>
            <lineBasicMaterial color={HOVER_OUTLINE_COLOR} />
          </lineSegments>
        </group>
      )}
    </>
  );
}
