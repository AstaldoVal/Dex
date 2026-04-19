import { NextResponse } from "next/server";
import { bridgeAuthHeaders, bridgeBaseUrl } from "@/lib/bridge";
import { nextResponseFromUpstreamBridge } from "@/lib/bridge-upstream";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const r = await fetch(`${bridgeBaseUrl()}/channels/watch`, {
      method: "POST",
      headers: { ...bridgeAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const text = await r.text();
    return nextResponseFromUpstreamBridge(r, text);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "bridge_error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
