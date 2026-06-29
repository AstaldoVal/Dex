"use client";

import { useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type { MeshStandardMaterial } from "three";
import type { AnatomyNode } from "@/data/anatomy-types";
import { useAnatomyStore } from "@/lib/anatomy-store";

function HotspotGeometry({ shape }: { shape: AnatomyNode["shape"] }) {
  switch (shape) {
    case "box":
      return <boxGeometry args={[1, 1, 1]} />;
    case "capsule":
      return <capsuleGeometry args={[0.5, 0.5, 8, 16]} />;
    case "cylinder":
      return <cylinderGeometry args={[0.5, 0.5, 1, 16]} />;
    case "sphere":
    default:
      return <sphereGeometry args={[0.5, 24, 24]} />;
  }
}

/** Pulsing clickable zone with a floating label — body overview entry point. */
export function BodyHotspot({
  node,
  labelOffset = [0, 0.18, 0],
}: {
  node: AnatomyNode;
  labelOffset?: [number, number, number];
}) {
  const matRef = useRef<MeshStandardMaterial>(null);
  const [hovered, setHovered] = useState(false);
  const focus = useAnatomyStore((s) => s.focus);
  const setHover = useAnatomyStore((s) => s.setHover);

  useFrame(({ clock }) => {
    const m = matRef.current;
    if (!m) return;
    const pulse = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 2.4);
    m.opacity = hovered ? 0.9 : 0.28 + 0.22 * pulse;
    m.emissiveIntensity = hovered ? 1.1 : 0.35 + 0.55 * pulse;
  });

  const activate = () => focus(node.id);

  const onOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(true);
    setHover(node.id);
    document.body.style.cursor = "pointer";
  };

  const onOut = () => {
    setHovered(false);
    setHover(null);
    document.body.style.cursor = "default";
  };

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    activate();
  };

  return (
    <group position={node.position}>
      <mesh
        rotation={node.rotation ?? [0, 0, 0]}
        scale={node.scale}
        onPointerOver={onOver}
        onPointerOut={onOut}
        onClick={onClick}
      >
        <HotspotGeometry shape={node.shape ?? "sphere"} />
        <meshStandardMaterial
          ref={matRef}
          color={node.color}
          emissive={node.color}
          emissiveIntensity={0.5}
          transparent
          opacity={0.4}
          roughness={0.3}
          metalness={0.1}
          depthWrite={false}
        />
      </mesh>
      <Html
        position={labelOffset}
        center
        distanceFactor={3.2}
        occlude={false}
        style={{ pointerEvents: "none" }}
      >
        <button
          type="button"
          className={`hotspot-label${hovered ? " hotspot-label-active" : ""}`}
          onPointerOver={() => {
            setHovered(true);
            setHover(node.id);
          }}
          onPointerOut={onOut}
          onClick={(e) => {
            e.stopPropagation();
            activate();
          }}
          style={{ pointerEvents: "auto" }}
        >
          {node.labelRu}
        </button>
      </Html>
    </group>
  );
}
