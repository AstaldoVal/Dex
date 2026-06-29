import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { DASH_COOKIE, verifyDashboardSession, verifyMediaQueryToken } from "@/lib/jwt";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/login") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const password = process.env.DASHBOARD_PASSWORD?.trim();
  if (!password) {
    return NextResponse.next();
  }

  const ok = await verifyDashboardSession(request.cookies.get(DASH_COOKIE)?.value);
  if (ok) {
    return NextResponse.next();
  }

  /* <img>/<video> often do not attach HttpOnly session cookies; allow signed `mt` on media proxy. */
  if (pathname.startsWith("/api/bridge-media") && request.method === "GET") {
    const mt = request.nextUrl.searchParams.get("mt");
    const key = request.nextUrl.searchParams.get("channel_key");
    const mid = request.nextUrl.searchParams.get("message_id");
    const sl = request.nextUrl.searchParams.get("slot") ?? "0";
    if (mt && key && mid && (await verifyMediaQueryToken(mt, key, mid, sl))) {
      return NextResponse.next();
    }
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
