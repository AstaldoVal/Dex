"use client";

import type { ReactNode } from "react";
import type { ThreeElements } from "@react-three/fiber";

const SKIN = "#5b6377";

type FleshProps = Omit<ThreeElements["mesh"], "children"> & {
  children?: ReactNode;
};

/** Non-interactive body part: raycast disabled so hotspots stay clickable. */
function Flesh({ children, ...props }: FleshProps) {
  return (
    <mesh {...props} raycast={() => null} castShadow receiveShadow>
      {children}
      <meshStandardMaterial color={SKIN} roughness={0.62} metalness={0.05} />
    </mesh>
  );
}

/**
 * Stylized human figure (~1.78 units tall, feet at y=0) used as the body
 * overview until a real Z-Anatomy GLB is exported to /models/body/.
 */
export function HumanBodyFigure() {
  return (
    <group>
      {/* Голова */}
      <Flesh position={[0, 1.62, 0]} scale={[0.9, 1.05, 0.95]}>
        <sphereGeometry args={[0.15, 32, 32]} />
      </Flesh>
      {/* Шея */}
      <Flesh position={[0, 1.475, 0]}>
        <cylinderGeometry args={[0.05, 0.062, 0.13, 16]} />
      </Flesh>
      {/* Грудная клетка */}
      <Flesh position={[0, 1.22, 0]} scale={[1, 1, 0.62]}>
        <cylinderGeometry args={[0.185, 0.14, 0.42, 24]} />
      </Flesh>
      {/* Плечевой пояс */}
      <Flesh position={[0, 1.41, 0]} scale={[1, 0.42, 0.55]}>
        <sphereGeometry args={[0.215, 24, 24]} />
      </Flesh>
      {/* Живот / талия */}
      <Flesh position={[0, 0.97, 0]} scale={[1, 1, 0.68]}>
        <cylinderGeometry args={[0.14, 0.16, 0.24, 24]} />
      </Flesh>
      {/* Таз */}
      <Flesh position={[0, 0.84, 0]} scale={[1, 0.7, 0.72]}>
        <sphereGeometry args={[0.175, 24, 24]} />
      </Flesh>

      {[-1, 1].map((side) => (
        <group key={side}>
          {/* Дельтовидная */}
          <Flesh position={[side * 0.225, 1.4, 0]}>
            <sphereGeometry args={[0.07, 16, 16]} />
          </Flesh>
          {/* Плечо */}
          <Flesh position={[side * 0.262, 1.2, 0]} rotation={[0, 0, side * -0.12]}>
            <capsuleGeometry args={[0.05, 0.26, 8, 16]} />
          </Flesh>
          {/* Предплечье */}
          <Flesh position={[side * 0.3, 0.92, 0.02]} rotation={[0.06, 0, side * -0.06]}>
            <capsuleGeometry args={[0.042, 0.24, 8, 16]} />
          </Flesh>
          {/* Кисть */}
          <Flesh position={[side * 0.318, 0.72, 0.03]} scale={[0.7, 1, 0.45]}>
            <sphereGeometry args={[0.062, 16, 16]} />
          </Flesh>
          {/* Бедро */}
          <Flesh position={[side * 0.095, 0.6, 0]} rotation={[0, 0, side * 0.04]}>
            <capsuleGeometry args={[0.077, 0.32, 8, 16]} />
          </Flesh>
          {/* Голень */}
          <Flesh position={[side * 0.103, 0.25, 0]}>
            <capsuleGeometry args={[0.054, 0.3, 8, 16]} />
          </Flesh>
          {/* Стопа */}
          <Flesh position={[side * 0.103, 0.038, 0.05]}>
            <boxGeometry args={[0.095, 0.072, 0.23]} />
          </Flesh>
        </group>
      ))}
    </group>
  );
}
