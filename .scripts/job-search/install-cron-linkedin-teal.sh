#!/usr/bin/env bash
# Добавляет в crontab записи: раз в 3 часа (incremental + incremental-igaming + incremental-cpo) и раз в день (full).
# Время по Португалии (Europe/Lisbon). Запуск из корня репо: ./.scripts/job-search/install-cron-linkedin-teal.sh
# Удалить: crontab -e и удалить строки с schedule-linkedin-teal-flow.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Альтернативный режим: установить launchd-планировщик вместо cron.
# Это не замена default-пути — cron остается режимом по умолчанию.
if [ "${1:-}" = "--launchd" ]; then
  echo "Режим: launchd (альтернатива cron)."
  echo "Запускаю: $SCRIPT_DIR/install-launchd-linkedin-teal.sh"
  exec /bin/bash "$SCRIPT_DIR/install-launchd-linkedin-teal.sh"
fi

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  echo "Usage:"
  echo "  ./.scripts/job-search/install-cron-linkedin-teal.sh            # установить cron (по умолчанию)"
  echo "  ./.scripts/job-search/install-cron-linkedin-teal.sh --launchd  # установить launchd (альтернатива)"
  exit 0
fi

REPO="/Users/admin.roman.matsukatov/Documents/Development/DEX/Dex"
URL="https://www.linkedin.com/jobs/search/?currentJobId=4372738622&distance=25.0&f_TPR=r86400&f_WT=2&geoId=91000007&keywords=senior%20product%20manager&origin=JOBS_HOME_KEYWORD_HISTORY"
URL_IGAMING="https://www.linkedin.com/jobs/search/?currentJobId=4373265511&f_TPR=r86400&f_WT=2&geoId=91000007&keywords=product%20manager%20igaming"
# Chief Product Officer, EMEA, Remote, Past 24h
URL_CPO="https://www.linkedin.com/jobs/search/?alertAction=viewjobs&currentJobId=4373838824&distance=25&f_TPR=r86400&f_WT=2&geoId=91000007&keywords=chief%20product%20officer&origin=JOB_SEARCH_PAGE_JOB_FILTER&refresh=true&sortBy=R"

# Env для крона (скрипт всегда подгружает этот файл)
CRON_ENV="$REPO/.scripts/job-search/cron-env.sh"
cat > "$CRON_ENV" << EOF
# Used by schedule-linkedin-teal-flow.sh when run from cron.
export VAULT_PATH="$REPO"
export LINKEDIN_SEARCH_URL="$URL"
export LINKEDIN_SEARCH_URL_IGAMING="$URL_IGAMING"
export LINKEDIN_SEARCH_URL_CPO="$URL_CPO"
EOF

# Wrapper: всегда пишет в лог до и после запуска (чтобы при любой ошибке была запись)
WRAPPER="$REPO/.scripts/job-search/cron-run-wrapper.sh"
sed "s|__REPO__|$REPO|g" "$WRAPPER" > "$WRAPPER.tmp" && mv "$WRAPPER.tmp" "$WRAPPER"
chmod +x "$WRAPPER"
chmod +x "$REPO/.scripts/job-search/schedule-linkedin-teal-flow.sh"

# Сначала echo в лог (чтобы при любом срабатывании крона была запись), затем wrapper. TZ=Europe/Lisbon.
LOG1="$REPO/00-Inbox/Job_Search/teal/incremental-cron.log"
LOG2="$REPO/00-Inbox/Job_Search/teal/incremental-igaming-cron.log"
LOG_CPO="$REPO/00-Inbox/Job_Search/teal/incremental-cpo-cron.log"
LOG3="$REPO/00-Inbox/Job_Search/teal/full-flow-cron.log"
LOG3_IGAMING="$REPO/00-Inbox/Job_Search/teal/full-flow-igaming-cron.log"
LOG3_CPO="$REPO/00-Inbox/Job_Search/teal/full-flow-cpo-cron.log"
# Раз в 3 часа: один слот :00 запускает три инкрементальных flow по очереди (senior PM -> igaming -> CPO), чтобы только один LinkedIn capture был активен.
LOG_SEQ="$REPO/00-Inbox/Job_Search/teal/incremental-sequential-cron.log"
LINE_SEQ="0 */3 * * * TZ=Europe/Lisbon /bin/bash -c 'echo \"[\$(date +\\%Y-\\%m-\\%dT\\%H:\\%M:\\%S\\%z)] Cron slot every 3h :00 incremental-sequential (3 flows in order)\" >> $LOG_SEQ; /bin/bash $REPO/.scripts/job-search/cron-run-wrapper.sh incremental-sequential >> $LOG_SEQ 2>&1'"
LINE3="0 8 * * * TZ=Europe/Lisbon /bin/bash -c 'echo \"[\$(date +\\%Y-\\%m-\\%dT\\%H:\\%M:\\%S\\%z)] Cron slot 08:00 full\" >> $LOG3; /bin/bash $REPO/.scripts/job-search/cron-run-wrapper.sh full >> $LOG3 2>&1'"
LINE3_IGAMING="10 8 * * * TZ=Europe/Lisbon /bin/bash -c 'echo \"[\$(date +\\%Y-\\%m-\\%dT\\%H:\\%M:\\%S\\%z)] Cron slot 08:10 full-igaming\" >> $LOG3_IGAMING; /bin/bash $REPO/.scripts/job-search/cron-run-wrapper.sh full-igaming >> $LOG3_IGAMING 2>&1'"
LINE3_CPO="20 8 * * * TZ=Europe/Lisbon /bin/bash -c 'echo \"[\$(date +\\%Y-\\%m-\\%dT\\%H:\\%M:\\%S\\%z)] Cron slot 08:20 full-cpo\" >> $LOG3_CPO; /bin/bash $REPO/.scripts/job-search/cron-run-wrapper.sh full-cpo >> $LOG3_CPO 2>&1'"
LINE4="40 10 * * * TZ=Europe/Lisbon /bin/bash -c 'echo \"[\$(date +\\%Y-\\%m-\\%dT\\%H:\\%M:\\%S\\%z)] Cron slot 10:40 incremental-sequential\" >> $LOG_SEQ; /bin/bash $REPO/.scripts/job-search/cron-run-wrapper.sh incremental-sequential >> $LOG_SEQ 2>&1'"
LINE5="55 11 * * * TZ=Europe/Lisbon /bin/bash -c 'echo \"[\$(date +\\%Y-\\%m-\\%dT\\%H:\\%M:\\%S\\%z)] Cron slot 11:55 incremental-sequential\" >> $LOG_SEQ; /bin/bash $REPO/.scripts/job-search/cron-run-wrapper.sh incremental-sequential >> $LOG_SEQ 2>&1'"

# Убрать старые записи (все варианты incremental/igaming/cpo и node-only), добавить новые
(crontab -l 2>/dev/null | grep -v "schedule-linkedin-teal-flow.sh" | grep -v "cron-run-wrapper.sh" | grep -v "Cron slot 11:55" | grep -v "Cron slot 11:56" | grep -v "Cron slot 11:57" | grep -v "run-incremental-linkedin-teal-flow.cjs" || true; echo "$LINE_SEQ"; echo "$LINE3"; echo "$LINE3_IGAMING"; echo "$LINE3_CPO"; echo "$LINE4"; echo "$LINE5") | crontab -

echo "Готово. Время по Португалии (Europe/Lisbon):"
echo "  - раз в 3 ч :00: incremental-sequential (senior PM -> igaming -> CPO по очереди, один capture за раз)"
echo "  - раз в день в 08:00/:10/:20: full (senior PM), full-igaming, full-cpo"
echo "  - раз в день в 10:40 и 11:55: incremental-sequential (те же три flow по очереди)"
echo ""
echo "Ссылки, по которым проходит проверка по крону:"
echo "  incremental (senior PM):     $URL"
echo "  incremental-igaming:          $URL_IGAMING"
echo "  incremental-cpo:             $URL_CPO"
echo ""
echo "Проверить: crontab -l"
