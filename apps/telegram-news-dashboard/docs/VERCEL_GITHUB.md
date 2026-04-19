# Vercel + GitHub: автодеплой при кожному push

Репозиторій: **https://github.com/AstaldoVal/telegram-dashboard**

## Перший раз: підключити проєкт до GitHub

1. Увійдіть у [Vercel](https://vercel.com) → **Add New…** → **Project**.
2. **Import Git Repository** → оберіть `AstaldoVal/telegram-dashboard` (потрібен доступ GitHub до Vercel).
3. **Root Directory** залиште **`.`** (корінь репозиторію — це вже Next.js app).
4. **Framework Preset:** Next.js (визначиться автоматично).
5. Додайте **Environment Variables** з [.env.example](../.env.example) (або скопіюйте з існуючого проєкту на Vercel).
6. Натисніть **Deploy**.

## Переконатися, що кожен push у `main` дає production build

1. Vercel → ваш проєкт → **Settings** → **Git**.
2. **Connected Git Repository** має показувати `AstaldoVal/telegram-dashboard`.
3. **Production Branch** = `main` (або ваша гілка production).
4. Увімкнено **Automatic deployments from Git** (за замовчуванням увімкнено для production branch).

Після цього будь-який `git push origin main` запускає новий deployment без Deploy Hook.

## Якщо проєкт уже існував без GitHub

**Settings** → **Git** → **Disconnect** (якщо треба) → **Connect Git Repository** → оберіть цей репозиторій. Переконайтеся, що не залишився старий root `apps/telegram-news-dashboard` з монорепо — для цього репо root = `/`.

## Deploy Hook (опційно, для Dex-скриптів)

**Settings** → **Git** → **Deploy Hooks** → створіть hook для **Production**. URL збережіть у `VERCEL_DEPLOY_HOOK_URL` у секретах Dex — скрипт `telegram-news-dashboard-ship.cjs` зможе тригерити збірку після push з іншої машини.
