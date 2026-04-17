import { NextResponse } from "next/server";
import { DASH_COOKIE, signDashboardSession } from "@/lib/jwt";

export async function POST(request: Request) {
  const password = process.env.DASHBOARD_PASSWORD?.trim();
  if (!password) {
    return NextResponse.json({ ok: true, note: "no_password_configured" });
  }

  let body: { password?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (body.password !== password) {
    return NextResponse.json({ error: "invalid_password" }, { status: 401 });
  }

  const token = await signDashboardSession();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(DASH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
