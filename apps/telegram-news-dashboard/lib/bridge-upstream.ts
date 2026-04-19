import { NextResponse } from "next/server";

/**
 * Cloudflare повертає HTML (наприклад 530), коли quick tunnel не досягає cloudflared.
 * Дашборд очікує JSON — перетворюємо на зрозумілу помилку.
 */
export function bridgeTunnelErrorMessage(status: number): string {
  switch (status) {
    case 530:
    case 522:
    case 523:
      return "Тунель до bridge недоступний (Cloudflare не бачить origin). Запустіть на машині з Dex: bridge + cloudflared, потім з кореня репозиторію `source System/Secrets/dex-vercel-token.sh && node .scripts/telegram-news-stack-restart.cjs` — оновляться BRIDGE_URL і NEXT_PUBLIC_* на Vercel.";
    case 524:
    case 504:
      return "Таймаут з’єднання з bridge. Перевірте, чи працює локальний процес і тунель.";
    default:
      if (status >= 500) {
        return `Bridge повернув HTTP ${status}. Перевірте BRIDGE_URL на Vercel і доступність тунелю з інтернету.`;
      }
      return `HTTP ${status}`;
  }
}

/** Якщо upstream не JSON (типово HTML від CF) — віддаємо JSON з полем error. */
export function nextResponseFromUpstreamBridge(r: Response, text: string): NextResponse {
  const trimmed = text.trim();
  const looksJson = trimmed.startsWith("{") || trimmed.startsWith("[");
  if (!r.ok && !looksJson) {
    const error = bridgeTunnelErrorMessage(r.status);
    return NextResponse.json(
      { error, detail: `upstream_http_${r.status}` },
      { status: 503, headers: { "X-Bridge-Upstream-Status": String(r.status) } }
    );
  }
  return new NextResponse(text, {
    status: r.status,
    headers: { "Content-Type": "application/json" },
  });
}
