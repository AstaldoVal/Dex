# Z-Anatomy → GLB export pipeline

Экспорт моделей для `anatomy-explorer`. Имена mesh **должны совпадать** с `meshName` в `src/data/anatomy-manifest.ts`.

## 1. Установка Z-Anatomy

1. [Blender](https://www.blender.org/) 4.x
2. Скачать [Z-Anatomy Template](https://github.com/Z-Anatomy/Models-of-human-anatomy)
3. Blender → Install Application Template → `Z-Anatomy.zip`
4. File → New → Z-Anatomy

Лицензия: **CC BY-SA 4.0** (Z-Anatomy) + **CC BY-SA 2.1 Japan** (BodyParts3D).

## 2. Курируемый набор

### Мозг → `public/models/brain/brain.glb`

| meshName (в GLB) | Структура |
|------------------|-----------|
| cerebrum | Большие полушария |
| cortex | Кора |
| frontal_lobe | Лобная доля |
| parietal_lobe | Теменная |
| temporal_lobe | Височная |
| occipital_lobe | Затылочная |
| subcortical | Подкорка (группа) |
| thalamus | Таламус |
| hypothalamus | Гипоталамус |
| hippocampus | Гиппокамп |
| amygdala | Амигдала |
| basal_ganglia | Базальные ганглии |
| corpus_callosum | Мозолистое тело |
| cerebellum | Мозжечок |
| cerebellar_vermis | Червь |
| cerebellar_hemispheres | Полушария мозжечка |
| brainstem | Ствол |
| midbrain | Средний мозг |
| pons | Мост |
| medulla | Продолговатый |
| reticular_formation | Ретикулярная формация |

### Плечо → `public/models/shoulder/shoulder.glb`

`deltoid_anterior`, `deltoid_lateral`, `deltoid_posterior`, `supraspinatus`, `infraspinatus`, `teres_minor`, `subscapularis`, `trapezius_upper`, `levator_scapulae`, `rhomboids`, `scapula_region` (опц.)

### Поясница → `public/models/lumbar/lumbar.glb`

`lumbar_spine`, `erector_spinae`, `multifidus`, `quadratus_lumborum`, `psoas_major`, `iliacus`, `gluteus_maximus`, `gluteus_medius`, `gluteus_minimus`

### Тело (опц.) → `public/models/body/body-overview.glb`

`hotspot_head`, `hotspot_shoulder_l`, `hotspot_shoulder_r`, `hotspot_lumbar`

## 3. Экспорт в Blender

1. Выделить нужные объекты (один mesh = одна структура)
2. Object → Rename → имя из таблицы (`meshName`)
3. File → Export → glTF 2.0 (.glb)
   - Format: **GLB**
   - Include: Selected Objects
   - Apply Modifiers: on
   - Compression: Draco (опц., меньше размер)

4. Положить файл в соответствующую папку `public/models/`

## 4. Проверка

```bash
cd apps/anatomy-explorer
npm run dev
```

Откройте сцену — если GLB найден (HTTP 200), placeholder скрывается для mesh с совпадающими именами.

```bash
node scripts/export-manifest.mjs
```

Печатает список ожидаемых `meshName` по сценам.

## 5. STL (опционально)

Для 3D-печати: тот же объект → Export → STL. В runtime приложение использует **GLB**; STL — только архив в `public/models/stl/` при необходимости.
