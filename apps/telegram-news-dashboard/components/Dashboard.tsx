"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

const BUILD_SHA = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.trim() ?? "";

/** Показати блоки «звідки дані» (колонки + глобальний ланцюг). Увімкнути: `?debug=1` або `#debug` у URL, або `NEXT_PUBLIC_FEED_DEBUG=1` у збірці (потрібен деплой з цим кодом). */
const FEED_DEBUG_FROM_ENV =
  process.env.NEXT_PUBLIC_FEED_DEBUG === "1" || process.env.NEXT_PUBLIC_FEED_DEBUG === "true";

const BRIDGE_PUBLIC_DISPLAY = process.env.NEXT_PUBLIC_BRIDGE_PUBLIC_URL?.trim() ?? "";

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

/** All keys that should light up one logical card (covers WS payload vs merged album / max message_id). */
function highlightKeysForPost(p: Post): string[] {
  const s = new Set<string>();
  s.add(postKey(p));
  s.add(`${p.channel_key}:${p.message_id}`);
  const gid = p.grouped_id;
  if (gid != null && gid !== 0) {
    s.add(`${p.channel_key}:group:${gid}`);
  }
  return [...s];
}

const NEW_HIGHLIGHT_MS = 50_000;

let sharedAudioCtx: AudioContext | null = null;

/** Short ascending chime; reuses one AudioContext. May stay silent until a user gesture on strict autoplay policies. */
function playNewPostChime(): void {
  if (typeof window === "undefined") return;
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    if (!sharedAudioCtx || sharedAudioCtx.state === "closed") {
      sharedAudioCtx = new Ctx();
    }
    const ctx = sharedAudioCtx;
    const run = () => {
      const now = ctx.currentTime;
      const schedule = (freq: number, start: number, dur: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        osc.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.1, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.01, start + dur);
        osc.start(start);
        osc.stop(start + dur + 0.02);
      };
      schedule(784, now, 0.11);
      schedule(988, now + 0.1, 0.14);
    };
    void ctx.resume().then(run);
  } catch {
    /* ignore */
  }
}

/** Prefer the album part that actually carries the caption (plain or HTML), not only the first id. */
function postBodyStrength(p: Post): number {
  const t = (p.text ?? "").trim().length;
  const h = (p.text_html ?? "").trim();
  const plainFromHtml = h ? h.replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").trim().length : 0;
  return Math.max(t, plainFromHtml);
}

/** Merge album parts (same grouped_id) into one card; preserve newest-first order. */
function mergePostGroup(group: Post[]): Post {
  const sorted = [...group].sort((a, b) => a.message_id - b.message_id);
  const ids = sorted.map((g) => g.message_id);
  const primary = sorted.reduce((best, cur) =>
    postBodyStrength(cur) > postBodyStrength(best) ? cur : best
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

  let mergedText = (primary.text ?? "").trim();
  let mergedHtml = (primary.text_html ?? "").trim();
  let mergedTgUrl = primary.telegram_url;
  if (!mergedText && !mergedHtml.replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").trim()) {
    const donor = sorted.find((g) => postBodyStrength(g) > 0);
    if (donor) {
      mergedText = (donor.text ?? "").trim();
      mergedHtml = (donor.text_html ?? "").trim();
      mergedTgUrl = donor.telegram_url ?? mergedTgUrl;
    }
  }

  return {
    ...primary,
    message_id: maxId,
    grouped_id: gid,
    media,
    invert_media,
    channel_title: mergedChannelTitle || primary.channel_title,
    text: mergedText,
    text_html: mergedHtml,
    telegram_url: mergedTgUrl,
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
/** Never inject active content from Telethon HTML into the DOM (defense in depth). */
function stripActiveContentFromHtml(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, "")
    .replace(/<iframe\b[^>]*\/?>/gi, "")
    .replace(/<embed\b[^>]*\/?>/gi, "")
    .replace(/<object\b[\s\S]*?<\/object>/gi, "");
}

function postBodyHtml(post: Post): string {
  const h = post.text_html?.trim();
  if (h) return stripActiveContentFromHtml(h);
  const t = post.text?.trim();
  if (!t && (post.media?.length ?? 0) > 0) return "";
  if (!t) return "—";
  return escapeHtml(t).replace(/\n/g, "<br/>");
}

/**
 * Fallback labels when `/feed` ще порожній або немає `channel_title`.
 * Не підставляйте сюди «заглушки» замість реальної назви з Telegram — заголовок колонки
 * береться з `channel_title` постів, якщо немає явного `NEXT_PUBLIC_CHANNEL_LABELS`.
 */
const DEFAULT_CHANNEL_LABELS: Record<string, string> = {
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

/** Назва каналу з постів колонки (Telegram title), без статичних заглушок. */
function bestChannelTitleFromPosts(posts: Post[] | undefined, key: string): string | null {
  if (!posts?.length) return null;
  const titles = posts
    .map((p) => p.channel_title?.trim())
    .filter((t): t is string => Boolean(t));
  if (!titles.length) return null;
  const slug = key.toLowerCase();
  const human = titles.find((t) => t.toLowerCase() !== slug);
  if (human) return human;
  return titles.reduce((a, b) => (b.length > a.length ? b : a));
}

/**
 * Заголовок колонки: лише явний `NEXT_PUBLIC_CHANNEL_LABELS` перебиває Telegram;
 * інакше — реальний `channel_title` з постів; останній запас — DEFAULT_CHANNEL_LABELS / ключ.
 */
function columnHeading(posts: Post[] | undefined, key: string): string {
  const env = channelLabelsFromEnv();
  const envOnly = env[key]?.trim() || env[key.toLowerCase()]?.trim();
  if (envOnly) return envOnly;

  const fromPosts = bestChannelTitleFromPosts(posts, key);
  if (fromPosts) return fromPosts;

  const defaults = DEFAULT_CHANNEL_LABELS;
  const fallback = defaults[key]?.trim() || defaults[key.toLowerCase()]?.trim();
  if (fallback) return fallback;

  return key;
}

/** Короткий опис, звідки взятий заголовок колонки (лише для debug-панелі). */
function columnHeadingSource(posts: Post[] | undefined, key: string): string {
  const env = channelLabelsFromEnv();
  const envHit = env[key]?.trim() || env[key.toLowerCase()]?.trim();
  if (envHit) return "NEXT_PUBLIC_CHANNEL_LABELS (env JSON) — явний override";

  const fromPosts = bestChannelTitleFromPosts(posts, key);
  if (fromPosts) return "channel_title з постів колонки (Telegram)";

  const defaults = DEFAULT_CHANNEL_LABELS;
  const fb = defaults[key]?.trim() || defaults[key.toLowerCase()]?.trim();
  if (fb) return "DEFAULT_CHANNEL_LABELS у коді Dashboard (немає постів / без channel_title)";

  if (!posts?.length) return "немає постів → показано ключ об’єкта channels";
  return "немає channel_title у постах → показано ключ";
}

function bridgeMediaSrc(channelKey: string, messageId: number, slot: number): string {
  const q = new URLSearchParams({
    channel_key: channelKey,
    message_id: String(messageId),
    slot: String(slot),
  });
  return `/api/bridge-media?${q.toString()}`;
}

/** Photo slot identifier carried into the gallery lightbox. */
type GalleryItem = {
  channelKey: string;
  messageId: number;
  slot: number;
};

/**
 * Signed-URL retry shared by thumbnail and lightbox: `<img>` tags do not send
 * HttpOnly cookies, so on 401 we POST `/api/bridge-media-sign` for a short-lived
 * `mt` JWT-backed URL.
 */
async function fetchSignedMediaUrl(item: GalleryItem): Promise<string | null> {
  try {
    const r = await fetch("/api/bridge-media-sign", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel_key: item.channelKey,
        message_id: item.messageId,
        slot: item.slot,
      }),
    });
    const j = (await r.json().catch(() => ({}))) as { url?: string };
    if (r.ok && typeof j.url === "string" && j.url.trim()) return j.url.trim();
  } catch {
    /* ignore */
  }
  return null;
}

/** Plain `/api/bridge-media`; on 401 — підписаний `mt` через POST. Clickable when gallery is available. */
function BridgeMediaImage({
  channelKey,
  messageId,
  slot,
  onOpen,
}: {
  channelKey: string;
  messageId: number;
  slot: number;
  onOpen?: () => void;
}) {
  const plain = bridgeMediaSrc(channelKey, messageId, slot);
  const [src, setSrc] = useState(plain);
  const retried = useRef(false);

  const upgradeSrc = useCallback(async () => {
    if (retried.current) return;
    retried.current = true;
    const signed = await fetchSignedMediaUrl({ channelKey, messageId, slot });
    if (signed) setSrc(signed);
  }, [channelKey, messageId, slot]);

  const clickable = typeof onOpen === "function";
  const img = (
    <img
      className={`tg-media-thumb${clickable ? " cursor-zoom-in" : ""}`}
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => {
        void upgradeSrc();
      }}
      draggable={false}
    />
  );
  if (clickable && onOpen) {
    return (
      <button
        type="button"
        className="m-0 block w-full cursor-zoom-in border-0 bg-transparent p-0 text-left"
        onClick={() => onOpen()}
        aria-label="Відкрити фото"
      >
        {img}
      </button>
    );
  }
  return img;
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

function PostMediaPreview({
  post,
  onOpenGallery,
}: {
  post: Post;
  onOpenGallery?: (items: GalleryItem[], startIndex: number) => void;
}) {
  const items = post.media?.filter(Boolean) ?? [];
  if (!items.length) return null;
  const album = items.length >= 2;

  // Собираем только фото — видео в галерею не кладём, их смотрят инлайн.
  const photoItems: Array<{ renderIndex: number; gallery: GalleryItem }> = [];
  items.forEach((item, i) => {
    const mime = item.mime?.toLowerCase() ?? "";
    const isImage =
      item.kind === "photo" ||
      (item.kind === "document" && mime.startsWith("image/"));
    if (!isImage) return;
    const mid = item.source_message_id ?? item.message_id ?? post.message_id;
    const slot = item.source_slot ?? i;
    photoItems.push({
      renderIndex: i,
      gallery: { channelKey: post.channel_key, messageId: mid, slot },
    });
  });
  const galleryList = photoItems.map((p) => p.gallery);
  const galleryPositionByRenderIndex = new Map(
    photoItems.map((p, idx) => [p.renderIndex, idx]),
  );

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
          const pos = galleryPositionByRenderIndex.get(i) ?? 0;
          return (
            <BridgeMediaImage
              key={i}
              channelKey={post.channel_key}
              messageId={mid}
              slot={slot}
              onOpen={
                onOpenGallery && galleryList.length
                  ? () => onOpenGallery(galleryList, pos)
                  : undefined
              }
            />
          );
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

/**
 * Full-screen галерея фото. Показуємо один кадр, стрілки/клавіатура/свайп для навігації,
 * Esc або клік по фону — закрити. `<img>` не шле HttpOnly-cookie, тож на 401 дотягуємо
 * підписаний `mt` URL через `fetchSignedMediaUrl`.
 */
function MediaLightbox({
  items,
  index,
  onClose,
  onIndexChange,
}: {
  items: GalleryItem[];
  index: number;
  onClose: () => void;
  onIndexChange: (next: number) => void;
}) {
  const total = items.length;
  const current = items[index];
  const plain = current ? bridgeMediaSrc(current.channelKey, current.messageId, current.slot) : "";
  const [src, setSrc] = useState(plain);
  const retried = useRef(false);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    retried.current = false;
    setSrc(plain);
  }, [plain]);

  const go = useCallback(
    (delta: number) => {
      if (!total) return;
      const next = (index + delta + total) % total;
      onIndexChange(next);
    },
    [index, total, onIndexChange],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        go(1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [go, onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (!current) return null;

  const upgradeSrc = async () => {
    if (retried.current) return;
    retried.current = true;
    const signed = await fetchSignedMediaUrl(current);
    if (signed) setSrc(signed);
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Фото"
      onClick={onClose}
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const start = touchStartX.current;
        touchStartX.current = null;
        if (start == null) return;
        const end = e.changedTouches[0]?.clientX ?? start;
        const delta = end - start;
        if (Math.abs(delta) > 40) go(delta > 0 ? -1 : 1);
      }}
    >
      <button
        type="button"
        aria-label="Закрити"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute right-3 top-3 rounded-full bg-black/60 px-3 py-1 text-sm text-white hover:bg-black/80"
      >
        ✕
      </button>
      {total > 1 ? (
        <>
          <button
            type="button"
            aria-label="Попереднє фото"
            onClick={(e) => {
              e.stopPropagation();
              go(-1);
            }}
            className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/60 px-3 py-2 text-lg text-white hover:bg-black/80"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Наступне фото"
            onClick={(e) => {
              e.stopPropagation();
              go(1);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/60 px-3 py-2 text-lg text-white hover:bg-black/80"
          >
            ›
          </button>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white/80">
            {index + 1} / {total}
          </div>
        </>
      ) : null}
      <img
        src={src}
        alt=""
        className="max-h-[92vh] max-w-[94vw] select-none object-contain"
        onClick={(e) => e.stopPropagation()}
        onError={() => {
          void upgradeSrc();
        }}
        draggable={false}
      />
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
  /** Помилка початкового завантаження /api/feed (тунель, BRIDGE_URL). */
  const [feedBanner, setFeedBanner] = useState<string | null>(null);
  const [feedRefreshing, setFeedRefreshing] = useState(false);
  const [gallery, setGallery] = useState<{
    items: GalleryItem[];
    index: number;
  } | null>(null);
  const openGallery = useCallback((items: GalleryItem[], index: number) => {
    if (!items.length) return;
    const safe = Math.max(0, Math.min(index, items.length - 1));
    setGallery({ items, index: safe });
  }, []);
  const closeGallery = useCallback(() => setGallery(null), []);
  const wsRef = useRef<WebSocket | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectAttempt = useRef(0);
  const doRewriteRef = useRef<(post: Post) => Promise<void>>(async () => {});
  /** Post keys (`postKey`) that arrived via WS — green highlight until timeout. */
  const [newPostHighlights, setNewPostHighlights] = useState<Set<string>>(() => new Set());
  const highlightTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const lastChimeAtRef = useRef(0);

  const markAsNewFromRealtime = useCallback((post: Post) => {
    const keys = highlightKeysForPost(post);
    const timerId = keys.join("|");
    setNewPostHighlights((prev) => {
      const next = new Set(prev);
      for (const k of keys) next.add(k);
      return next;
    });
    const prevT = highlightTimersRef.current.get(timerId);
    if (prevT) clearTimeout(prevT);
    const t = setTimeout(() => {
      setNewPostHighlights((prev) => {
        const next = new Set(prev);
        for (const k of keys) next.delete(k);
        return next;
      });
      highlightTimersRef.current.delete(timerId);
    }, NEW_HIGHLIGHT_MS);
    highlightTimersRef.current.set(timerId, t);

    const now = Date.now();
    if (now - lastChimeAtRef.current > 400) {
      lastChimeAtRef.current = now;
      playNewPostChime();
    }
  }, []);

  const wsBase = useMemo(() => wsBaseFromEnv(), []);

  const [feedDebug, setFeedDebug] = useState(FEED_DEBUG_FROM_ENV);
  /** Одразу після гідратації (до paint), щоб `?debug=1` / `#debug` працювали без окремого «другого» кадру від useEffect. */
  useLayoutEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const hash = window.location.hash.replace(/^#/, "").split("?")[0] ?? "";
    const fromUrl =
      q.get("debug") === "1" ||
      q.get("feedDebug") === "1" ||
      hash === "debug" ||
      hash === "feedDebug";
    setFeedDebug(FEED_DEBUG_FROM_ENV || fromUrl);
  }, []);

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

  useEffect(() => {
    return () => {
      const timers = highlightTimersRef.current;
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

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
            markAsNewFromRealtime(msg.post);
            prependPost(msg.post);
            void doRewriteRef.current(msg.post);
          }
        } catch {
          /* ignore parse */
        }
      };
      ws.onerror = () => {
        setWsError("помилка сокета (деталі після закриття з’єднання)");
      };
      ws.onclose = (ev: CloseEvent) => {
        setWsStatus("error");
        wsRef.current = null;
        if (pingRef.current) {
          clearInterval(pingRef.current);
          pingRef.current = null;
        }
        const why =
          ev.code === 1006
            ? "абнормальне закриття (часто: мережа блокує wss до trycloudflare або тунель упав)"
            : [ev.reason?.trim(), ev.code ? `код ${ev.code}` : ""].filter(Boolean).join(" — ") || "з’єднання закрито";
        setWsError(
          `${why}. Резерв: стрічка оновлюється через /api/feed кожні ~30 с з цього домену (Vercel→bridge), навіть якщо WS з браузера не відкривається.`
        );
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
  }, [markAsNewFromRealtime, mergeSnapshot, prependPost, wsBase]);

  /** Завантаження стрічки через Next (той самий origin, сесія). Працює навіть коли браузер не може відкрити wss до trycloudflare. */
  const refreshFeedFromApi = useCallback(async (): Promise<boolean> => {
    try {
      const r = await fetch("/api/feed", { credentials: "same-origin" });
      const j = (await r.json().catch(() => ({}))) as {
        channels?: ChannelsMap;
        error?: string;
        detail?: unknown;
      };
      if (r.ok && j.channels && typeof j.channels === "object") {
        mergeSnapshot(j.channels);
        setFeedBanner(null);
        return true;
      }
      const detailStr =
        typeof j.detail === "string"
          ? j.detail
          : Array.isArray(j.detail) && j.detail[0] && typeof (j.detail[0] as { msg?: string }).msg === "string"
            ? (j.detail[0] as { msg: string }).msg
            : null;
      const msg =
        typeof j.error === "string" && j.error.trim()
          ? j.error.trim()
          : detailStr?.trim() || `Не вдалося завантажити стрічку (HTTP ${r.status})`;
      setFeedBanner(msg);
      return false;
    } catch {
      setFeedBanner("Не вдалося звернутися до /api/feed");
      return false;
    }
  }, [mergeSnapshot]);

  const handleManualFeedRefresh = useCallback(async () => {
    setFeedRefreshing(true);
    try {
      await refreshFeedFromApi();
    } finally {
      setFeedRefreshing(false);
    }
  }, [refreshFeedFromApi]);

  useEffect(() => {
    void refreshFeedFromApi();
  }, [refreshFeedFromApi]);

  /** Поки WS не live — підтягуємо стрічку з Vercel→bridge по HTTPS (обхід блокування wss до тунелю з браузера). */
  useEffect(() => {
    if (wsStatus === "live") return;
    const id = setInterval(() => void refreshFeedFromApi(), 30_000);
    return () => clearInterval(id);
  }, [wsStatus, refreshFeedFromApi]);

  useEffect(() => {
    void connectWs();
    return () => {
      if (pingRef.current) clearInterval(pingRef.current);
      wsRef.current?.close();
    };
  }, [connectWs]);

  /** Разблокирует AudioContext после первого жеста (политика autoplay в браузерах). */
  useEffect(() => {
    const unlock = () => {
      try {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return;
        if (!sharedAudioCtx || sharedAudioCtx.state === "closed") {
          sharedAudioCtx = new Ctx();
        }
        void sharedAudioCtx.resume();
      } catch {
        /* ignore */
      }
    };
    document.addEventListener("pointerdown", unlock, { once: true });
    return () => document.removeEventListener("pointerdown", unlock);
  }, []);

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
            {wsStatus !== "live" ? (
              <span className="mt-0.5 block text-zinc-600">
                Поки WS offline, дані підтягуються по HTTPS з цього ж сайту (не потрібен довгий домен тунелю в адресному рядку).
              </span>
            ) : null}
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

      {feedBanner ? (
        <div
          className="border-b border-amber-800/60 bg-amber-950/40 px-4 py-2 text-sm text-amber-100/95"
          role="alert"
        >
          <span className="font-medium text-amber-200">Стрічка:</span> {feedBanner}
        </div>
      ) : null}

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
          Після додавання канал зберігається на bridge (файл watchlist) як числовий id — після перезапуску bridge
          зайвих запитів на @username не буде. Якщо Telegram просить довго зачекати на @канал, вставте посилання
          з веб-версії виду <code className="text-zinc-500">t.me/c/…/…</code> або числовий id. Потрібен перезапуск
          bridge лише якщо змінювався код, не watchlist.
        </p>
        {addErr ? <p className="mt-2 text-xs text-red-400">{addErr}</p> : null}
      </section>

      {feedDebug ? (
        <section
          className="border-b border-amber-900/50 bg-amber-950/25 px-4 py-2 text-[11px] leading-snug text-amber-100/95"
          aria-label="Дебаг джерел даних стрічки"
        >
          <p className="font-semibold text-amber-200">Дебаг: звідки дані в колонках</p>
          <ul className="mt-1 space-y-0.5 font-mono text-[10px] text-zinc-400">
            <li>
              Стартовий знімок:{" "}
              <code className="text-zinc-300">fetch(&quot;/api/feed&quot;)</code> → Next.js → bridge{" "}
              <code className="text-zinc-300">GET …/feed</code> → JSON{" "}
              <code className="text-zinc-300">channels: Record&lt;channel_key, Post[]&gt;</code> (ключі =
              slug колонок).
            </li>
            <li>
              Оновлення в реальному часі: WS{" "}
              <code className="text-zinc-300">
                {wsBase ? `${wsBase}/ws/feed` : "— (немає NEXT_PUBLIC_BRIDGE_PUBLIC_URL)"}
              </code>{" "}
              після <code className="text-zinc-300">POST /api/realtime-token</code> — події{" "}
              <code className="text-zinc-300">snapshot.channels</code> та{" "}
              <code className="text-zinc-300">new_post</code> (маршрутизація по{" "}
              <code className="text-zinc-300">post.channel_key</code>).
            </li>
            <li>
              Медіа в картці: <code className="text-zinc-300">/api/bridge-media?channel_key=…</code> (за
              потреби <code className="text-zinc-300">/api/bridge-media-sign</code>).
            </li>
            <li>
              <code className="text-zinc-300">NEXT_PUBLIC_BRIDGE_PUBLIC_URL</code>:{" "}
              <span className="text-zinc-300">
                {BRIDGE_PUBLIC_DISPLAY || "не задано"}
              </span>
            </li>
            <li className="text-zinc-500">
              Увімкнення без env: <code className="text-zinc-400">?debug=1</code> або{" "}
              <code className="text-zinc-400">#debug</code> у URL. Постійно:{" "}
              <code className="text-zinc-400">NEXT_PUBLIC_FEED_DEBUG=1</code> (потрібен деплой). Спочатку на
              Vercel має бути збірка, де вже є цей UI — інакше працюватиме лише після git push / redeploy.
            </li>
          </ul>
        </section>
      ) : null}

      <main className="flex gap-3 overflow-x-auto p-3" style={{ minHeight: "calc(100vh - 56px)" }}>
        {channelKeys.length === 0 ? (
          <div className="flex max-w-xl flex-col gap-3 rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-4 text-sm leading-relaxed text-zinc-400">
            <p className="font-medium text-zinc-200">Немає колонок у стрічці</p>
            {feedBanner ? (
              <p>
                Знімок з bridge не завантажився — причина в{" "}
                <span className="text-amber-200/90">жовтому блоці</span> вище (зазвичай tunnel недоступний,
                <code className="mx-0.5 text-zinc-500"> BRIDGE_URL</code> на Vercel або bridge не запущений).
                Після відновлення натисніть кнопку або зачекайте автооновлення (~30 с).
              </p>
            ) : (
              <p>
                Якщо <code className="text-zinc-500">/api/feed</code> відповів OK, але колонок немає — на
                bridge у watchlist ще немає каналів: додайте їх формою «Підключити й завантажити» вище. На машині з
                bridge має працювати процес; при першому запуску Telethon попросить логін у терміналі (сесія
                зберігається у файлі <code className="text-zinc-500">.session</code> поруч із bridge).
              </p>
            )}
            <button
              type="button"
              disabled={feedRefreshing}
              onClick={() => void handleManualFeedRefresh()}
              className="w-fit rounded border border-zinc-600 bg-zinc-800/80 px-3 py-1.5 text-xs font-medium text-zinc-100 hover:bg-zinc-700 disabled:opacity-50"
            >
              {feedRefreshing ? "Завантаження…" : "Оновити стрічку зараз"}
            </button>
          </div>
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
            {feedDebug ? (
              <div className="border-b border-dashed border-amber-800/50 bg-zinc-950/90 px-3 py-1.5 text-[10px] leading-relaxed text-amber-100/85">
                <div className="font-mono">
                  <span className="text-zinc-500">channel_key:</span>{" "}
                  <span className="text-emerald-400">{key}</span>
                </div>
                <div className="font-mono text-zinc-400">
                  у state: {channels[key]?.length ?? 0} сирих → {columnPosts.length} карток після merge
                  альбомів
                </div>
                <div className="font-mono text-zinc-500">заголовок: {columnHeadingSource(channels[key], key)}</div>
                {(channels[key]?.length ?? 0) === 0 ? (
                  <div className="mt-1 font-mono text-[9px] leading-tight text-amber-200/85">
                    Порожньо вже з <code className="text-zinc-400">/feed</code> — на bridge перевірте peer у{" "}
                    <code className="text-zinc-400">NEWS_SOURCE_MAP</code>, опечатку ключа (
                    <code className="text-zinc-400">uasonli</code> vs <code className="text-zinc-400">uaonlii</code>
                    ), логи Telethon або <code className="text-zinc-400">GET /channels?include_post_counts=true</code>.
                  </div>
                ) : null}
              </div>
            ) : null}
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
                const mediaEl = (
                  <PostMediaPreview
                    key="media"
                    post={post}
                    onOpenGallery={openGallery}
                  />
                );
                const isNewHighlight = highlightKeysForPost(post).some((k) => newPostHighlights.has(k));
                return (
                  <article
                    key={pk}
                    className={
                      isNewHighlight
                        ? "rounded border-2 border-emerald-400 bg-emerald-500/20 p-3 text-sm shadow-[0_0_0_1px_rgba(52,211,153,0.35),0_0_24px_rgba(16,185,129,0.25)] ring-2 ring-emerald-400/50 transition-[background-color,box-shadow,border-color] duration-300"
                        : "rounded border border-zinc-800 bg-zinc-950/80 p-3 text-sm shadow-sm transition-[background-color,box-shadow] duration-500"
                    }
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
                      </>
                    ) : (
                      <>
                        {mediaEl}
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
      {gallery ? (
        <MediaLightbox
          items={gallery.items}
          index={gallery.index}
          onClose={closeGallery}
          onIndexChange={(next) =>
            setGallery((g) => (g ? { ...g, index: next } : g))
          }
        />
      ) : null}
    </div>
  );
}
