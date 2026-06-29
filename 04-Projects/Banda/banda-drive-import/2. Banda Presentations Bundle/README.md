# Banda: презентації та мемо (локальний пакет)

Пакет лежить у проєкті «Банда» тут: `04-Projects/Banda/banda-drive-import/2. Banda Presentations Bundle/` (поруч з `1. Board/` та іншими вивантаженнями в `banda-drive-import`). **Назви папок з контентом збігаються з Google Drive** (три теки «… (Drafts)» у корені bundle). Додатково лише локально / у репо: **Obsidian vault** у корені (`.obsidian/`, `00-Index.md`, `README.md`) — на Drive за замовчуванням не заливаються; ширший аудит і backlog — у `04-Projects/Banda/obsidian-banda/`.

## Obsidian (vault у корені bundle)

- **Що зроблено:** один vault на всю теку `2. Banda Presentations Bundle/`: у корені лежать `.obsidian/app.json`, `appearance.json`, `core-plugins.json`, `graph.json` (без сторонньої теми CSS і без `workspace.json`), плюс **`00-Index.md`** як стартова нота для графа.
- **Markdown-структура (локально):** **той самий патерн, що Board** — підпапка **`Obsidian/`** поруч із «сиром» (docx, xlsx, pdf, pptx, txt як прямі дочірні файли в відповідній теці). Усередині: **`Index …`** та **`.board-card.md`** для кожного такого файлу; генерація тим самим кодом, що **`1. Board/`** (`generate_board_obsidian_cards_and_drive_upload.py`, виклик з `presentations_bundle_index_and_drive_upload.py` перед синком). Кореневий індекс пакета: **`Index Presentations bundle.md`** (ім’я кореня можна перевизначити змінною **`BANDA_PRESENTATIONS_BOARD_INDEX_ROOT_LABEL`**). Скрипт презентацій **за замовчуванням заливає на Drive** усі **`**/Obsidian/**/*.md`** з повним шляхом від кореня bundle (пропускає лише системні імена: `README.md`, `CHANGELOG.md`, `AGENTS.md`, `00-Index.md` на будь-якій глибині). Вимкнути лише заливку на Drive: **`--skip-obsidian-notes-drive`** (локальна генерація індексів і карток все одно виконується). Окремо: **`--upload-vault-meta-to-drive`** дзеркалить лише **`.obsidian/`** (без `workspace*.json`), плюс **`00-Index.md`** та **`README.md`** у **корінь** bundle на Drive.
- **Як відкрити:** Obsidian → *Open folder as vault* → виберіть локальну теку `2. Banda Presentations Bundle` (шлях у репозиторії вище).
- **Не per-deck sub-vaults:** окремі вложені vault для кожного deck не створювались; усе в одному корені пакета.
- **Google Drive (політика «лише контент»):** за замовчуванням скрипт **не** заливає на Drive **`.obsidian/`**, **`00-Index.md`**, **`README.md`** (це локальна/репо-мета, не матеріали для інвесторів). Рідкий виняток: прапор **`--upload-vault-meta-to-drive`** увімкне старе дзеркало vault-мети. Див. `.cursor/rules/banda-google-drive-content-only.mdc`.
- **Git:** `.obsidian` у bundle **не** у глобальному `.gitignore` (ігнор стосується лише шляху `.obsidian/workspace*.json` у будь-якій теці); конфіг і ноти комітяться разом з репо.

## Канон на Google Drive: «2. Banda Presentations Bundle»

**Корінь пакета на Drive (ID):** `1Aebct7orD_dyAawJYQ0IXt7Js37cB5RJ`  
**Посилання:** https://drive.google.com/drive/folders/1Aebct7orD_dyAawJYQ0IXt7Js37cB5RJ  

У корені bundle на Drive три дочірні теки в одному стилі назв «… (Drafts)» (як у веб-інтерфейсі):

- **New Primary Slide decks (Drafts)** — `17aw3mfu4uDvyrKAAPoeF88EXE9YkYG0K` — https://drive.google.com/drive/folders/17aw3mfu4uDvyrKAAPoeF88EXE9YkYG0K
- **Secondary Slide decks (Drafts)** — `1Le6E7pWCxQ-1Yt-WXCJqgDhpDFxr_Fql` — https://drive.google.com/drive/folders/1Le6E7pWCxQ-1Yt-WXCJqgDhpDFxr_Fql
- **Municipal pitch decks (Drafts)** — `1_Rl4nDZ4JBWhYfKpBUXHavFFpQg6-Kqw` — https://drive.google.com/drive/folders/1_Rl4nDZ4JBWhYfKpBUXHavFFpQg6-Kqw (pdf / pptx / txt під тими ж підпапками, що локально)

Щоб заливка memo (docx) і таблиць (xlsx) йшла в конкретну з перших **двох** тек (а не в автоматичні `docx`/`xlsx`), перед синком задайте `BANDA_PRESENTATIONS_DOCX_FOLDER_ID` та/або `BANDA_PRESENTATIONS_XLSX_FOLDER_ID` з цих ID (див. розділ нижче).

**Після наступного повного синку без прапора** скрипт знову створить або оновить на Drive дерево **`Municipal pitch decks (Drafts)/`**, якщо воно є локально з файлами `.pdf`/`.pptx`/`.txt`. Якщо на Drive у корені bundle не має бути цієї третьої теки — запускайте з **`--skip-media-decks`**:

```bash
python3 .scripts/banda/presentations_bundle_index_and_drive_upload.py --skip-media-decks
```

Видалені в корзину теки (старі `docx`, `xlsx` тощо) можна відновити з кошика Google Drive протягом обмеженого часу, якщо потрібно.

## Локальна структура = Drive + технічні файли в корені

У **корені** bundle локально ті самі три теки, що й на Drive (назви **один в один**):

1. **`New Primary Slide decks (Drafts)/`** — memo **docx** (наприклад три файли `8085_*`; нові docx класти сюди ж).
2. **`Secondary Slide decks (Drafts)/`** — таблиці **xlsx** з експорту Google Slides (див. завантаження нижче).
3. **`Municipal pitch decks (Drafts)/`** — pitch **pdf** / **pptx** / **txt** з тими ж підпапками, що на Drive.

**Окремо:** `.obsidian/` (налаштування vault), `00-Index.md`, `README.md` у **корені** bundle — на Drive за замовчуванням **не** йдуть (див. розділ «Obsidian»). Усі **`**/Obsidian/**/*.md`** (індекси Board-стилю та картки) — **на Drive йдуть** з тим самим відносним шляхом (див. той самий розділ і `presentations_bundle_index_and_drive_upload.py`).

### Звідки брати xlsx перед кладенням у `Secondary Slide decks (Drafts)/`

- Вихідне джерело на Google (інша папка): `https://drive.google.com/drive/folders/1a7E1_EqIfXv_wrvssE_fdaIWvBo-c2a9`  
- Завантажити через OAuth (`/.scripts/banda_drive_folder_download.py`, ті самі токени, що й Drive MCP) **у цю теку bundle** (шлях нижче в команді).

### Pitch / муніципалітети

У теці **`Municipal pitch decks (Drafts)/`**:

- `Pitch deck основна презентація/` — PDF RU та UK (`Ру.pdf`, `Укр.pdf`), за класифікацією Кирила: основний pitch deck.
- `Презентація для Муніціпалітета/` — `BANDA_Municipalities_Presentation.pptx` (рекомендація перевірити верстку через Google Презентації або інші переглядачі після заливки на Drive).

## Синк на Drive (що саме заливає скрипт)

**Канон структури на Drive** для цього пакета — цей README (корінь bundle, три теки «… (Drafts)», цілі для docx/xlsx через env). **Не додавати на Drive нові теки з репозиторію**, крім випадків, коли ви явно попросили змінити структуру.

**На Google Drive** скрипт `presentations_bundle_index_and_drive_upload.py` робить таке:
- **Контентні ноти:** усі **`.md`**, у шляху яких є сегмент **`Obsidian/`** (рекурсивно по всьому bundle), у відповідне дерево під коренем **`2. Banda Presentations Bundle`** на Drive з **повним** відносним шляхом; системні імена файлів зі списку вище пропускаються. Щоб **не** чіпати заливку цих файлів: **`--skip-obsidian-notes-drive`**.
- **Офісні файли з репозиторію:** лише `.docx` з **`New Primary Slide decks (Drafts)/`** та `.xlsx` з **`Secondary Slide decks (Drafts)/`** (ті самі шляхи, що на Drive). **Куди саме** (за замовчуванням **без** автоматичного `_synced-office-from-repo`):
  1. Якщо задано **`BANDA_PRESENTATIONS_DOCX_FOLDER_ID`** / **`BANDA_PRESENTATIONS_XLSX_FOLDER_ID`** (непорожні) — файли оновлюються/створюються **безпосередньо в цих папках**; скрипт **не** створює ланцюжок під bundle для відповідного типу.
  2. Якщо ID не задані — можна вказати **`BANDA_PRESENTATIONS_DOCX_FOLDER_NAME`** / **`BANDA_PRESENTATIONS_XLSX_FOLDER_NAME`**: шукаються **прямі дочірні** теки кореня **`2. Banda Presentations Bundle`** на Drive з **точною** назвою (як у веб-інтерфейсі після перейменування).
  3. **Legacy (лише за явної згоди):** якщо для типу немає ні id, ні name, але ввімкнено **`BANDA_PRESENTATIONS_LEGACY_AUTO_OFFICE_FOLDERS=1`** або прапор **`--legacy-auto-office-folders`**, тоді як раніше: плоскі **`docx/`** та **`xlsx/`** всередині **`_synced-office-from-repo/`** (або ім’я з **`BANDA_PRESENTATIONS_OFFICE_PARENT`**). **Без legacy** при наявності локальних docx/xlsx і відсутності цілей скрипт **завершиться з помилкою** і нічого не заллє (щоб не плодити неузгоджені теки).
- **Лише media (без docx/xlsx):** прапор **`--skip-docx-xlsx`** (див. `npm run banda:presentations-bundle-drive-sync:media-only` нижче) — оновлюється дерево **`Municipal pitch decks (Drafts)/`**, контентні ноти **`Obsidian/**/*.md`**, корінь bundle за потреби, без заливки офісних файлів.
- **Додатково:** повне дзеркало каталогу **`Municipal pitch decks (Drafts)/`** (підпапки з тими ж назвами, файли `.pdf`, `.pptx`, `.txt`) **безпосередньо під коренем bundle** на Drive. Це дерево не залежить від налаштувань docx/xlsx вище.
- **Vault-мета на Drive:** за замовчуванням **немає**; лише за **`--upload-vault-meta-to-drive`** (див. розділ «Obsidian»).

### Як взяти ID папки з URL Google Drive (щоб уникнути дублікатів після перейменування)

1. Відкрийте потрібну теку в браузері. URL вигляду:  
   `https://drive.google.com/drive/folders/XXXXXXXXXXXXXXXXXXXX`  
   або з додатковими параметрами — важливий сегмент **`/folders/<ID>`**.
2. Скопіюйте **`XXXXXXXXXXXXXXXXXXXX`** (довгий ідентифікатор без слешів).
3. Перед синком у тому ж терміналі:

```bash
export BANDA_PRESENTATIONS_DOCX_FOLDER_ID="вставте_ID_для_docx"
export BANDA_PRESENTATIONS_XLSX_FOLDER_ID="вставте_ID_для_xlsx"
python3 .scripts/banda/presentations_bundle_index_and_drive_upload.py
```

Можна задати лише одну змінну (наприклад, тільки xlsx), тоді інший тип лишиться в режимі за замовчуванням або за `*_FOLDER_NAME`. Якщо на Drive ви вже перейменували «docx»/«xlsx» на власні назви, **ID або точні імена** знімають проблему повторного створення старих імен поруч з вашими теками.

**Застарілі теки на Drive:** якщо після старих прогонів у **корені** bundle лишилися **`docx/`** та **`xlsx/`** поруч з чернетками (без `_synced-office-from-repo`), скрипт їх не видаляє і не переносить через API. Якщо вони порожні або дублікати — можна прибрати в корзину вручну в інтерфейсі Drive.

Текстові прев’ю для локального пошуку (не в пакеті, не на Drive): скрипт пише у `.scripts/.cache/banda-presentations-previews/` (див. нижче).

## Linear

Задача на зіставлення з питаннями аудиту: https://linear.app/inaval/issue/INA-33/banda-zistaviti-novi-prezentaciyi-ta-8085-memo-z-pitannyami-auditu

## Зміст `Secondary Slide decks (Drafts)/` (xlsx)

- `BANDA Presentations .xlsx` — структурований контент кількох вертикалей (страхові, тощо).
- `BANDA Diplomatic Deck.xlsx`, `BANDA Insurance Deck.xlsx`, `BANDA Unions Presentation.xlsx`
- `Bank Partnership Deck.xlsx`
- `Презентація для муніципалітетів.xlsx`

## Зміст `New Primary Slide decks (Drafts)/` (docx)

- `8085_business_memo_bilingual.docx`, `8085_founder_vision.docx`, `8085_stats_agency_memo.docx`

## Зв’язок з «сводним аудитом» у vault

У `04-Projects/Banda/obsidian-banda/04-Audits-and-requests/README.md` поки **TBD** для summary report і посилань на таблиці з Telegram.  
Канонічні опорні точки для аудиту в чеклисті зараз:

- **Трекер:** Board `02_Tokenomics/Audit/BANDA Final Audit Tracker.xlsx` (картка **BND-PT-003** у `master-checklist.md`).
- **Summary report:** ще без URL у README (після появи URL додати сюди і в Linear).

Поки summary report не зафіксований у vault, аналіз нових матеріалів варто вести проти:

- відкритих питань і карток з `Source-of-req: audit` у `obsidian-banda/01-Backlog/master-checklist.md`;
- `02-Sources-of-truth/METRICS_AND_NUMBERS.md` для узгодження цифр.

## Швидкі висновки (перетин з піднятими темами)

- **Інвест / use of funds (BND-INV-002 тощо):** у `8085_founder_vision` явно зафіксовано **$2M на 18 місяців** до операційного прибутку та можливість синдикату — це джерело для звірки з Board-доками, не заміна cap table.
- **Наратив для DD / «чому ринок»:** три docx дають узгоджену рамку (мікросервіси, BANDA як вхід, дані для ІІ) — корисно до блоків **стандарт-DD**, але не закривають **tokenomics** (BND-PT-002 / BND-PT-003 залишаються на трекері та xlsx Board).
- **Вертикальні GTM-історії:** xlsx з Drive розширюють картину (страхові, банк, муніципалітети, дипломатія, профспілки) — можуть відповідати на контекстні питання аудиту про **go-to-market і партнерів**, якщо такі є в трекері або в summary report.

## Оновлення з Drive

З кореня репозиторію:

```bash
VAULT_PATH=$(pwd) python3 .scripts/banda_drive_folder_download.py \
  --folder-id "1a7E1_EqIfXv_wrvssE_fdaIWvBo-c2a9" \
  --output-dir "04-Projects/Banda/banda-drive-import/2. Banda Presentations Bundle/Secondary Slide decks (Drafts)"
```

## Залити на «Мій диск» (docx + xlsx)

З кореня репозиторію (ті самі OAuth, що й для Board / Drive MCP):

```bash
python3 .scripts/banda/presentations_bundle_index_and_drive_upload.py
```

Або: `npm run banda:presentations-bundle-drive-sync`.

Якщо потрібно заливати в **вже перейменовані** теки (див. розділ «Як взяти ID папки» вище), експортуйте `BANDA_PRESENTATIONS_DOCX_FOLDER_ID` / `BANDA_PRESENTATIONS_XLSX_FOLDER_ID` перед командою.

**Тільки media (без docx/xlsx):** щоб **не** чіпати docx/xlsx на Drive і не вимагати env для них, але оновити pitch-дерево **і** контентні ноти **`Obsidian/**/*.md`**:

```bash
npm run banda:presentations-bundle-drive-sync:media-only
```

Це `python3 .scripts/banda/presentations_bundle_index_and_drive_upload.py --skip-docx-xlsx`. Якщо ще й без `Municipal pitch decks (Drafts)/` на Drive (лише ноти `Obsidian/`):

```bash
npm run banda:presentations-bundle-drive-sync:obsidian-only
```

Еквівалент: `python3 .scripts/banda/presentations_bundle_index_and_drive_upload.py --skip-docx-xlsx --skip-media-decks`.

Прибрати з кореня bundle на Drive залишки **README / 00-Index / .obsidian** після старих прогонів:

```bash
python3 .scripts/banda/drive_my_drive_root_cleanup_bundle_mistakes.py --inside-presentations-bundle --apply
python3 .scripts/banda/audit_banda_drive_meta_artifacts.py
```

У **корені «Мій диск»** зазвичай лише папка **`2. Banda Presentations Bundle`** (разом з **`1. Board`** з іншого флоу). **За замовчуванням** docx/xlsx **не** йдуть у `_synced-office-from-repo/`, доки не задано явні цілі (`*_FOLDER_ID` / `*_FOLDER_NAME`) або не увімкнено legacy (`BANDA_PRESENTATIONS_LEGACY_AUTO_OFFICE_FOLDERS=1` / `--legacy-auto-office-folders`). Звіт: `banda-drive-import/Presentations_bundle_drive_upload_report.json` (поля `office_docx_target`, `office_xlsx_target`, `legacy_auto_office_folders`, `skip_docx_xlsx`).

### Eval: після видалення `_synced-office-from-repo` на Drive

Скрипт перевіряє, що під коренем bundle **немає активної** (не в кошику) теки з іменем **`_synced-office-from-repo`** (або з `BANDA_PRESENTATIONS_OFFICE_PARENT`, якщо ви її задавали для legacy). Підходить для ручної перевірки після видалення в UI Drive або для CI.

**Прибрати теку через API** (синк її не видаляє): з кореня репо, батько — корінь «Мій диск» (`root`), шлях — дві назви тек:

```bash
python3 .scripts/banda/drive_trash_folder_by_path.py --root-id root --path "2. Banda Presentations Bundle/_synced-office-from-repo"
```

Потім знову `npm run banda:presentations-bundle:eval-no-synced-folder` (очікується exit 0).

```bash
npm run banda:presentations-bundle:eval-no-synced-folder
```

Або: `python3 .scripts/banda/eval_presentations_bundle_no_legacy_office_folder_on_drive.py`

- **Exit 0:** теки немає (очікуваний стан після прибирання).
- **Exit 1:** теку знайдено або не вдалося визначити `drive_bundle_folder_id` (див. повідомлення в stderr).
- **Exit 2:** помилка авторизації / Drive API.

Опційно: `--bundle-folder-id <id>` якщо звіт застарів; `--quiet` — лише код виходу при успіху.

Локальні плоскі `.txt` для пошуку (не комітяться як частина пакета; каталог у `.gitignore`):

```bash
# з кореня репо; потрібні python-docx та openpyxl (наприклад 04-Projects/Banda/.venv-drive)
python3 .scripts/banda_bundle_extract_previews.py
```

Вихід: `.scripts/.cache/banda-presentations-previews/*.txt`.

## Прибрати з корня «Мій диск» помилкові папки першого прогону

Чому вони з’явились: перший варіант скрипта викладав дерево `01-…` / `02-…` / `03-decks-pitch-municipal` (тепер локально та на Drive — **`Municipal pitch decks (Drafts)`**) прямо в **root**, а не всередині `2. Banda Presentations Bundle`. Поточний скрипт завантаження **не видаляє** старі об’єкти автоматично.

Щоб прибрати типові залишки (у корзину Drive, можна відновити):

```bash
python3 .scripts/banda/drive_my_drive_root_cleanup_bundle_mistakes.py --apply
```

Якщо в корені ще лежать, наприклад, `README.md` або `BANDA Final Audit Summary.docx` від того ж прогону:

```bash
python3 .scripts/banda/drive_my_drive_root_cleanup_bundle_mistakes.py --apply \
  --also-trash-names "README.md,BANDA Final Audit Summary.docx"
```

Параметр `--also-trash-names` — лише **точні імена файлів** у корені; не використовуйте для `README.md`, якщо це ваш інший файл у root.

Якщо ті самі помилкові **`01-from-google-drive`**, **`02-local-docx-8085`**, **`03-extracted-previews`** (і зайві `.md`) з’явилися **всередині** папки **`2. Banda Presentations Bundle`** на Drive (а не лише в корені диска), прибрати їх:

```bash
python3 .scripts/banda/drive_my_drive_root_cleanup_bundle_mistakes.py --inside-presentations-bundle --apply
```

`drive_bundle_folder_id` береться з `Presentations_bundle_drive_upload_report.json`. Папки **`docx`**, **`xlsx`**, **`_synced-office-from-repo`** не видаляються скриптом прибирання (прибрати зайве в корені bundle можна вручну в Drive або окремим скриптом за id). Після видалення **`_synced-office-from-repo`** запустіть eval вище, щоб зафіксувати успіх. Застарілі **`docx`/`xlsx` у корені bundle** (legacy) теж не чіпаються автоматично.
