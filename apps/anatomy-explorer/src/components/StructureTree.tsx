"use client";

import { useState } from "react";
import { NODE_BY_ID, SCENE_ROOTS } from "@/data/anatomy-manifest";
import type { AnatomyNode } from "@/data/anatomy-types";
import { buildTree } from "@/lib/navigation";
import { useAnatomyStore } from "@/lib/anatomy-store";

function TreeNode({ node, depth }: { node: AnatomyNode; depth: number }) {
  const [open, setOpen] = useState(depth < 2);
  const focusId = useAnatomyStore((s) => s.focusId);
  const focus = useAnatomyStore((s) => s.focus);
  const children = buildTree(node.id);

  const hasChildren = children.length > 0;
  const active = focusId === node.id;

  return (
    <div className="tree-node" style={{ paddingLeft: depth * 12 }}>
      <div className="tree-row">
        {hasChildren ? (
          <button
            type="button"
            className="tree-toggle"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Свернуть" : "Развернуть"}
          >
            {open ? "▼" : "▶"}
          </button>
        ) : (
          <span className="tree-toggle tree-toggle-spacer" />
        )}
        <button
          type="button"
          className={active ? "tree-link tree-link-active" : "tree-link"}
          onClick={() => focus(node.id)}
        >
          <span className="tree-swatch" style={{ background: node.color }} />
          {node.labelRu}
        </button>
      </div>
      {open &&
        children.map((child) => <TreeNode key={child.id} node={child} depth={depth + 1} />)}
    </div>
  );
}

export function StructureTree() {
  const scene = useAnatomyStore((s) => s.scene);
  const rootId = SCENE_ROOTS[scene];
  const rootNode = NODE_BY_ID[rootId];

  return (
    <div className="structure-tree">
      <p className="tree-heading">Структура</p>
      {rootNode && <TreeNode node={rootNode} depth={0} />}
    </div>
  );
}
