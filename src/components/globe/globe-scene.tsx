"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";

import { StarBackdrop } from "./star-backdrop";

export function GlobeScene() {
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
      <OrbitControls
        autoRotate
        autoRotateSpeed={0.4}
        enableZoom={false}
        enablePan={false}
        enableDamping
        makeDefault
      />
    </Canvas>
  );
}
