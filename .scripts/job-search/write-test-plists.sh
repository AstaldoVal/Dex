#!/bin/bash
REPO="/Users/admin.roman.matsukatov/Documents/Development/DEX/Dex"
URL="https://www.linkedin.com/jobs/search/?currentJobId=4372738622&distance=25.0&f_TPR=r86400&f_WT=2&geoId=91000007&keywords=senior%20product%20manager&origin=JOBS_HOME_KEYWORD_HISTORY"
URL_IGAMING="https://www.linkedin.com/jobs/search/?currentJobId=4373265511&f_TPR=r86400&f_WT=2&geoId=91000007&keywords=product%20manager%20igaming"
NODE_SCRIPT="$REPO/.scripts/job-search/run-incremental-linkedin-teal-flow.cjs"
LAUNCH_AGENTS="$HOME/Library/LaunchAgents"
# For XML plist we need & as &amp;
URL_ESC="${URL//&/&amp;}"
URL_IGAMING_ESC="${URL_IGAMING//&/&amp;}"

# URL in single quotes so & not interpreted by bash
CMD08="export PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin; echo \"[\$(date '+%Y-%m-%dT%H:%M:%S%z')] Cron slot 13:16 incremental\" >> /tmp/dex-incremental-cron.log; export VAULT_PATH=$REPO; export LINKEDIN_SEARCH_URL='$URL'; /opt/homebrew/bin/node $NODE_SCRIPT >> /tmp/dex-incremental-cron.log 2>&1"
CMD09="export PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin; echo \"[\$(date '+%Y-%m-%dT%H:%M:%S%z')] Cron slot 13:17 incremental-igaming\" >> /tmp/dex-incremental-igaming-cron.log; export VAULT_PATH=$REPO; export LINKEDIN_SEARCH_URL='$URL_IGAMING'; /opt/homebrew/bin/node $NODE_SCRIPT >> /tmp/dex-incremental-igaming-cron.log 2>&1"

# Escape & in CMD for XML: & -> &amp;
CMD08_XML="${CMD08//&/&amp;}"
CMD09_XML="${CMD09//&/&amp;}"

cat > "$LAUNCH_AGENTS/com.dex.job-search-test-1308.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.dex.job-search-test-1308</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-c</string>
    <string>${CMD08_XML}</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>13</integer>
    <key>Minute</key>
    <integer>16</integer>
  </dict>
  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>
EOF

cat > "$LAUNCH_AGENTS/com.dex.job-search-test-1309.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.dex.job-search-test-1309</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-c</string>
    <string>${CMD09_XML}</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>13</integer>
    <key>Minute</key>
    <integer>17</integer>
  </dict>
  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>
EOF

launchctl unload "$LAUNCH_AGENTS/com.dex.job-search-test-1308.plist" 2>/dev/null
launchctl unload "$LAUNCH_AGENTS/com.dex.job-search-test-1309.plist" 2>/dev/null
launchctl load -w "$LAUNCH_AGENTS/com.dex.job-search-test-1308.plist"
launchctl load -w "$LAUNCH_AGENTS/com.dex.job-search-test-1309.plist"
echo "Plists written and loaded"
