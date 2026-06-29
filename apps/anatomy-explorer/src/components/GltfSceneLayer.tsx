"use client";

import { useEffect, useMemo, useState } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { AnatomyNode } from "@/data/anatomy-types";
import { NODE_BY_ID } from "@/data/anatomy-manifest";
import { useAnatomyStore } from "@/lib/anatomy-store";

function GltfMeshes({
  url,
  sceneNodes,
  visibleIds,
  focusId,
  hoverId,
}: {
  url: string;
  sceneNodes: AnatomyNode[];
  visibleIds: Set<string>;
  focusId: string;
  hoverId: string | null;
}) {
  const { scene } = useGLTF(url);
  const focus = useAnatomyStore((s) => s.focus);
  const setHover = useAnatomyStore((s) => s.setHover);

  const meshMap = useMemo(() => {
    const byName = new Map<string, THREE.Mesh>();
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        byName.set(child.name, child as THREE.Mesh);
      }
    });
    return byName;
  }, [scene]);

  const clones = useMemo(() => {
    const root = new THREE.Group();
    for (const node of sceneNodes) {
      if (!node.meshName) continue;
      const src = meshMap.get(node.meshName);
      if (!src) continue;
      const mesh = src.clone();
      mesh.name = node.id;
      mesh.userData.anatomyId = node.id;
      root.add(mesh);
    }
    return root;
  }, [meshMap, sceneNodes]);

  useEffect(() => {
    clones.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;
      const id = mesh.userData.anatomyId as string;
      const node = NODE_BY_ID[id];
      if (!node) return;

      const mat = mesh.material;
      const materials = Array.isArray(mat) ? mat : [mat];
      const visible = visibleIds.has(id);
      const isFocus = focusId === id;
      const isHover = hoverId === id;
      const isAncestor =
        focusId !== id &&
        visible &&
        visibleIds.has(id) &&
        id !== focusId;

      for (const m of materials) {
        if (!(m instanceof THREE.MeshStandardMaterial)) continue;
        m.transparent = true;
        if (!visible) {
          m.opacity = 0;
          m.depthWrite = false;
        } else if (isFocus) {
          m.opacity = 1;
          m.emissive = new THREE.Color(node.color);
          m.emissiveIntensity = 0.35;
        } else if (isHover) {
          m.opacity = 0.95;
          m.emissive = new THREE.Color(node.color);
          m.emissiveIntensity = 0.2;
        } else if (focusId !== node.scene && focusId !== id) {
          m.opacity = isAncestor ? 0.35 : 0.18;
          m.emissiveIntensity = 0;
        } else {
          m.opacity = 0.85;
          m.emissiveIntensity = 0;
        }
      }
    });
  }, [clones, visibleIds, focusId, hoverId]);

  return (
    <primitive
      object={clones}
      onPointerOver={(e: THREE.Event & { stopPropagation: () => void }) => {
        e.stopPropagation();
        const id = (e as unknown as { object?: THREE.Object3D }).object?.name;
        if (id && NODE_BY_ID[id]?.clickable) {
          setHover(id);
          document.body.style.cursor = "pointer";
        }
      }}
      onPointerOut={() => {
        setHover(null);
        document.body.style.cursor = "default";
      }}
      onClick={(e: THREE.Event & { stopPropagation: () => void }) => {
        e.stopPropagation();
        const id = (e as unknown as { object?: THREE.Object3D }).object?.name;
        if (id) focus(id);
      }}
    />
  );
}

export function GltfSceneLayer({
  modelPath,
  sceneNodes,
  visibleIds,
  focusId,
  hoverId,
}: {
  modelPath: string;
  sceneNodes: AnatomyNode[];
  visibleIds: Set<string>;
  focusId: string;
  hoverId: string | null;
}) {
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(modelPath, { method: "HEAD" })
      .then((res) => {
        if (!cancelled) setAvailable(res.ok);
      })
      .catch(() => {
        if (!cancelled) setAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, [modelPath]);

  if (available !== true) return null;

  return (
    <GltfMeshes
      url={modelPath}
      sceneNodes={sceneNodes}
      visibleIds={visibleIds}
      focusId={focusId}
      hoverId={hoverId}
    />
  );
}
