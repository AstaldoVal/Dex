import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { bridgeAuthHeaders, bridgeBaseUrl } from "@/lib/bridge";

/** Proxy Telegram media from the bridge (Bearer on server; browser sends session cookie). */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("channel_key");
  const mid = req.nextUrl.searchParams.get("message_id");
  const slot = req.nextUrl.searchParams.get("slot") ?? "0";
  if (!key || !mid || !/^\d+$/.test(mid) || !/^\d+$/.test(slot)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const url = `${bridgeBaseUrl()}/media/${encodeURIComponent(key)}/${encodeURIComponent(mid)}?slot=${encodeURIComponent(slot)}`;
  try {
    const r = await fetch(url, { headers: bridgeAuthHeaders(), cache: "no-store" });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      return new NextResponse(t || r.statusText, { status: r.status });
    }
    const ct = r.headers.get("content-type") || "application/octet-stream";
    return new NextResponse(r.body, {
      status: 200,
      headers: {
        "Content-Type": ct,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "proxy_error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
