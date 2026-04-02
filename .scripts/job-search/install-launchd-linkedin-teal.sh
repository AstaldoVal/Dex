#!/usr/bin/env bash
# Ставит расписание через launchd (macOS): раз в 3 часа — incremental, раз в день 08:00 — full, 11:55/11:56 — daily.
# 10:40/10:41 через launchd (не cron), чтобы не было "Operation not permitted" в Documents.
# Запуск: из корня репо ./.scripts/job-search/install-launchd-linkedin-teal.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/../.." && pwd)"
URL="https://www.linkedin.com/jobs/search/?currentJobId=4372738622&distance=25.0&f_TPR=r86400&f_WT=2&geoId=91000007&keywords=senior%20product%20manager&origin=JOBS_HOME_KEYWORD_HISTORY"
URL_IGAMING="https://www.linkedin.com/jobs/search/?currentJobId=4373265511&f_TPR=r86400&f_WT=2&geoId=91000007&keywords=product%20manager%20igaming"
# Chief Product Officer, EMEA, Remote, Past 24h — та же частота, что и senior PM / igaming
URL_CPO="https://www.linkedin.com/jobs/search/?alertAction=viewjobs&currentJobId=4373838824&distance=25&f_TPR=r86400&f_WT=2&geoId=91000007&keywords=chief%20product%20officer&origin=JOB_SEARCH_PAGE_JOB_FILTER&refresh=true&sortBy=R"

# Обновляем cron-env.sh для ручных запусков и для launchd
CRON_ENV="$SCRIPT_DIR/cron-env.sh"
mkdir -p "$(dirname "$CRON_ENV")"
cat > "$CRON_ENV" << EOF
# Used by schedule-linkedin-teal-flow.sh when run from launchd or manually.
export VAULT_PATH="$REPO"
export LINKEDIN_SEARCH_URL="$URL"
export LINKEDIN_SEARCH_URL_IGAMING="$URL_IGAMING"
export LINKEDIN_SEARCH_URL_CPO="$URL_CPO"
EOF

TEAL_LOG_DIR="$REPO/00-Inbox/Job_Search/teal"
mkdir -p "$TEAL_LOG_DIR"
INC_LOG="$TEAL_LOG_DIR/incremental-cron.log"
FULL_LOG="$TEAL_LOG_DIR/full-flow-cron.log"
SCRIPT_PATH="$REPO/.scripts/job-search/schedule-linkedin-teal-flow.sh"

LAUNCH_AGENTS="$HOME/Library/LaunchAgents"
mkdir -p "$LAUNCH_AGENTS"

# XML-escape URL for plist (launchd will pass as-is to env)
# In ProgramArguments we pass literal URL; in EnvironmentVariables plist decodes &amp; -> &
URL_XML_ESC="${URL//&/&amp;}"
URL_IGAMING_XML_ESC="${URL_IGAMING//&/&amp;}"
URL_CPO_XML_ESC="${URL_CPO//&/&amp;}"

# 1) Every 3 hours: incremental :00, incremental-igaming :01, incremental-cpo :02 — node-only, лог в /tmp
LOG_TMP1="/tmp/dex-incremental-cron.log"
LOG_TMP2="/tmp/dex-incremental-igaming-cron.log"
LOG_TMP_CPO="/tmp/dex-incremental-cpo-cron.log"
NODE_INC="$REPO/.scripts/job-search/run-incremental-linkedin-teal-flow.cjs"
CMD_HOURLY_INC="export PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin; echo \"[\$(date '+%Y-%m-%dT%H:%M:%S%z')] Cron slot every 3h :00 incremental\" >> $LOG_TMP1; export VAULT_PATH=$REPO; export LINKEDIN_SEARCH_URL='$URL'; /opt/homebrew/bin/node $NODE_INC >> $LOG_TMP1 2>&1"
CMD_HOURLY_IGAMING="export PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin; echo \"[\$(date '+%Y-%m-%dT%H:%M:%S%z')] Cron slot every 3h :01 incremental-igaming\" >> $LOG_TMP2; export VAULT_PATH=$REPO; export LINKEDIN_SEARCH_URL='$URL_IGAMING'; /opt/homebrew/bin/node $NODE_INC >> $LOG_TMP2 2>&1"
CMD_HOURLY_CPO="export PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin; echo \"[\$(date '+%Y-%m-%dT%H:%M:%S%z')] Cron slot every 3h :02 incremental-cpo\" >> $LOG_TMP_CPO; export VAULT_PATH=$REPO; export LINKEDIN_SEARCH_URL='$URL_CPO'; /opt/homebrew/bin/node $NODE_INC >> $LOG_TMP_CPO 2>&1"
CMD_HOURLY_INC_XML="${CMD_HOURLY_INC//&/&amp;}"
CMD_HOURLY_IGAMING_XML="${CMD_HOURLY_IGAMING//&/&amp;}"
CMD_HOURLY_CPO_XML="${CMD_HOURLY_CPO//&/&amp;}"

# StartCalendarInterval: раз в 3 часа (0, 3, 6, 9, 12, 15, 18, 21)
HOURS_INTERVALS=""
for h in 0 3 6 9 12 15 18 21; do
  HOURS_INTERVALS="$HOURS_INTERVALS
    <dict><key>Hour</key><integer>$h</integer><key>Minute</key><integer>0</integer></dict>"
done
PLIST_INC="$LAUNCH_AGENTS/com.dex.job-search-incremental.plist"
cat > "$PLIST_INC" << PLISTINC
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.dex.job-search-incremental</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-c</string>
    <string>${CMD_HOURLY_INC_XML}</string>
  </array>
  <key>StartCalendarInterval</key>
  <array>$HOURS_INTERVALS
  </array>
  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>
PLISTINC

# 1b) Every 3 hours incremental-igaming — в :01 (0, 3, 6, 9, 12, 15, 18, 21)
HOURS_IGAMING_INTERVALS=""
for h in 0 3 6 9 12 15 18 21; do
  HOURS_IGAMING_INTERVALS="$HOURS_IGAMING_INTERVALS
    <dict><key>Hour</key><integer>$h</integer><key>Minute</key><integer>1</integer></dict>"
done
PLIST_INC_IGAMING="$LAUNCH_AGENTS/com.dex.job-search-incremental-igaming.plist"
cat > "$PLIST_INC_IGAMING" << PLISTIGAMING
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.dex.job-search-incremental-igaming</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-c</string>
    <string>${CMD_HOURLY_IGAMING_XML}</string>
  </array>
  <key>StartCalendarInterval</key>
  <array>${HOURS_IGAMING_INTERVALS}
  </array>
  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>
PLISTIGAMING

# 1c) Every 3 hours incremental-cpo — в :02 (0, 3, 6, 9, 12, 15, 18, 21)
HOURS_CPO_INTERVALS=""
for h in 0 3 6 9 12 15 18 21; do
  HOURS_CPO_INTERVALS="$HOURS_CPO_INTERVALS
    <dict><key>Hour</key><integer>$h</integer><key>Minute</key><integer>2</integer></dict>"
done
PLIST_INC_CPO="$LAUNCH_AGENTS/com.dex.job-search-incremental-cpo.plist"
cat > "$PLIST_INC_CPO" << PLISTCPO
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.dex.job-search-incremental-cpo</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-c</string>
    <string>${CMD_HOURLY_CPO_XML}</string>
  </array>
  <key>StartCalendarInterval</key>
  <array>${HOURS_CPO_INTERVALS}
  </array>
  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>
PLISTCPO

# 2) Daily full — в 08:00
PLIST_FULL="$LAUNCH_AGENTS/com.dex.job-search-full.plist"
cat > "$PLIST_FULL" << PLISTFULL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.dex.job-search-full</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>$HOME</string>
    <key>PATH</key>
    <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
    <key>VAULT_PATH</key>
    <string>$REPO</string>
    <key>LINKEDIN_SEARCH_URL</key>
    <string>$URL_XML_ESC</string>
  </dict>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$SCRIPT_PATH</string>
    <string>full</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$REPO</string>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>8</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
  <key>RunAtLoad</key>
  <false/>
  <key>StandardOutPath</key>
  <string>$FULL_LOG</string>
  <key>StandardErrorPath</key>
  <string>$FULL_LOG</string>
</dict>
</plist>
PLISTFULL

FULL_IGAMING_LOG="$TEAL_LOG_DIR/full-flow-igaming-cron.log"
FULL_CPO_LOG="$TEAL_LOG_DIR/full-flow-cpo-cron.log"

# 2b) Daily full-igaming — в 08:10 (тот же 8-step flow, URL igaming)
PLIST_FULL_IGAMING="$LAUNCH_AGENTS/com.dex.job-search-full-igaming.plist"
cat > "$PLIST_FULL_IGAMING" << PLISTFULLIG
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.dex.job-search-full-igaming</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>$HOME</string>
    <key>PATH</key>
    <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
    <key>VAULT_PATH</key>
    <string>$REPO</string>
    <key>LINKEDIN_SEARCH_URL</key>
    <string>$URL_IGAMING_XML_ESC</string>
  </dict>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$SCRIPT_PATH</string>
    <string>full-igaming</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$REPO</string>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>8</integer>
    <key>Minute</key>
    <integer>10</integer>
  </dict>
  <key>RunAtLoad</key>
  <false/>
  <key>StandardOutPath</key>
  <string>$FULL_IGAMING_LOG</string>
  <key>StandardErrorPath</key>
  <string>$FULL_IGAMING_LOG</string>
</dict>
</plist>
PLISTFULLIG

# 2c) Daily full-cpo — в 08:20 (тот же 8-step flow, URL CPO)
PLIST_FULL_CPO="$LAUNCH_AGENTS/com.dex.job-search-full-cpo.plist"
cat > "$PLIST_FULL_CPO" << PLISTFULLCPO
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.dex.job-search-full-cpo</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>$HOME</string>
    <key>PATH</key>
    <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
    <key>VAULT_PATH</key>
    <string>$REPO</string>
    <key>LINKEDIN_SEARCH_URL</key>
    <string>$URL_CPO_XML_ESC</string>
  </dict>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$SCRIPT_PATH</string>
    <string>full-cpo</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$REPO</string>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>8</integer>
    <key>Minute</key>
    <integer>20</integer>
  </dict>
  <key>RunAtLoad</key>
  <false/>
  <key>StandardOutPath</key>
  <string>$FULL_CPO_LOG</string>
  <key>StandardErrorPath</key>
  <string>$FULL_CPO_LOG</string>
</dict>
</plist>
PLISTFULLCPO

# 3) Daily 11:55, 11:56, 11:57 — incremental, incremental-igaming, incremental-cpo (node-only, log to /tmp)
NODE_INC="$REPO/.scripts/job-search/run-incremental-linkedin-teal-flow.cjs"
LOG_TMP1="/tmp/dex-incremental-cron.log"
LOG_TMP2="/tmp/dex-incremental-igaming-cron.log"
LOG_TMP_CPO="/tmp/dex-incremental-cpo-cron.log"
CMD_1155="export PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin; echo \"[\$(date '+%Y-%m-%dT%H:%M:%S%z')] Cron slot 11:55 incremental\" >> $LOG_TMP1; export VAULT_PATH=$REPO; export LINKEDIN_SEARCH_URL='$URL'; /opt/homebrew/bin/node $NODE_INC >> $LOG_TMP1 2>&1"
CMD_1156="export PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin; echo \"[\$(date '+%Y-%m-%dT%H:%M:%S%z')] Cron slot 11:56 incremental-igaming\" >> $LOG_TMP2; export VAULT_PATH=$REPO; export LINKEDIN_SEARCH_URL='$URL_IGAMING'; /opt/homebrew/bin/node $NODE_INC >> $LOG_TMP2 2>&1"
CMD_1157="export PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin; echo \"[\$(date '+%Y-%m-%dT%H:%M:%S%z')] Cron slot 11:57 incremental-cpo\" >> $LOG_TMP_CPO; export VAULT_PATH=$REPO; export LINKEDIN_SEARCH_URL='$URL_CPO'; /opt/homebrew/bin/node $NODE_INC >> $LOG_TMP_CPO 2>&1"
CMD_1155_XML="${CMD_1155//&/&amp;}"
CMD_1156_XML="${CMD_1156//&/&amp;}"
CMD_1157_XML="${CMD_1157//&/&amp;}"

PLIST_1155="$LAUNCH_AGENTS/com.dex.job-search-daily-1155.plist"
cat > "$PLIST_1155" << PLIST1155
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.dex.job-search-daily-1155</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-c</string>
    <string>${CMD_1155_XML}</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>11</integer>
    <key>Minute</key>
    <integer>55</integer>
  </dict>
  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>
PLIST1155

PLIST_1156="$LAUNCH_AGENTS/com.dex.job-search-daily-1156.plist"
cat > "$PLIST_1156" << PLIST1156
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.dex.job-search-daily-1156</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-c</string>
    <string>${CMD_1156_XML}</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>11</integer>
    <key>Minute</key>
    <integer>56</integer>
  </dict>
  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>
PLIST1156

PLIST_1157="$LAUNCH_AGENTS/com.dex.job-search-daily-1157.plist"
cat > "$PLIST_1157" << PLIST1157
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.dex.job-search-daily-1157</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-c</string>
    <string>${CMD_1157_XML}</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>11</integer>
    <key>Minute</key>
    <integer>57</integer>
  </dict>
  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>
PLIST1157

# Убрать cron, чтобы не дублировать
(crontab -l 2>/dev/null | grep -v "schedule-linkedin-teal-flow.sh" || true) | crontab - 2>/dev/null || true

# Загрузить агенты (перезагрузить, если уже были)
launchctl unload "$PLIST_INC" 2>/dev/null || true
launchctl unload "$PLIST_INC_IGAMING" 2>/dev/null || true
launchctl unload "$PLIST_INC_CPO" 2>/dev/null || true
launchctl unload "$PLIST_FULL" 2>/dev/null || true
launchctl unload "$PLIST_FULL_IGAMING" 2>/dev/null || true
launchctl unload "$PLIST_FULL_CPO" 2>/dev/null || true
launchctl unload "$LAUNCH_AGENTS/com.dex.job-search-daily-1040.plist" 2>/dev/null || true
launchctl unload "$LAUNCH_AGENTS/com.dex.job-search-daily-1041.plist" 2>/dev/null || true
launchctl unload "$PLIST_1155" 2>/dev/null || true
launchctl unload "$PLIST_1156" 2>/dev/null || true
launchctl unload "$PLIST_1157" 2>/dev/null || true
launchctl load -w "$PLIST_INC"
launchctl load -w "$PLIST_INC_IGAMING"
launchctl load -w "$PLIST_INC_CPO"
launchctl load -w "$PLIST_FULL"
launchctl load -w "$PLIST_FULL_IGAMING"
launchctl load -w "$PLIST_FULL_CPO"
launchctl load -w "$PLIST_1155"
launchctl load -w "$PLIST_1156"
launchctl load -w "$PLIST_1157"

echo "Готово. Launchd установлен (cron снят):"
echo "  - раз в 3 ч :00/:01/:02: incremental, incremental-igaming, incremental-cpo (одновременно)"
echo "  - full: ежедневно 08:00 (senior PM), 08:10 (igaming), 08:20 (CPO)"
echo "  - daily 11:55 / 11:56 / 11:57: senior PM, igaming, CPO"
echo ""
echo "Ссылки проверки:"
echo "  incremental:        $URL"
echo "  incremental-igaming: $URL_IGAMING"
echo "  incremental-cpo:     $URL_CPO"
echo ""
echo "Проверить: launchctl list | grep dex"
echo "Проверка слотов: bash .scripts/job-search/verify-cron-ran.sh 11:55  и  11:56  и  11:57"
