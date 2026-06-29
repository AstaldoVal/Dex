import { NextResponse } from "next/server";
import { signRealtimeWsToken } from "@/lib/jwt";

export async function POST() {
  try {
    const token = await signRealtimeWsToken();
    return NextResponse.json({ token, expiresInSeconds: 600 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
