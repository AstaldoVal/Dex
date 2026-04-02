#!/usr/bin/env bash
# Выгрузка папки PM-скиллов в отдельный Git-репозиторий.
# Использование: ./.scripts/pm-skills-export-to-repo.sh [каталог-назначения]
# По умолчанию: ../product-management-skills (рядом с текущим vault).
# Репозиторий: https://github.com/AstaldoVal/product-management-skills

set -e
VAULT_ROOT="${VAULT_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
PM_SRC="${VAULT_ROOT}/.claude/skills/pm"
DEST="${1:-${VAULT_ROOT}/../product-management-skills}"

if [[ ! -d "$PM_SRC" ]]; then
  echo "Error: PM skills folder not found: $PM_SRC"
  exit 1
fi

mkdir -p "$DEST"
rsync -a --delete \
  --exclude='External' \
  --exclude='.sources' \
  --exclude='.git' \
  --exclude='.DS_Store' \
  "$PM_SRC/" "$DEST/"

echo "Exported PM skills to: $DEST"
echo ""
echo "Next steps to push to GitHub:"
echo "  cd $DEST"
echo "  git init   # if not already a git repo"
echo "  git add ."
echo "  git commit -m 'Initial: PM skills from multiple sources'"
echo "  git remote add origin https://github.com/AstaldoVal/product-management-skills.git"
echo "  git branch -M main"
echo "  git push -u origin main"
echo ""
echo "If the repo already exists and is empty, clone it first then copy:"
echo "  git clone https://github.com/AstaldoVal/product-management-skills.git $DEST"
echo "  # then run this script again with $DEST, then cd $DEST && git add . && git commit -m '...' && git push"
