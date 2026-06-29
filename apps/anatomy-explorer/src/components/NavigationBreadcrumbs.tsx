"use client";

import { NODE_BY_ID } from "@/data/anatomy-manifest";
import { getBreadcrumbIds } from "@/lib/navigation";
import { useAnatomyStore } from "@/lib/anatomy-store";

export function NavigationBreadcrumbs() {
  const focusId = useAnatomyStore((s) => s.focusId);
  const focus = useAnatomyStore((s) => s.focus);
  const goBack = useAnatomyStore((s) => s.goBack);
  const reset = useAnatomyStore((s) => s.reset);
  const navStack = useAnatomyStore((s) => s.navStack);

  const crumbs = getBreadcrumbIds(focusId);

  return (
    <header className="top-bar">
      <nav className="breadcrumbs" aria-label="Навигация">
        {crumbs.map((id, i) => (
          <span key={id} className="crumb">
            {i > 0 && <span className="crumb-sep">›</span>}
            <button
              type="button"
              className={id === focusId ? "crumb-active" : "crumb-link"}
              onClick={() => focus(id)}
            >
              {NODE_BY_ID[id]?.labelRu ?? id}
            </button>
          </span>
        ))}
      </nav>
      <div className="top-actions">
        <button type="button" className="btn" onClick={goBack} disabled={navStack.length === 0}>
          ← Назад
        </button>
        <button type="button" className="btn btn-ghost" onClick={reset}>
          Сброс
        </button>
        <a className="btn btn-ghost" href="/credits">
          Лицензии
        </a>
      </div>
    </header>
  );
}
