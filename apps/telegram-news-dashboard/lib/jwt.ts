import { SignJWT, jwtVerify } from "jose";

const DASH_COOKIE = "tn_dashboard";
const AUD_WS = "telegram-news-ws";
const AUD_DASH = "telegram-news-dashboard";
const AUD_MEDIA = "telegram-news-media";

function encoder(secret: string) {
  return new TextEncoder().encode(secret);
}

export function jwtSigningSecret(): Uint8Array {
  const s =
    process.env.DASHBOARD_SESSION_SECRET ||
    process.env.BRIDGE_JWT_SECRET ||
    process.env.BRIDGE_API_SECRET;
  if (!s) {
    throw new Error("Set DASHBOARD_SESSION_SECRET or BRIDGE_JWT_SECRET or BRIDGE_API_SECRET");
  }
  return encoder(s);
}

export async function signDashboardSession(): Promise<string> {
  return new SignJWT({ role: "viewer" })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(AUD_DASH)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(jwtSigningSecret());
}

export async function verifyDashboardSession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, jwtSigningSecret(), { audience: AUD_DASH });
    return true;
  } catch {
    return false;
  }
}

export async function signRealtimeWsToken(): Promise<string> {
  return new SignJWT({ scope: "feed" })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(AUD_WS)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(jwtSigningSecret());
}

/** Short-lived token so `<img src>` / `<video src>` can load without HttpOnly session cookie. */
export async function signMediaQueryToken(
  channelKey: string,
  messageId: number,
  slot: number
): Promise<string> {
  return new SignJWT({
    ck: channelKey,
    mid: messageId,
    slot,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(AUD_MEDIA)
    .setIssuedAt()
    .setExpirationTime("45m")
    .sign(jwtSigningSecret());
}

export async function verifyMediaQueryToken(
  token: string,
  channelKey: string,
  messageId: string,
  slot: string
): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, jwtSigningSecret(), { audience: AUD_MEDIA });
    return (
      payload.ck === channelKey &&
      String(payload.mid) === messageId &&
      String(payload.slot) === slot
    );
  } catch {
    return false;
  }
}

export { DASH_COOKIE };
