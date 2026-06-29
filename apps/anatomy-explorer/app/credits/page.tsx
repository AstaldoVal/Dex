import Link from "next/link";

export default function CreditsPage() {
  return (
    <main className="credits-page">
      <Link className="credits-back" href="/">
        ← К explorer
      </Link>
      <h1>Лицензии и атрибуция</h1>
      <p>
        3D-модели для production-сборки экспортируются из открытых анатомических
        атласов. Placeholder-геометрия в приложении — собственная, для навигации до
        подключения GLB.
      </p>

      <h2>Z-Anatomy</h2>
      <p>
        <a href="https://www.z-anatomy.com/" target="_blank" rel="noreferrer">
          Z-Anatomy — The libre 3D atlas of anatomy
        </a>
        {" "}
        — CC BY-SA 4.0. Gauthier Kervyn, Marcin Zielinski.
      </p>

      <h2>BodyParts3D</h2>
      <p>
        Исходные mesh derived from BodyParts3D — Database Center for Life Science —
        CC BY-SA 2.1 Japan.
        <br />
        <a
          href="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html"
          target="_blank"
          rel="noreferrer"
        >
          dbarchive.biosciencedbc.jp — BodyParts3D
        </a>
      </p>

      <h2>Контент Brain Protocol</h2>
      <p>
        Описания функций и активностей — из личного DEX:
        Cognitive_Performance/brain-regions-activities.md (Roman Matsukatov).
      </p>

      <h2>Производные работы</h2>
      <p>
        Экспортированные GLB/STL и это приложение — производные работы. При
        распространении сохраняйте ту же лицензию (CC BY-SA) и указание авторов
        Z-Anatomy и BodyParts3D.
      </p>

      <h2>Инструкция экспорта</h2>
      <p>
        См.{" "}
        <code>public/models/Z-ANATOMY-EXPORT.md</code> в репозитории приложения.
      </p>
    </main>
  );
}
