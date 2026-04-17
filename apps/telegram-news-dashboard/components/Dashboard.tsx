"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const BUILD_SHA = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.trim() ?? "";

type MediaItem = {
  kind: string;
  mime?: string | null;
  /** Telegram message id this slot belongs to (bridge /media/...). */
  message_id?: number | null;
  source_message_id?: number | null;
  source_slot?: number | null;
};

type Post = {
  channel_key: string;
  channel_title: string;
  message_id: number;
  date: string;
  text: string;
  text_html?: string | null;
  telegram_url?: string | null;
  media?: MediaItem[] | null;
  grouped_id?: number | null;
  invert_media?: boolean | null;
};

type ChannelsMap = Record<string, Post[]>;

/** ISO / RFC3339 from bridge → локальная дата и время (читаемо). */
function formatPostDate(iso: string): string {
  const raw = iso?.trim();
  if (!raw) return "—";
  const t = Date.parse(raw);
  if (Number.isNaN(t)) return raw;
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(t));
  } catch {
    return new Date(t).toLocaleString();
  }
}

function wsBaseFromEnv(): string {
  const u = process.env.NEXT_PUBLIC_BRIDGE_PUBLIC_URL?.trim();
  if (!u) {
    return "";
  }
  const t = u.replace(/\/$/, "");
  if (t.startsWith("https://")) return `wss://${t.slice("https://".length)}`;
  if (t.startsWith("http://")) return `ws://${t.slice("http://".length)}`;
  return t;
}

function postKey(p: Post): string {
  const gid = p.grouped_id;
  if (gid != null && gid !== 0) {
    return `${p.channel_key}:group:${gid}`;
  }
  return `${p.channel_key}:${p.message_id}`;
}

/** Merge album parts (same grouped_id) into one card; preserve newest-first order. */
function mergePostGroup(group: Post[]): Post {
  const sorted = [...group].sort((a, b) => a.message_id - b.message_id);
  const ids = sorted.map((g) => g.message_id);
  const primary = sorted.reduce((best, cur) =>
    (cur.text ?? "").trim().length > (best.text ?? "").trim().length ? cur : best
  );
  const media: MediaItem[] = [];
  for (const g of sorted) {
    const items = g.media ?? [];
    for (let slot = 0; slot < items.length; slot++) {
      const it = items[slot]!;
      const srcMid = it.message_id ?? it.source_message_id ?? g.message_id;
      media.push({
        ...it,
        source_message_id: srcMid,
        source_slot: slot,
      });
    }
  }
  const gid = primary.grouped_id ?? sorted[0]?.grouped_id ?? null;
  const invert_media = sorted.some((x) => x.invert_media === true);
  const maxId = Math.max(...ids);
  const titleCandidates = sorted
    .map((g) => g.channel_title?.trim())
    .filter((t): t is string => Boolean(t));
  const mergedChannelTitle =
    titleCandidates.length > 0
      ? titleCandidates.reduce((a, b) => (b.length > a.length ? b : a))
      : (primary.channel_title ?? "").trim();

  return {
    ...primary,
    message_id: maxId,
    grouped_id: gid,
    media,
    invert_media,
    channel_title: mergedChannelTitle || primary.channel_title,
    text: primary.text ?? "",
    text_html: primary.text_html,
    telegram_url: primary.telegram_url,
  };
}

function mergeChannelPosts(raw: Post[]): Post[] {
  if (!raw.length) return raw;
  const sorted = [...raw].sort((a, b) => b.message_id - a.message_id);
  const byGid = new Map<number, Post[]>();
  for (const p of sorted) {
    const g = p.grouped_id;
    if (g != null && g !== 0) {
      const arr = byGid.get(g) ?? [];
      arr.push(p);
      byGid.set(g, arr);
    }
  }
  const consumed = new Set<number>();
  const out: Post[] = [];
  for (const p of sorted) {
    const g = p.grouped_id;
    if (g != null && g !== 0) {
      if (consumed.has(g)) continue;
      consumed.add(g);
      out.push(mergePostGroup(byGid.get(g) ?? [p]));
    } else {
      out.push(p);
    }
  }
  return out;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Prefer server-built Telegram HTML; fallback for older payloads. */
function postBodyHtml(post: Post): string {
  const h = post.text_html?.trim();
  if (h) return h;
  const t = post.text?.trim();
  if (!t && (post.media?.length ?? 0) > 0) return "";
  if (!t) return "—";
  return escapeHtml(t).replace(/\n/g, "<br/>");
}

/** Default titles for `NEWS_SOURCE_MAP` keys (Dex bridge defaults). Overridden by `NEXT_PUBLIC_CHANNEL_LABELS`. */
const DEFAULT_CHANNEL_LABELS: Record<string, string> = {
  uaonlii: "Ua Onlii",
  /** Часта опечатка в `NEWS_SOURCE_MAP`: `uasonli` замість `uaonlii`. */
  uasonli: "Ua Onlii",
  real_kyiv: "Реальний Київ | Украина",
};

let cachedChannelLabels: Record<string, string> | null = null;

function channelLabelsFromEnv(): Record<string, string> {
  if (cachedChannelLabels !== null) return cachedChannelLabels;
  try {
    const raw = process.env.NEXT_PUBLIC_CHANNEL_LABELS?.trim();
    cachedChannelLabels = raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    cachedChannelLabels = {};
  }
  return cachedChannelLabels;
}

function mergedChannelLabelMap(): Record<string, string> {
  return { ...DEFAULT_CHANNEL_LABELS, ...channelLabelsFromEnv() };
}

/** Human column title: built-in + env map, then any post title that is not the slug, then longest title. */
function columnHeading(posts: Post[] | undefined, key: string): string {
  const map = mergedChannelLabelMap();
  const mapped = map[key]?.trim() || map[key.toLowerCase()]?.trim();
  if (mapped) return mapped;

  if (!posts?.length) return key;

  const titles = posts
    .map((p) => p.channel_title?.trim())
    .filter((t): t is string => Boolean(t));
  if (!titles.length) return key;

  const slug = key.toLowerCase();
  const human = titles.find((t) => t.toLowerCase() !== slug);
  if (human) return human;

  return titles.reduce((a, b) => (b.length > a.length ? b : a));
}

function bridgeMediaSrc(channelKey: string, messageId: number, slot: number): string {
  const q = new URLSearchParams({
    channel_key: channelKey,
    message_id: String(messageId),
    slot: String(slot),
  });
  return `/api/bridge-media?${q.toString()}`;
}

function telegramEmbedSrc(telegramUrl: string): string | null {
  const u = telegramUrl.trim();
  if (!/^https:\/\/t\.me\//i.test(u)) return null;
  if (/[?&]embed=1(?:&|$)/.test(u)) return u;
  return u.includes("?") ? `${u}&embed=1` : `${u}?embed=1`;
}

/** When bridge did not attach media slots, still show the post visually (Telegram widget). */
function PostTelegramEmbed({ url }: { url: string }) {
  const src = telegramEmbedSrc(url);
  if (!src) return null;
  return (
    <div className="tg-embed-wrap my-2 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
      <iframe
        title="Telegram"
        src={src}
        className="tg-embed-frame block h-[min(380px,50vh)] w-full border-0"
        loading="lazy"
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
      />
    </div>
  );
}

/** Plain `/api/bridge-media`; on 401 (HttpOnly cookie не йде з `<img>`) — підписаний `mt` через POST. */
function BridgeMediaImage({
  channelKey,
  messageId,
  slot,
}: {
  channelKey: string;
  messageId: number;
  slot: number;
}) {
  const plain = bridgeMediaSrc(channelKey, messageId, slot);
  const [src, setSrc] = useState(plain);
  const retried = useRef(false);

  const upgradeSrc = useCallback(async () => {
    if (retried.current) return;
    retried.current = true;
    try {
      const r = await fetch("/api/bridge-media-sign", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_key: channelKey, message_id: messageId, slot }),
      });
      const j = (await r.json().catch(() => ({}))) as { url?: string };
      if (r.ok && typeof j.url === "string" && j.url.trim()) setSrc(j.url.trim());
    } catch {
      /* ignore */
    }
  }, [channelKey, messageId, slot]);

  return (
    <img
      className="tg-media-thumb"
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => {
        void upgradeSrc();
      }}
    />
  );
}

function BridgeMediaVideo({
  channelKey,
  messageId,
  slot,
  isAnimation,
}: {
  channelKey: string;
  messageId: number;
  slot: number;
  isAnimation: boolean;
}) {
  const plain = bridgeMediaSrc(channelKey, messageId, slot);
  const [src, setSrc] = useState(plain);
  const retried = useRef(false);

  const upgradeSrc = useCallback(async () => {
    if (retried.current) return;
    retried.current = true;
    try {
      const r = await fetch("/api/bridge-media-sign", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_key: channelKey, message_id: messageId, slot }),
      });
      const j = (await r.json().catch(() => ({}))) as { url?: string };
      if (r.ok && typeof j.url === "string" && j.url.trim()) setSrc(j.url.trim());
    } catch {
      /* ignore */
    }
  }, [channelKey, messageId, slot]);

  return (
    <video
      className="tg-media-thumb"
      src={src}
      controls
      playsInline
      preload="metadata"
      onError={() => {
        void upgradeSrc();
      }}
      {...(isAnimation ? { muted: true, loop: true, autoPlay: true } : {})}
    />
  );
}

function PostMediaPreview({ post }: { post: Post }) {
  const items = post.media?.filter(Boolean) ?? [];
  if (!items.length) return null;
  const album = items.length >= 2;
  return (
    <div className={`tg-media-preview${album ? " tg-media-album" : ""}`}>
      {items.map((item, i) => {
        const mid = item.source_message_id ?? item.message_id ?? post.message_id;
        const slot = item.source_slot ?? i;
        const mime = item.mime?.toLowerCase() ?? "";
        const isImage =
          item.kind === "photo" ||
          (item.kind === "document" && mime.startsWith("image/"));
        const isVideo =
          item.kind === "video" ||
          (item.kind === "document" && mime.startsWith("video/"));
        const isAnimation = item.kind === "animation";
        if (isImage) {
          return <BridgeMediaImage key={i} channelKey={post.channel_key} messageId={mid} slot={slot} />;
        }
        if (isVideo || isAnimation) {
          return (
            <BridgeMediaVideo
              key={i}
              channelKey={post.channel_key}
              messageId={mid}
              slot={slot}
              isAnimation={isAnimation}
            />
          );
        }
        return null;
      })}
    </div>
  );
}

function apiFailureMessage(j: Record<string, unknown>, r: Response): string {
  const e = j.error;
  if (typeof e === "string" && e.trim()) return e;
  const d = j.detail;
  if (typeof d === "string" && d.trim()) return d;
  if (Array.isArray(d) && d.length && typeof (d[0] as { msg?: string })?.msg === "string") {
    return (d[0] as { msg: string }).msg;
  }
  return r.statusText?.trim() || `HTTP ${r.status}`;
}

export default function Dashboard() {
  const [channels, setChannels] = useState<ChannelsMap>({});
  const [rewrites, setRewrites] = useState<Record<string, string>>({});
  const [rewriteErrors, setRewriteErrors] = useState<Record<string, string>>({});
  const [rewriteLoading, setRewriteLoading] = useState<Record<string, boolean>>({});
  const [publishLoading, setPublishLoading] = useState<Record<string, boolean>>({});
  const [wsStatus, setWsStatus] = useState<"off" | "connecting" | "live" | "error">("off");
  const [wsError, setWsError] = useState<string | null>(null);
  const [addUrl, setAddUrl] = useState("");
  const [addKey, setAddKey] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addErr, setAddErr] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectAttempt = useRef(0);
  const doRewriteRef = useRef<(post: Post) => Promise<void>>(async () => {});

  const wsBase = useMemo(() => wsBaseFromEnv(), []);

  const doRewrite = useCallback(async (post: Post) => {
    const key = postKey(post);
    if (!post.text?.trim()) return;
    setRewriteLoading((m) => ({ ...m, [key]: true }));
    setRewriteErrors((m) => {
      const n = { ...m };
      delete n[key];
      return n;
    });
    try {
      const r = await fetch("/api/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: post.text, channel_key: post.channel_key }),
      });
      const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      if (!r.ok) {
        throw new Error(apiFailureMessage(j, r));
      }
      const rw = j.rewrite;
      if (typeof rw === "string" && rw.trim()) {
        setRewrites((m) => ({ ...m, [key]: rw.trim() }));
      } else {
        throw new Error("empty rewrite");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      setRewriteErrors((m) => ({ ...m, [key]: msg }));
      setRewrites((m) => {
        const n = { ...m };
        delete n[key];
        return n;
      });
    } finally {
      setRewriteLoading((m) => ({ ...m, [key]: false }));
    }
  }, []);

  useEffect(() => {
    doRewriteRef.current = doRewrite;
  }, [doRewrite]);

  const mergeSnapshot = useCallback((snap: ChannelsMap) => {
    setChannels(() => {
      const next: ChannelsMap = {};
      for (const [k, list] of Object.entries(snap)) {
        next[k] = [...list].sort((a, b) => b.message_id - a.message_id);
      }
      return next;
    });
  }, []);

  const prependPost = useCallback((post: Post) => {
    setChannels((prev) => {
      const k = post.channel_key;
      const list = prev[k] ? [...prev[k]] : [];
      // Dedupe by concrete Telegram message id only. Album parts share grouped_id/postKey but must all stay in raw list until merge.
      const filtered = list.filter(
        (p) => !(p.channel_key === post.channel_key && p.message_id === post.message_id)
      );
      filtered.unshift(post);
      const rest = { ...prev };
      delete rest[k];
      return { ...rest, [k]: filtered.slice(0, 200) };
    });
  }, []);

  const connectWs = useCallback(async () => {
    if (!wsBase) {
      setWsStatus("error");
      setWsError("NEXT_PUBLIC_BRIDGE_PUBLIC_URL не заданий");
      return;
    }
    setWsStatus("connecting");
    setWsError(null);
    try {
      const tr = await fetch("/api/realtime-token", { method: "POST" });
      if (!tr.ok) {
        throw new Error(`token ${tr.status}`);
      }
      const { token } = (await tr.json()) as { token?: string };
      if (!token) throw new Error("no token");
      const url = `${wsBase}/ws/feed?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onopen = () => {
        setWsStatus("live");
        reconnectAttempt.current = 0;
        if (pingRef.current) clearInterval(pingRef.current);
        pingRef.current = setInterval(() => {
          try {
            if (ws.readyState === WebSocket.OPEN) ws.send("ping");
          } catch {
            /* ignore */
          }
        }, 25000);
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as
            | { type: "snapshot"; channels: ChannelsMap }
            | { type: "new_post"; post: Post };
          if (msg.type === "snapshot") {
            mergeSnapshot(msg.channels || {});
          }
          if (msg.type === "new_post" && msg.post) {
            prependPost(msg.post);
            void doRewriteRef.current(msg.post);
          }
        } catch {
          /* ignore parse */
        }
      };
      ws.onerror = () => {
        setWsError("websocket error");
      };
      ws.onclose = () => {
        setWsStatus("error");
        wsRef.current = null;
        if (pingRef.current) {
          clearInterval(pingRef.current);
          pingRef.current = null;
        }
        const attempt = ++reconnectAttempt.current;
        const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5));
        setTimeout(() => {
          void connectWs();
        }, delay);
      };
    } catch (e) {
      setWsStatus("error");
      setWsError(e instanceof Error ? e.message : "connect failed");
    }
  }, [mergeSnapshot, prependPost, wsBase]);

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch("/api/feed");
        if (r.ok) {
          const j = (await r.json()) as { channels?: ChannelsMap };
          if (j.channels) mergeSnapshot(j.channels);
        }
      } catch {
        /* ignore */
      }
    })();
  }, [mergeSnapshot]);

  useEffect(() => {
    void connectWs();
    return () => {
      if (pingRef.current) clearInterval(pingRef.current);
      wsRef.current?.close();
    };
  }, [connectWs]);

  const channelKeys = useMemo(() => Object.keys(channels).sort(), [channels]);

  async function onPublish(post: Post) {
    const key = postKey(post);
    const text = rewrites[key]?.trim();
    if (!text) return;
    setPublishLoading((m) => ({ ...m, [key]: true }));
    try {
      const r = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j as { error?: string }).error || r.statusText);
      alert("Опубліковано");
    } catch (e) {
      alert(e instanceof Error ? e.message : "publish failed");
    } finally {
      setPublishLoading((m) => ({ ...m, [key]: false }));
    }
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }

  async function submitAddChannel() {
    const trimmed = addUrl.trim();
    if (!trimmed) {
      setAddErr("Вставте посилання на канал або @username / id");
      return;
    }
    setAddBusy(true);
    setAddErr(null);
    const payload: Record<string, unknown> = { backfill_limit: 150 };
    if (/t\.me|telegram\.me|^\s*https?:\/\//i.test(trimmed)) {
      payload.url = trimmed;
    } else {
      payload.peer = trimmed;
    }
    const k = addKey.trim();
    if (k) payload.channel_key = k;
    try {
      const r = await fetch("/api/channels/watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      if (!r.ok) {
        const d = j.detail;
        const msg =
          typeof d === "string"
            ? d
            : Array.isArray(d) && d[0] && typeof (d[0] as { msg?: string }).msg === "string"
              ? (d[0] as { msg: string }).msg
              : apiFailureMessage(j, r);
        throw new Error(msg);
      }
      const ch = j.channels as ChannelsMap | undefined;
      if (ch && typeof ch === "object") mergeSnapshot(ch);
      setAddUrl("");
      setAddKey("");
    } catch (e) {
      setAddErr(e instanceof Error ? e.message : "помилка");
    } finally {
      setAddBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div>
          <h1 className="text-lg font-semibold">Новини → рерайт</h1>
          <p className="text-xs text-zinc-500">
            WS:{" "}
            <span className={wsStatus === "live" ? "text-emerald-400" : "text-amber-400"}>{wsStatus}</span>
            {wsError ? ` — ${wsError}` : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void logout()}
            className="rounded border border-zinc-600 px-3 py-1 text-sm"
          >
            Вийти
          </button>
        </div>
      </header>

      <section className="border-b border-zinc-800 px-4 py-3">
        <p className="mb-2 text-xs font-medium text-zinc-400">Додати колонку (канал)</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-zinc-500">
            Посилання або @канал / id
            <input
              type="text"
              value={addUrl}
              onChange={(e) => setAddUrl(e.target.value)}
              placeholder="https://t.me/somechannel або @somechannel"
              className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600"
              disabled={addBusy}
            />
          </label>
          <label className="flex w-full flex-col gap-1 text-xs text-zinc-500 sm:w-40">
            Ключ (необов&apos;язково)
            <input
              type="text"
              value={addKey}
              onChange={(e) => setAddKey(e.target.value)}
              placeholder="slug для API"
              className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600"
              disabled={addBusy}
            />
          </label>
          <button
            type="button"
            disabled={addBusy}
            onClick={() => void submitAddChannel()}
            className="rounded bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            {addBusy ? "…" : "Підключити й завантажити"}
          </button>
        </div>
        <p className="mt-1 text-[11px] text-zinc-600">
          Після додавання канал зберігається на bridge (файл watchlist), підтягуються останні пости й увімкнено
          моніторинг нових повідомлень. Потрібен перезапуск bridge лише якщо змінювався код, не watchlist.
        </p>
        {addErr ? <p className="mt-2 text-xs text-red-400">{addErr}</p> : null}
      </section>

      <main className="flex gap-3 overflow-x-auto p-3" style={{ minHeight: "calc(100vh - 56px)" }}>
        {channelKeys.length === 0 ? (
          <p className="p-4 text-sm text-zinc-500">Немає каналів у стрічці. Запустіть bridge і авторизуйте Telethon.</p>
        ) : null}
        {channelKeys.map((key) => {
          const columnPosts = mergeChannelPosts(channels[key] || []);
          return (
          <section
            key={key}
            className="flex w-[min(100%,420px)] shrink-0 flex-col rounded-lg border border-zinc-800 bg-zinc-900/60"
          >
            <div className="border-b border-zinc-800 px-3 py-2 text-sm font-medium text-zinc-100">
              {columnHeading(columnPosts, key)}
            </div>
            <div className="flex flex-col gap-3 overflow-y-auto p-3" style={{ maxHeight: "calc(100vh - 120px)" }}>
              {columnPosts.map((post) => {
                const pk = postKey(post);
                const mids = (post.media ?? [])
                  .map((m) => m.source_message_id ?? m.message_id ?? post.message_id)
                  .filter((n): n is number => typeof n === "number");
                const uniq = new Set(mids);
                const idLabel =
                  uniq.size > 1
                    ? `альбом · id ${Math.min(...uniq)}–${Math.max(...uniq)}`
                    : `id ${post.message_id}`;
                const invert = post.invert_media === true;
                const bodyEl = (
                  <div
                    key="body"
                    className="telegram-message-html text-sm leading-relaxed text-zinc-200"
                    // HTML з bridge: Telethon unparse + html.escape для сегментів без entities
                    dangerouslySetInnerHTML={{ __html: postBodyHtml(post) }}
                  />
                );
                const mediaEl = <PostMediaPreview key="media" post={post} />;
                const hasBridgeMedia = (post.media?.filter(Boolean).length ?? 0) > 0;
                const embedEl =
                  !hasBridgeMedia && post.telegram_url ? (
                    <PostTelegramEmbed key="embed" url={post.telegram_url} />
                  ) : null;
                return (
                  <article
                    key={pk}
                    className="rounded border border-zinc-800 bg-zinc-950/80 p-3 text-sm shadow-sm"
                  >
                    <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                      <span>
                        {post.channel_title || key} · {idLabel} · {formatPostDate(post.date)}
                      </span>
                      {post.telegram_url ? (
                        <a
                          href={post.telegram_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 rounded border border-sky-700/60 bg-sky-950/40 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-sky-300 hover:bg-sky-900/50"
                          title="Відкрити оригінал у Telegram"
                        >
                          у Telegram
                        </a>
                      ) : null}
                    </div>
                    {invert ? (
                      <>
                        {bodyEl}
                        {mediaEl}
                        {embedEl}
                      </>
                    ) : (
                      <>
                        {mediaEl}
                        {embedEl}
                        {bodyEl}
                      </>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded bg-zinc-200 px-2 py-1 text-xs font-medium text-zinc-900 disabled:opacity-50"
                        disabled={rewriteLoading[pk]}
                        onClick={() => void doRewrite(post)}
                      >
                        {rewriteLoading[pk] ? "…" : "Рерайт UA"}
                      </button>
                    </div>
                    {rewriteErrors[pk] ? (
                      <p className="mt-2 text-xs text-red-400">Помилка: {rewriteErrors[pk]}</p>
                    ) : null}
                    {rewrites[pk] ? (
                      <div className="mt-2 space-y-2">
                        <label className="text-xs text-zinc-500">Чернетка публікації</label>
                        <textarea
                          className="w-full min-h-[120px] rounded border border-zinc-700 bg-zinc-900 p-2 text-xs text-zinc-100"
                          value={rewrites[pk]}
                          onChange={(e) =>
                            setRewrites((m) => ({ ...m, [pk]: e.target.value }))
                          }
                        />
                        <button
                          type="button"
                          className="rounded bg-emerald-700 px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
                          disabled={publishLoading[pk]}
                          onClick={() => void onPublish(post)}
                        >
                          {publishLoading[pk] ? "…" : "Опублікувати"}
                        </button>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
          );
        })}
      </main>
      {BUILD_SHA ? (
        <footer className="border-t border-zinc-800 px-3 py-1.5 text-center text-[10px] text-zinc-600">
          build {BUILD_SHA.slice(0, 7)}
        </footer>
      ) : null}
    </div>
  );
}
