import OpenAI from "openai";
import { NextResponse } from "next/server";
import { bridgeAuthHeaders, bridgeBaseUrl } from "@/lib/bridge";

function jsonErrorMessage(j: unknown, fallback: string): string {
  if (!j || typeof j !== "object") return fallback;
  const o = j as Record<string, unknown>;
  if (typeof o.error === "string" && o.error.trim()) return o.error;
  const d = o.detail;
  if (typeof d === "string" && d.trim()) return d;
  if (Array.isArray(d) && d.length && typeof (d[0] as { msg?: string })?.msg === "string") {
    return (d[0] as { msg: string }).msg;
  }
  return fallback;
}

const SYSTEM_UA = `Ти — редактор новин. Перепиши вхідний текст українською мовою у стилі нейтральної новини.
Збережи факти та тему; не копіюй дослівно; без агресивної риторики.
Відповідь лише текст новини, без преамбули.`;

export async function POST(request: Request) {
  let body: { text?: string; channel_key?: string; mode?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const text = (body.text || "").trim();
  if (!text) {
    return NextResponse.json({ error: "text required" }, { status: 400 });
  }

  const mode = (body.mode || process.env.REWRITE_BACKEND || "bridge").toLowerCase();

  if (mode === "openai" && process.env.OPENAI_API_KEY) {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = process.env.REWRITE_MODEL || "gpt-4o-mini";
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: SYSTEM_UA },
        { role: "user", content: `Оригінал:\n\n${text}` },
      ],
      temperature: 0.4,
    });
    const out = completion.choices[0]?.message?.content?.trim();
    if (!out) {
      return NextResponse.json({ error: "empty_completion" }, { status: 502 });
    }
    return NextResponse.json({ rewrite: out });
  }

  try {
    const r = await fetch(`${bridgeBaseUrl()}/rewrite`, {
      method: "POST",
      headers: { ...bridgeAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ text, channel_key: body.channel_key }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = jsonErrorMessage(j, r.statusText || `bridge HTTP ${r.status}`);
      return NextResponse.json({ error: msg, detail: (j as { detail?: unknown }).detail }, { status: r.status });
    }
    return NextResponse.json(j);
  } catch (e) {
    const msg = e instanceof Error ? e.message || e.name || "bridge_error" : "bridge_error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
