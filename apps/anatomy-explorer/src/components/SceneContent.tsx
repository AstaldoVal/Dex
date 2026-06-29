"use client";

import { useMemo } from "react";
import { SCENE_ROOTS } from "@/data/anatomy-manifest";
import { getSceneNodes, getVisibleNodeIds } from "@/lib/navigation";
import { useAnatomyStore } from "@/lib/anatomy-store";
import { ClickableMesh } from "./ClickableMesh";
import { GltfSceneLayer } from "./GltfSceneLayer";
import { HumanBodyFigure } from "./HumanBodyFigure";
import { BodyHotspot } from "./BodyHotspot";

const HOTSPOT_LABEL_OFFSETS: Record<string, [number, number, number]> = {
  "body-head": [0.42, 0.16, 0],
  "body-shoulder-l": [-0.42, 0.06, 0],
  "body-shoulder-r": [0.42, 0.06, 0],
  "body-lumbar": [0.5, -0.04, 0],
};

export function SceneContent() {
  const scene = useAnatomyStore((s) => s.scene);
  const focusId = useAnatomyStore((s) => s.focusId);
  const hoverId = useAnatomyStore((s) => s.hoverId);

  const sceneNodes = useMemo(() => getSceneNodes(scene), [scene]);
  const visibleIds = useMemo(
    () => getVisibleNodeIds(scene, focusId),
    [scene, focusId]
  );

  const rootNode = sceneNodes.find((n) => n.id === SCENE_ROOTS[scene]);
  const modelPath = rootNode?.modelPath;

  if (scene === "body") {
    const hotspots = sceneNodes.filter((n) => n.drillToScene);
    return (
      <group>
        <HumanBodyFigure />
        {hotspots.map((node) => (
          <BodyHotspot
            key={node.id}
            node={node}
            labelOffset={HOTSPOT_LABEL_OFFSETS[node.id]}
          />
        ))}
      </group>
    );
  }

  const placeholderNodes = sceneNodes.filter(
    (n) => n.id !== SCENE_ROOTS[scene] && n.shape
  );

  return (
    <group>
      {modelPath && (
        <GltfSceneLayer
          modelPath={modelPath}
          sceneNodes={sceneNodes}
          visibleIds={visibleIds}
          focusId={focusId}
          hoverId={hoverId}
        />
      )}
      {placeholderNodes.map((node) => {
        const visible = visibleIds.has(node.id);
        const isFocus = focusId === node.id;
        const isHover = hoverId === node.id;
        let opacity = 0.2;
        if (!visible) opacity = 0;
        else if (isFocus) opacity = 1;
        else if (isHover) opacity = 0.95;
        else if (focusId === SCENE_ROOTS[scene]) opacity = 0.88;
        else opacity = 0.22;

        if (modelPath && node.meshName) {
          // GLB present — hide duplicate placeholder if mesh exists in file
          return null;
        }

        return (
          <ClickableMesh
            key={node.id}
            node={node}
            opacity={opacity}
            emissive={node.color}
          />
        );
      })}
    </group>
  );
}
