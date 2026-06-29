#!/usr/bin/env bash
# Open System Settings so python3.14 keeps Full Disk Access (launchd ≠ popup Allow).
set -euo pipefail

PY=""
for candidate in /opt/homebrew/bin/python3.14 /opt/homebrew/bin/python3; do
  if [[ -x "${candidate}" ]]; then
    PY="$(python3 -c "import os,sys; print(os.path.realpath('${candidate}'))" 2>/dev/null || realpath "${candidate}" 2>/dev/null || echo "${candidate}")"
    break
  fi
done

echo "=== macOS: python3.14 и фоновые задачи DEX ==="
echo
echo "Popup «Allow» часто НЕ сохраняется для launchd (deep-work-runner каждые 5 мин)."
echo "Нужно один раз вручную:"
echo
echo "  System Settings → Privacy & Security → Full Disk Access → +"
echo
echo "Добавь этот файл (через ⌘⇧G в диалоге выбора):"
echo
echo "  ${PY}"
echo
echo "Затем перезагрузи Mac или:"
echo "  launchctl kickstart -k gui/$(id -u)/com.dex.deep-work-runner"
echo

# Privacy & Security → Full Disk Access (works on recent macOS)
open "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_AllFiles" 2>/dev/null \
  || open "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles" 2>/dev/null \
  || open /System/Applications/System\ Settings.app
