import type { CountryOutlines } from "@/lib/country-outlines";

const TIER1_COLOR = "#3a4a5a";
const TIER1_OPACITY = 0.5;
const TIER2_COLOR = "#88aacc";
const TIER2_OPACITY = 0.85;

export function CountryOutlinesLayer({ data }: { data: CountryOutlines }) {
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
    </>
  );
}
