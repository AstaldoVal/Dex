# Teal Chrome profiles: параллельный запуск

Чтобы несколько Teal-скриптов (match-score, resume-for-job, batch, complete-jobs-flow) не конфликтовали по одному профилю Chrome и не вызывали ошибку «Something went wrong when opening your profile», у каждого типа скрипта свой профиль по умолчанию.

## Профили по умолчанию (без TEAL_CHROME_PROFILE)

- **teal-resume-match-score.cjs** → `00-Inbox/Job_Search/teal/.chrome-profile-matchscore`
- **teal-resume-for-job.cjs** → `00-Inbox/Job_Search/teal/.chrome-profile-resume`
- **teal-resume-batch-from-export.cjs** (дочерние вызовы resume-for-job) → `00-Inbox/Job_Search/teal/.chrome-profile-batch`
- **teal-complete-jobs-flow.cjs** → `00-Inbox/Job_Search/teal/.chrome-profile-complete`
- **run-teal-catch-up.cjs** → `00-Inbox/Job_Search/teal/.chrome-profile-catchup` (как и раньше)
- **run-incremental-linkedin-teal-flow.cjs** → `TEAL_CHROME_PROFILE_HOURLY` (`.chrome-profile-hourly`)

При первом запуске в новом профиле один раз войдите в Teal в открывшемся окне Chrome.

## Переопределение

Чтобы использовать один конкретный профиль (например, основной Chrome):  
`TEAL_CHROME_PROFILE=/path/to/profile node .scripts/job-search/teal-resume-match-score.cjs ...`

Пути профилей заданы в `.scripts/job-search/job-search-paths.cjs`.
