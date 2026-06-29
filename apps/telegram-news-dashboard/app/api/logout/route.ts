import { NextResponse } from "next/server";
import { DASH_COOKIE } from "@/lib/jwt";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(DASH_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
