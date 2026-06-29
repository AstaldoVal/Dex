"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { useAnatomyStore } from "@/lib/anatomy-store";
import { SceneContent } from "./SceneContent";

const CAMERA: Record<string, { position: [number, number, number]; target: [number, number, number] }> = {
  body: { position: [0, 1.15, 2.9], target: [0, 0.95, 0] },
  brain: { position: [0, 0.2, 2.8], target: [0, 0, 0] },
  shoulder: { position: [1.2, 0.5, 2.2], target: [0, 0.3, 0] },
  lumbar: { position: [0.8, 0.5, 2.4], target: [0, 0.4, 0] },
};

export function AnatomyCanvas() {
  const scene = useAnatomyStore((s) => s.scene);
  const cam = CAMERA[scene] ?? CAMERA.body;

  return (
    <div className="canvas-wrap">
      <Canvas shadows dpr={[1, 2]} gl={{ antialias: true }}>
        <color attach="background" args={["#0f1117"]} />
        <PerspectiveCamera makeDefault position={cam.position} fov={42} />
        <ambientLight intensity={0.55} />
        <directionalLight position={[4, 6, 4]} intensity={1.1} castShadow />
        <directionalLight position={[-3, 2, -2]} intensity={0.35} />
        <hemisphereLight args={["#c7d2fe", "#1e293b", 0.4]} />
        <SceneContent />
        <OrbitControls
          target={cam.target}
          enablePan
          minDistance={0.8}
          maxDistance={8}
        />
        <gridHelper args={[6, 12, "#2d3148", "#1a1d27"]} position={[0, -0.01, 0]} />
      </Canvas>
      <div className="canvas-hint">
        {scene === "body"
          ? "Клик: голова → мозг · плечо → мышцы · поясница → lumbar"
          : "Клик по части — углубление · вращение — мышь"}
      </div>
    </div>
  );
}
