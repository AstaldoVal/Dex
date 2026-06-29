"use client";

import { useRef, useState } from "react";
import { ThreeEvent } from "@react-three/fiber";
import type { Mesh } from "three";
import type { AnatomyNode } from "@/data/anatomy-types";
import { useAnatomyStore } from "@/lib/anatomy-store";

function MeshGeometry({ shape }: { shape: AnatomyNode["shape"] }) {
  switch (shape) {
    case "sphere":
      return <sphereGeometry args={[0.5, 24, 24]} />;
    case "capsule":
      return <capsuleGeometry args={[0.5, 0.5, 8, 16]} />;
    case "cylinder":
      return <cylinderGeometry args={[0.5, 0.5, 1, 16]} />;
    case "box":
    default:
      return <boxGeometry args={[1, 1, 1]} />;
  }
}

export function ClickableMesh({
  node,
  opacity = 1,
  emissive = "#000000",
}: {
  node: AnatomyNode;
  opacity?: number;
  emissive?: string;
}) {
  const meshRef = useRef<Mesh>(null);
  const [localHover, setLocalHover] = useState(false);
  const focus = useAnatomyStore((s) => s.focus);
  const setHover = useAnatomyStore((s) => s.setHover);
  const hoverId = useAnatomyStore((s) => s.hoverId);
  const focusId = useAnatomyStore((s) => s.focusId);

  const isFocused = focusId === node.id;
  const isHovered = hoverId === node.id || localHover;
  const interactive = node.clickable || Boolean(node.drillToScene);

  const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (!interactive) return;
    setLocalHover(true);
    setHover(node.id);
    document.body.style.cursor = "pointer";
  };

  const handlePointerOut = () => {
    setLocalHover(false);
    setHover(null);
    document.body.style.cursor = "default";
  };

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (!interactive) return;
    focus(node.id);
  };

  if (!node.shape && !node.clickable) return null;

  return (
    <mesh
      ref={meshRef}
      name={node.meshName ?? node.id}
      position={node.position}
      rotation={node.rotation ?? [0, 0, 0]}
      scale={node.scale}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      onClick={handleClick}
    >
      <MeshGeometry shape={node.shape ?? "box"} />
      <meshStandardMaterial
        color={node.color}
        transparent={opacity < 1}
        opacity={opacity}
        emissive={isFocused || isHovered ? emissive || node.color : "#000000"}
        emissiveIntensity={isFocused ? 0.45 : isHovered ? 0.25 : 0}
        roughness={0.55}
        metalness={0.08}
      />
    </mesh>
  );
}
