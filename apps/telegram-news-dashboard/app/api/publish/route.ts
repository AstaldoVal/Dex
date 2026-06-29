import { NextResponse } from "next/server";
import { bridgeAuthHeaders, bridgeBaseUrl } from "@/lib/bridge";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const r = await fetch(`${bridgeBaseUrl()}/publish`, {
      method: "POST",
      headers: { ...bridgeAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    return new NextResponse(text, {
      status: r.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "bridge_error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
