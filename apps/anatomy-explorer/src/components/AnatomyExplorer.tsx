"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import type { SceneId } from "@/data/anatomy-types";
import { anatomySearchParams, useAnatomyStore } from "@/lib/anatomy-store";
import { InfoPanel } from "./InfoPanel";
import { NavigationBreadcrumbs } from "./NavigationBreadcrumbs";
import { StructureTree } from "./StructureTree";

const AnatomyCanvas = dynamic(
  () => import("./AnatomyCanvas").then((m) => m.AnatomyCanvas),
  { ssr: false, loading: () => <div className="canvas-loading">Загрузка 3D…</div> }
);

const SCENES: SceneId[] = ["body", "brain", "shoulder", "lumbar"];

export function AnatomyExplorer() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const scene = useAnatomyStore((s) => s.scene);
  const focusId = useAnatomyStore((s) => s.focusId);
  const syncFromUrl = useAnatomyStore((s) => s.syncFromUrl);
  const jumpToScene = useAnatomyStore((s) => s.jumpToScene);

  useEffect(() => {
    const urlScene = searchParams.get("scene") as SceneId | null;
    const focus = searchParams.get("focus");
    syncFromUrl(urlScene, focus);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate once from URL
  }, []);

  useEffect(() => {
    const qs = anatomySearchParams(scene, focusId);
    if (searchParams.toString() !== qs) {
      router.replace(`/?${qs}`, { scroll: false });
    }
  }, [scene, focusId, router, searchParams]);

  return (
    <div className="explorer">
      <NavigationBreadcrumbs />
      <div className="scene-tabs">
        {SCENES.map((id) => (
          <button
            key={id}
            type="button"
            className={scene === id ? "tab tab-active" : "tab"}
            onClick={() => jumpToScene(id)}
          >
            {id === "body" ? "Тело" : id === "brain" ? "Мозг" : id === "shoulder" ? "Плечо" : "Поясница"}
          </button>
        ))}
      </div>
      <div className="main-grid">
        <div className="canvas-column">
          <AnatomyCanvas />
          <StructureTree />
        </div>
        <InfoPanel />
      </div>
    </div>
  );
}
