export type SceneId = "body" | "brain" | "shoulder" | "lumbar";

export type MeshShape = "box" | "sphere" | "capsule" | "cylinder";

export interface AnatomyNode {
  id: string;
  parentId: string | null;
  scene: SceneId;
  labelRu: string;
  /** Navigate to another scene on click (body hotspots). */
  drillToScene?: SceneId;
  /** Optional GLB path under /models/ */
  modelPath?: string;
  meshName?: string;
  shape?: MeshShape;
  position: [number, number, number];
  rotation?: [number, number, number];
  scale: [number, number, number];
  color: string;
  clickable: boolean;
}

export interface Exercise {
  name: string;
  /** Короткое описание выполнения: подходы/повторы/темп. */
  detail?: string;
  /** Ссылка на видео/референс (educational). */
  url?: string;
}

export interface AnatomyContent {
  /** Что делает структура — анатомическая функция. */
  functions: string;
  /** Как прокачивать: конкретные упражнения. */
  exercises?: Exercise[];
  /** Рекомендуемая частота тренировки. */
  frequency?: string;
  /** Частые проблемы, зажимы, признаки слабости/перенапряжения. */
  commonIssues?: string;
  /** Как улучшить самочувствие: мобилизация, растяжка, осанка. */
  wellbeing?: string[];
  /** Связь с протоколами DEX / Brain Protocol. */
  protocol?: string[];
  /** Насколько тренируема структура. */
  trainability?: string;
}
