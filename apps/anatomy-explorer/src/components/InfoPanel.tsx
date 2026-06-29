"use client";

import { ANATOMY_CONTENT } from "@/data/anatomy-content";
import { NODE_BY_ID, SCENE_LABELS } from "@/data/anatomy-manifest";
import { useAnatomyStore } from "@/lib/anatomy-store";

export function InfoPanel() {
  const scene = useAnatomyStore((s) => s.scene);
  const focusId = useAnatomyStore((s) => s.focusId);
  const hoverId = useAnatomyStore((s) => s.hoverId);

  const displayId = hoverId ?? focusId;
  const node = NODE_BY_ID[displayId];
  const content = ANATOMY_CONTENT[displayId];

  if (!node) return null;

  return (
    <aside className="info-panel">
      <p className="info-scene">{SCENE_LABELS[scene]}</p>
      <h2 className="info-title">{node.labelRu}</h2>
      {content?.functions && <p className="info-body">{content.functions}</p>}
      {content?.trainability && (
        <p className="info-meta">
          <span className="info-label">Тренируемость:</span> {content.trainability}
        </p>
      )}
      {content?.frequency && (
        <p className="info-meta">
          <span className="info-label">Частота:</span> {content.frequency}
        </p>
      )}
      {content?.exercises && content.exercises.length > 0 && (
        <div className="info-section">
          <p className="info-label">Как прокачивать</p>
          <ul className="info-exercises">
            {content.exercises.map((ex) => (
              <li key={ex.name}>
                {ex.url ? (
                  <a href={ex.url} target="_blank" rel="noopener noreferrer">
                    {ex.name}
                  </a>
                ) : (
                  <span className="ex-name">{ex.name}</span>
                )}
                {ex.detail && <span className="ex-detail"> — {ex.detail}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {content?.wellbeing && content.wellbeing.length > 0 && (
        <div className="info-section">
          <p className="info-label">Для самочувствия</p>
          <ul className="info-wellbeing">
            {content.wellbeing.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
      {content?.commonIssues && (
        <p className="info-issues">
          <span className="info-label">Частые проблемы:</span> {content.commonIssues}
        </p>
      )}
      {content?.protocol && content.protocol.length > 0 && (
        <div className="info-protocol">
          <p className="info-label">Из протоколов DEX:</p>
          <ul>
            {content.protocol.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
      {node.drillToScene && (
        <p className="info-hint">Клик — открыть сцену «{SCENE_LABELS[node.drillToScene]}»</p>
      )}
      {node.clickable && !node.drillToScene && (
        <p className="info-hint">Клик — углубиться в подструктуры</p>
      )}
    </aside>
  );
}
