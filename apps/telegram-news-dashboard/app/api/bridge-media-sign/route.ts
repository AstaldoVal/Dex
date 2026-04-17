import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { DASH_COOKIE, signMediaQueryToken, verifyDashboardSession } from "@/lib/jwt";

type Body = {
  channel_key?: string;
  message_id?: number;
  slot?: number;
};

function buildPlainPath(channelKey: string, messageId: number, slot: number): string {
  const q = new URLSearchParams({
    channel_key: channelKey,
    message_id: String(messageId),
    slot: String(slot),
  });
  return `/api/bridge-media?${q.toString()}`;
}

export async function POST(req: Request) {
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const channelKey = typeof body.channel_key === "string" ? body.channel_key.trim() : "";
  const messageId = Number(body.message_id);
  const slot = Number(body.slot ?? 0);
  if (!channelKey || !Number.isFinite(messageId) || messageId < 1 || !Number.isFinite(slot) || slot < 0) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const password = process.env.DASHBOARD_PASSWORD?.trim();
  const plain = buildPlainPath(channelKey, messageId, slot);

  if (!password) {
    return NextResponse.json({ url: plain });
  }

  const jar = await cookies();
  const sessionOk = await verifyDashboardSession(jar.get(DASH_COOKIE)?.value);
  if (!sessionOk) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const mt = await signMediaQueryToken(channelKey, messageId, slot);
  const u = new URL(plain, "http://localhost");
  u.searchParams.set("mt", mt);
  return NextResponse.json({ url: `${u.pathname}${u.search}` });
}
