# Anatomy Explorer

Интерактивный 3D-атлас: **мозг**, **плечевые мышцы**, **поясница** — с drill-down по клику и привязкой к Brain Protocol (DEX).

## Запуск

Из корня DEX:

```bash
npm run anatomy:dev
```

Или из этой папки (после `npm install`):

```bash
cd apps/anatomy-explorer
VAULT_PATH=../.. npm run dev
```

`VAULT_PATH` нужен для DEX analytics wrapper, если запускаете не через `npm run anatomy:dev` из корня.

Откройте http://localhost:3010

## Навигация

- **Тело** — клик на голову / плечо / поясницу → переход в сцену
- **Мозг / Плечо / Поясница** — вкладки или drill-down по mesh
- **Дерево структуры** — список слева внизу
- **Панель справа** — функции и активности из `brain-regions-activities.md`
- URL: `/?scene=brain&focus=frontal-lobe`

## Модели

По умолчанию — **placeholder-геометрия** (работает без Blender).

Для реалистичных mesh экспортируйте GLB из Z-Anatomy:

→ [`public/models/Z-ANATOMY-EXPORT.md`](public/models/Z-ANATOMY-EXPORT.md)

## Лицензии

→ [/credits](http://localhost:3010/credits) — Z-Anatomy CC BY-SA 4.0, BodyParts3D CC BY-SA 2.1 Japan
