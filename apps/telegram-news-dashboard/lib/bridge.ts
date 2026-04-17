/** Server-only bridge HTTP helpers. */

export function bridgeBaseUrl(): string {
  const u = process.env.BRIDGE_URL?.trim();
  if (!u) {
    throw new Error("BRIDGE_URL is not set");
  }
  return u.replace(/\/$/, "");
}

export function bridgeAuthHeaders(): HeadersInit {
  const secret = process.env.BRIDGE_API_SECRET;
  if (!secret) {
    throw new Error("BRIDGE_API_SECRET is not set");
  }
  return { Authorization: `Bearer ${secret}` };
}

export function publicBridgeWsBase(): string {
  const u = process.env.NEXT_PUBLIC_BRIDGE_PUBLIC_URL?.trim() || process.env.BRIDGE_URL?.trim();
  if (!u) {
    throw new Error("NEXT_PUBLIC_BRIDGE_PUBLIC_URL or BRIDGE_URL is not set");
  }
  const trimmed = u.replace(/\/$/, "");
  if (trimmed.startsWith("https://")) {
    return `wss://${trimmed.slice("https://".length)}`;
  }
  if (trimmed.startsWith("http://")) {
    return `ws://${trimmed.slice("http://".length)}`;
  }
  return trimmed.startsWith("wss://") || trimmed.startsWith("ws://") ? trimmed : `wss://${trimmed}`;
}
