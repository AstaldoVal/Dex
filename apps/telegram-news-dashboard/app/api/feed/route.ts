import { NextResponse } from "next/server";
import { bridgeAuthHeaders, bridgeBaseUrl } from "@/lib/bridge";
import { nextResponseFromUpstreamBridge } from "@/lib/bridge-upstream";

export async function GET() {
  try {
    const r = await fetch(`${bridgeBaseUrl()}/feed`, {
      headers: bridgeAuthHeaders(),
      cache: "no-store",
    });
    const text = await r.text();
    return nextResponseFromUpstreamBridge(r, text);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "bridge_error";
    return NextResponse.json({ error: msg, channels: {} }, { status: 502 });
  }
}
