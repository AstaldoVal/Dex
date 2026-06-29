import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export interface CursorChat {
  id: string;
  title: string;
}

const CURSOR_GLOBAL_DB =
  process.platform === "darwin"
    ? path.join(
        os.homedir(),
        "Library",
        "Application Support",
        "Cursor",
        "User",
        "globalStorage",
        "state.vscdb"
      )
    : process.platform === "win32"
      ? path.join(
          process.env.APPDATA || "",
          "Cursor",
          "User",
          "globalStorage",
          "state.vscdb"
        )
      : path.join(
          os.homedir(),
          ".config",
          "Cursor",
          "User",
          "globalStorage",
          "state.vscdb"
        );

function extractChatsFromJson(val: unknown): CursorChat[] {
  const out: CursorChat[] = [];
  if (!val || typeof val !== "object") return out;

  const push = (id: string, title: string) => {
    if (id && !out.some((c) => c.id === id)) {
      out.push({ id, title: title || id.slice(0, 12) + "…" });
    }
  };

  const obj = val as Record<string, unknown>;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        const id =
          (o.id as string) ??
          (o.conversationId as string) ??
          (o.bubbleId as string) ??
          (o.conversation_id as string);
        const title =
          (o.title as string) ??
          (o.name as string) ??
          (o.label as string) ??
          (o.subject as string) ??
          "";
        if (id) push(String(id), String(title || ""));
      }
    }
    return out;
  }

  if (obj.conversations && Array.isArray(obj.conversations)) {
    return extractChatsFromJson(obj.conversations);
  }
  if (obj.chats && Array.isArray(obj.chats)) {
    return extractChatsFromJson(obj.chats);
  }
  if (obj.bubbles && Array.isArray(obj.bubbles)) {
    return extractChatsFromJson(obj.bubbles);
  }
  if (obj.data && Array.isArray(obj.data)) {
    return extractChatsFromJson(obj.data);
  }

  const id =
    (obj.id as string) ??
    (obj.conversationId as string) ??
    (obj.bubbleId as string);
  const title =
    (obj.title as string) ??
    (obj.name as string) ??
    (obj.label as string) ??
    "";
  if (id) push(String(id), String(title || ""));
  return out;
}

export async function getRecentChatsFromCursor(): Promise<CursorChat[]> {
  const sqlJs = await import("sql.js");
  const initFn = (sqlJs as Record<string, unknown>).default ?? (sqlJs as Record<string, unknown>).initSqlJs;
  const SQL = (await (initFn as () => Promise<{ Database: new (d?: Buffer) => { exec(s: string): { values: unknown[] }[]; close(): void } }>)()) as {
    Database: new (data?: Buffer) => { exec(sql: string): { values: (string | number | Uint8Array | null)[][] }[]; close(): void };
  };
  const dbPath = CURSOR_GLOBAL_DB;
  if (!fs.existsSync(dbPath)) return [];

  let buf: Buffer;
  try {
    buf = fs.readFileSync(dbPath);
  } catch {
    return [];
  }

  const db = new SQL.Database(buf);
  const all: CursorChat[] = [];
  try {
    const stmt = db.exec("SELECT key, value FROM ItemTable");
    if (!stmt.length || !stmt[0].values) {
      db.close();
      return [];
    }
    for (const row of stmt[0].values) {
      const key = row[0];
      let value = row[1];
      if (!key) continue;
      const keyStr = String(key);
      if (
        !keyStr.includes("chat") &&
        !keyStr.includes("composer") &&
        !keyStr.startsWith("bubbleId:") &&
        !keyStr.includes("aichat")
      )
        continue;
      if (value instanceof Uint8Array) {
        value = new TextDecoder().decode(value);
      }
      const valueStr = typeof value === "string" ? value : String(value);
      try {
        const parsed = JSON.parse(valueStr) as unknown;
        const chats = extractChatsFromJson(parsed);
        for (const c of chats) {
          if (!all.some((x) => x.id === c.id)) all.push(c);
        }
      } catch {
        // skip unparseable
      }
    }
    db.close();
  } catch {
    try {
      db.close();
    } catch {
      /* no-op */
    }
    return [];
  }

  return all.slice(0, 100);
}
