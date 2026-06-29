import { Suspense } from "react";
import { AnatomyExplorer } from "@/components/AnatomyExplorer";

export default function HomePage() {
  return (
    <Suspense fallback={<div className="canvas-loading">Загрузка…</div>}>
      <AnatomyExplorer />
    </Suspense>
  );
}
