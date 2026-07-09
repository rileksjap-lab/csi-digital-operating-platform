import type { AuthSession } from "@/lib/types/api";

const SESSION_PREFIX = "session:";
const SESSION_TTL = 28800; // 8 hours

// ─── In-memory fallback for dev when Redis is unavailable ───────────────────

declare global {
  // eslint-disable-next-line no-var
  var __memorySessionStore:
    | Map<string, { data: string; expiresAt: number }>
    | undefined;
  // eslint-disable-next-line no-var, @typescript-eslint/no-explicit-any
  var __redisClient: any;
  // eslint-disable-next-line no-var
  var __redisInitAttempted: boolean | undefined;
  // eslint-disable-next-line no-var
  var __useMemorySession: boolean | undefined;
}

const memStore =
  global.__memorySessionStore ??
  new Map<string, { data: string; expiresAt: number }>();
if (process.env.NODE_ENV !== "production") {
  global.__memorySessionStore = memStore;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let redisClient: any = null;

async function getRedis() {
  if (!process.env.REDIS_URL) {
    global.__useMemorySession = true;
    return null;
  }
  if (global.__useMemorySession) return null;
  if (redisClient?.isOpen) return redisClient;
  if (global.__redisInitAttempted) return null;

  global.__redisInitAttempted = true;
  try {
    const { createClient } = await import("redis");

    if (global.__redisClient) {
      try { global.__redisClient.removeAllListeners(); } catch {}
      try { global.__redisClient.disconnect(); } catch {}
      global.__redisClient = undefined;
    }

    redisClient = createClient({ url: process.env.REDIS_URL });
    redisClient.on("error", () => {});

    await redisClient.connect();
    if (process.env.NODE_ENV !== "production") {
      global.__redisClient = redisClient;
    }
    console.log("[redis] connected");
    return redisClient;
  } catch (err) {
    console.warn(
      "[redis] unavailable, falling back to in-memory sessions:",
      (err as Error).message
    );
    if (redisClient) {
      try { redisClient.removeAllListeners(); } catch {}
      try { redisClient.disconnect(); } catch {}
      redisClient = null;
    }
    global.__redisClient = undefined;
    global.__useMemorySession = true;
    return null;
  }
}

// ─── Session CRUD (works with Redis or in-memory) ───────────────────────────

export async function setSession(
  sessionId: string,
  session: AuthSession,
  ttlSec = SESSION_TTL
): Promise<void> {
  const redis = await getRedis();
  const key = `${SESSION_PREFIX}${sessionId}`;
  const data = JSON.stringify(session);

  if (redis) {
    await redis.setEx(key, ttlSec, data);
  } else {
    memStore.set(key, { data, expiresAt: Date.now() + ttlSec * 1000 });
  }
}

export async function getSession(
  sessionId: string
): Promise<AuthSession | null> {
  const redis = await getRedis();
  const key = `${SESSION_PREFIX}${sessionId}`;

  if (redis) {
    const raw = await redis.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as AuthSession;
  }

  const entry = memStore.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memStore.delete(key);
    return null;
  }
  return JSON.parse(entry.data) as AuthSession;
}

export async function deleteSession(sessionId: string): Promise<void> {
  const redis = await getRedis();
  const key = `${SESSION_PREFIX}${sessionId}`;

  if (redis) {
    await redis.del(key);
  } else {
    memStore.delete(key);
  }
}
