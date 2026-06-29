#!/usr/bin/env bash
# Обёртка: скрипт обновления PM-скиллов перенесён в папку скиллов.
# Запуск: из корня vault — ./.scripts/pm-skills-update.sh
# Или напрямую: ./Skills_library/pm/update.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VAULT_ROOT="${VAULT_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
exec "$VAULT_ROOT/Skills_library/pm/update.sh"
