# PPTX Preview в Cursor

Расширение **PPTX Preview** (Corotata) позволяет просматривать `.pptx` файлы прямо в редакторе Cursor без внешних программ.

## Почему установка вручную

Cursor использует Open VSX Registry, а не VS Code Marketplace. Расширение Corotata.pptx-preview есть только в Marketplace, поэтому автоматический `cursor --install-extension Corotata.pptx-preview` не срабатывает.

## Установка

### Вариант 1: Через Extensions в Cursor

1. Откройте [VS Code Marketplace: PPTX Preview](https://marketplace.visualstudio.com/items?itemName=Corotata.pptx-preview)
2. Справа нажмите **Download Extension** (или скачайте .vsix по ссылке)
3. В Cursor: Extensions (Cmd+Shift+X) → три точки → **Install from VSIX…** → выберите файл

### Вариант 2: Скрипт (если CLI cursor доступен)

```bash
# Из корня Dex
./.scripts/install-pptx-preview.sh
```

Скрипт скачивает VSIX с Marketplace и устанавливает в Cursor.

## Использование

- Откройте `.pptx` в проводнике — предпросмотр откроется в редакторе
- Если файл открывается бинарно: ПКМ → **Open With…** → **PPTX Preview**
- Прокрутка мыши — переключение слайдов
