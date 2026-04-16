# Superpowers в Dex (vault)

В репозиторий Dex добавлен **git submodule** с upstream [obra/superpowers](https://github.com/obra/superpowers): методология и библиотека скиллов (TDD, отладка, планы, сабагенты и др.).

## Где лежит код

- Путь в vault: `06-Resources/External/superpowers/`
- Конфиг submodule: корневой файл `.gitmodules`

## После клона Dex на новой машине

Из корня репозитория Dex:

1. `git submodule update --init --recursive 06-Resources/External/superpowers`

Если клонировали без submodules сразу:

1. `git submodule update --init --recursive`

## Обновить Superpowers до последнего main

Из корня Dex:

1. `git -C 06-Resources/External/superpowers fetch origin`
2. `git -C 06-Resources/External/superpowers checkout main && git -C 06-Resources/External/superpowers pull`
3. Закоммитить в Dex обновлённый указатель submodule: `git add 06-Resources/External/superpowers` и коммит с сообщением вроде `chore: bump superpowers submodule`.

Альтернатива одной командой (если настроен tracking branch у submodule):

1. `git submodule update --remote 06-Resources/External/superpowers`

## Cursor: использовать копию из vault

Плагин в репозитории Superpowers описан в `06-Resources/External/superpowers/.cursor-plugin/plugin.json` (скиллы, агенты, команды, hooks).

Практический вариант:

1. Открыть в Cursor настройки плагинов (Plugin marketplace / установка с диска в зависимости от версии Cursor).
2. Установить плагин **с локальной папки**, указав каталог, в котором лежит `plugin.json`, то есть: `06-Resources/External/superpowers/.cursor-plugin` (относительно корня Dex; в UI может понадобиться абсолютный путь к этой папке на диске).

Так вы держите одну версию Superpowers **внутри vault** и при желании синхронизируете её submodule-ом; маркетплейсный `/add-plugin superpowers` при этом не обязателен (может дублировать скиллы, если включить оба источника).

## Claude Code / другие агенты

Официальные варианты установки (marketplace, marketplace obra) описаны в `06-Resources/External/superpowers/README.md`. Локальный submodule удобен как единый источник правды и для symlink/copy в среду агента, если вы так настраиваете workspace.

## Лицензия upstream

MIT, см. `06-Resources/External/superpowers/LICENSE`.
