import "dotenv/config";
import express from "express";
import path from "path";
import dns from "node:dns";
import net from "node:net";
import cors from "cors";
import fs from "fs";
import { initializeApp as initAdminApp, cert as adminCert } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";
import { getDatabase as getAdminDatabase } from "firebase-admin/database";
import { createServer as createViteServer } from "vite";

// Force IPv4 resolution first to prevent ConnectTimeoutError on Cloudflare IPv6
try {
  dns.setDefaultResultOrder("ipv4first");
} catch (e) {
  // Ignore on older runtimes
}

// Bounded LRU cache (max 500 items) to avoid memory leaks
class LRUCache<K, V> {
  private max: number;
  private cache: Map<K, V>;

  constructor(max = 500) {
    this.max = max;
    this.cache = new Map();
  }

  get(key: K): V | undefined {
    const item = this.cache.get(key);
    if (item === undefined) return undefined;
    // Refresh LRU order
    this.cache.delete(key);
    this.cache.set(key, item);
    return item;
  }

  set(key: K, value: V): this {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.max) {
      // Evict oldest item
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(key, value);
    return this;
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

const proxyCache = new LRUCache<string, { data: any; timestamp: number }>(500);
const imageMemoryCache = new LRUCache<string, { buffer: Buffer; contentType: string }>(400);
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes cache
const tmdbBackdropCache = new LRUCache<string, { url: string | null; logoUrl: string | null; timestamp: number }>(500);
const TMDB_TTL_MS = 24 * 60 * 60 * 1000; // 24h for TMDB images

async function fetchWithTimeout(url: string, timeoutMs = 12000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "application/json, text/plain, */*",
      },
    });
    clearTimeout(timer);
    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}`);
    }
    const data = await res.json();
    return data;
  } catch (err: any) {
    clearTimeout(timer);
    throw err;
  }
}

// ---- SSRF guard cho /api/proxy/generic (Prompt 3 BƯỚC 5) ----
function ipToBigInt(ip: string): bigint | null {
  try {
    if (net.isIPv4(ip)) {
      const p = ip.split(".").map(Number);
      return (BigInt(p[0]) << 24n) | (BigInt(p[1]) << 16n) | (BigInt(p[2]) << 8n) | BigInt(p[3]);
    }
    if (net.isIPv6(ip)) {
      // Expand :: shorthand
      const halves = ip.split("::");
      let head: string[] = halves[0] ? halves[0].split(":") : [];
      let tail: string[] = halves.length > 1 && halves[1] ? halves[1].split(":") : [];
      // Handle embedded IPv4 (e.g. ::ffff:127.0.0.1)
      const tail4 = tail.length > 0 && tail[tail.length - 1].includes(".") ? tail.pop() as string : null;
      const missing = 8 - head.length - tail.length - (tail4 ? 2 : 0);
      const groups = [...head, ...Array(Math.max(0, missing)).fill("0"), ...tail];
      let out = 0n;
      for (const g of groups) out = (out << 16n) | BigInt(parseInt(g || "0", 16));
      if (tail4) {
        const q = tail4.split(".").map(Number);
        out = (out << 32n) | (BigInt(q[0]) << 24n) | (BigInt(q[1]) << 16n) | (BigInt(q[2]) << 8n) | BigInt(q[3]);
      }
      return out;
    }
  } catch { /* fall through */ }
  return null;
}

function isBlockedIp(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "metadata.google.internal") return true;
  const v = ipToBigInt(ip);
  if (v === null) return true; // không parse được thì chặn cho chắc
  if (net.isIPv4(ip)) {
    const n = Number(v);
    const inCidr = (base: string, bits: number) => {
      const b = Number(ipToBigInt(base));
      const mask = bits === 0 ? 0 : (~0 >>> (32 - bits)) << (32 - bits);
      return (n & mask) === (b & mask);
    };
    return (
      inCidr("127.0.0.0", 8) ||
      inCidr("10.0.0.0", 8) ||
      inCidr("172.16.0.0", 12) ||
      inCidr("192.168.0.0", 16) ||
      inCidr("169.254.0.0", 16)
    );
  }
  // IPv6: ::1 và fc00::/7 (unique local)
  if (v === 1n) return true;
  const top7 = Number((v >> 121n) & 0x7fn);
  if (top7 === 0x7e) return true; // fc00::/7
  return false;
}

async function assertPublicHttpUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("Invalid url");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("Only http/https allowed");
  }
  const host = u.hostname.toLowerCase();
  if (host === "metadata.google.internal" || host === "metadata.google.internal.") {
    throw new Error("Blocked host");
  }
  // Phân giải hostname ra IP rồi chặn dải nội bộ (chống DNS rebinding cơ bản).
  let addrs: string[] = [];
  try {
    if (net.isIP(host)) {
      addrs = [host];
    } else {
      const resolved = await dns.promises.lookup(host, { all: true });
      addrs = resolved.map((r) => r.address);
    }
  } catch {
    throw new Error("DNS resolve failed");
  }
  if (addrs.length === 0 || addrs.some(isBlockedIp)) {
    throw new Error("Blocked internal address");
  }
  return u;
}

// Fetch cứng: redirect manual (kiểm tra lại IP sau MỖI lần redirect),
// TUYỆT ĐỐI không chuyển tiếp header của client.
async function fetchGenericHardened(startUrl: string, timeoutMs = 60000): Promise<any> {
  let current = startUrl;
  for (let hop = 0; hop < 6; hop++) {
    const u = await assertPublicHttpUrl(current);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(u.href, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept: "application/json, text/plain, */*",
        },
      });
    } catch (e: any) {
      clearTimeout(timer);
      throw e;
    }
    clearTimeout(timer);
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error(`Redirect ${res.status} without location`);
      try {
        current = new URL(loc, u.href).href;
      } catch {
        throw new Error("Invalid redirect location");
      }
      await res.arrayBuffer().catch(() => null);
      continue;
    }
    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}`);
    }
    return await res.json();
  }
  throw new Error("Too many redirects");
}

async function startServer() {
  const app = express();
  const isProd = process.env.NODE_ENV === "production";
  const PORT = Number(process.env.PORT) || (isProd ? 8080 : 3000);

  // ---- Firebase Admin: BẮT BUỘC, fail-fast (Prompt 3) ----
  // Service account là bí mật thật sự (bypass toàn bộ rules). Chỉ đặt qua biến
  // môi trường, TUYỆT ĐỐI không commit vào source. Thiếu là từ chối khởi động,
  // không bao giờ chạy tiếp ở chế độ không xác thực.
  const svcJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!svcJson) {
    console.error(
      "[FATAL] Missing FIREBASE_SERVICE_ACCOUNT_JSON. Server refuses to start without authentication. " +
      "Generate a new private key at Firebase Console > Project settings > Service accounts, " +
      "then set it as env var FIREBASE_SERVICE_ACCOUNT_JSON."
    );
    process.exit(1);
  }
  let serviceAccount: any;
  try {
    serviceAccount = JSON.parse(svcJson);
  } catch {
    console.error("[FATAL] FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON. Refusing to start.");
    process.exit(1);
  }
  try {
    initAdminApp({
      credential: adminCert(serviceAccount),
      databaseURL: "https://gaucinema-98e55-default-rtdb.asia-southeast1.firebasedatabase.app",
    });
    console.log("[auth] firebase-admin initialized for project:", serviceAccount.project_id || "(unknown)");
  } catch (e: any) {
    console.error("[FATAL] firebase-admin init failed:", e?.message || e);
    process.exit(1);
  }

  // ---- Middleware xác thực (Prompt 3) ----
  function getBearerToken(req: any): string | null {
    const h = req.headers?.authorization;
    if (typeof h !== "string") return null;
    const m = h.match(/^Bearer\s+(.+)$/i);
    return m ? m[1].trim() : null;
  }

  async function requireAuth(req: any, res: any, next: any) {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ error: "UNAUTHORIZED" });
    try {
      const decoded = await getAdminAuth().verifyIdToken(token);
      req.user = decoded;
      // Prompt 5 A1+A2.1: chặn ngay ở middleware (1 lượt đọc Firestore, cache
      // 60s). Khóa và hết hạn có hiệu lực với phiên đang dùng, không cần đợi
      // đăng nhập lại.
      const uid = (decoded as any)?.uid;
      if (!uid) return res.status(401).json({ error: "UNAUTHORIZED" });
      const acc = await getCachedAccount(uid);
      if (!acc) return res.status(401).json({ error: "UNAUTHORIZED" });
      if (acc.status === "blocked") {
        return res.status(403).json({ error: "ACCOUNT_BLOCKED" });
      }
      if (acc.role !== "admin" && acc.expiresAt && acc.expiresAt < Date.now()) {
        return res.status(403).json({ error: "ACCOUNT_EXPIRED", expiresAt: acc.expiresAt });
      }
      // Tự vá claim cho tài khoản cũ (tạo trước khi có claims): gán claim khớp
      // Firestore mà KHÔNG revoke (token tự refresh trong 1h, không đá user).
      // Các thao tác nhạy cảm (extend/khóa) vẫn revoke để hiệu lực ngay.
      try {
        const tokenClaims = (decoded as any) || {};
        if (
          acc.role !== "admin" &&
          typeof acc.expiresAt === "number" &&
          tokenClaims.expiresAt !== acc.expiresAt
        ) {
          const u = await getAdminAuth().getUser(uid).catch(() => null);
          const prev = ((u?.customClaims || {}) as Record<string, any>);
          if (prev.expiresAt !== acc.expiresAt) {
            getAdminAuth()
              .setCustomUserClaims(uid, { ...prev, expiresAt: acc.expiresAt })
              .catch(() => {});
          }
        }
      } catch {
        // ignore — không chặn request vì vá claim
      }
      req.account = acc;
      return next();
    } catch {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }
  }

  // Cache đọc accounts/{uid} 60s (Prompt 5 A1 — đỡ tốn quota mỗi request).
  // Lưu ý: vừa block/unblock/gia hạn xong có độ trễ tối đa 60s ở middleware
  // (revokeRefreshTokens + xóa slot xử lý ngay nên thực tế nhanh hơn nhiều).
  const accountCache = new Map<string, { at: number; data: any }>();
  const ACCOUNT_CACHE_MS = 60000;

  async function getCachedAccount(uid: string): Promise<any | null> {
    try {
      const cached = accountCache.get(uid);
      if (cached && Date.now() - cached.at < ACCOUNT_CACHE_MS) {
        return cached.data;
      }
      const snap = await getAdminFirestore().doc(`accounts/${uid}`).get();
      const data = snap.exists ? snap.data() : null;
      if (accountCache.size > 2000) accountCache.clear();
      accountCache.set(uid, { at: Date.now(), data });
      return data;
    } catch {
      return null;
    }
  }

  function bustAccountCache(uid: string): void {
    try {
      accountCache.delete(uid);
    } catch {
      // ignore
    }
  }

  function bustSlotCache(uid: string): void {
    try {
      for (const k of slotCheckCache.keys()) {
        if (k === uid || k.startsWith(uid + "|")) slotCheckCache.delete(k);
      }
    } catch {
      // ignore
    }
  }

  async function requireAdmin(req: any, res: any, next: any) {
    try {
      // Dùng lại document đã đọc ở requireAuth (1 lượt đọc cho cả 2 middleware).
      const role = req.account?.role;
      if (role !== "admin") {
        const uid = req.user?.uid;
        if (!uid) return res.status(401).json({ error: "UNAUTHORIZED" });
        const snap = await getAdminFirestore().doc(`accounts/${uid}`).get();
        const r = snap.exists ? (snap.data() as any)?.role : null;
        if (r !== "admin") return res.status(403).json({ error: "FORBIDDEN" });
        return next();
      }
      return next();
    } catch {
      return res.status(403).json({ error: "FORBIDDEN" });
    }
  }

  // Cộng N tháng lịch, xử lý tràn ngày (giống client Prompt 2 bước 2b).
  function addCalendarMonthsMs(fromMs: number, months: number): number {
    const base = new Date(fromMs);
    const day = base.getDate();
    const target = new Date(base);
    target.setDate(1);
    target.setMonth(target.getMonth() + months);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(day, lastDay));
    return target.getTime();
  }

  // Gán expiresAt vào custom claim (giữ nguyên claim cũ), revoke token cũ.
  // Rules Firestore (Prompt 6) đọc claim này mà không tốn lượt get().
  async function setExpiresClaim(uid: string, expiresAt: number | null): Promise<void> {
    const user = await getAdminAuth().getUser(uid);
    const prev = (user.customClaims || {}) as Record<string, any>;
    if (expiresAt === null) {
      const { expiresAt: _drop, ...rest } = prev;
      await getAdminAuth().setCustomUserClaims(uid, rest);
    } else {
      await getAdminAuth().setCustomUserClaims(uid, { ...prev, expiresAt });
    }
    await getAdminAuth().revokeRefreshTokens(uid).catch(() => {});
  }

  // ---- Giới hạn 2 thiết bị (Prompt 4 B7) ----
  // Client gửi deviceId qua header X-Device-Id trong MỌI request. Server kiểm
  // tra THIẾT BỊ CÓ GIỮ SLOT KHÔNG (sessions/{uid}/1|2), chứ không chỉ đã
  // đăng nhập chưa. Không có slot -> 409 NO_SESSION_SLOT (client hiện màn
  // hình chặn, KHÔNG signOut).
  // Cache memory 30s CHỈ cho kết quả cho phép (F1): kết quả từ chối KHÔNG
  // cache — nếu không máy vừa claim lại vẫn ăn 409 oan tới 30s.
  const slotCheckCache = new Map<string, { at: number }>();
  const SLOT_CACHE_MS = 30000;

  function pruneSlotCache() {
    try {
      if (slotCheckCache.size < 1000) return;
      const now = Date.now();
      for (const [k, v] of slotCheckCache) {
        if (now - v.at > SLOT_CACHE_MS) slotCheckCache.delete(k);
      }
    } catch {
      // ignore
    }
  }

  async function requireActiveSlot(req: any, res: any, next: any) {
    try {
      const uid = req.user?.uid;
      const deviceId = req.headers?.["x-device-id"];
      if (!uid) return res.status(401).json({ error: "UNAUTHORIZED" });
      if (typeof deviceId !== "string" || !deviceId) {
        return res.status(409).json({ error: "NO_SESSION_SLOT" });
      }
      const key = `${uid}|${deviceId}`;
      const cached = slotCheckCache.get(key);
      if (cached && Date.now() - cached.at < SLOT_CACHE_MS) {
        return next();
      }
      const snap = await getAdminDatabase().ref(`sessions/${uid}`).get();
      const val = snap.val() || {};
      const ok = val?.["1"]?.deviceId === deviceId || val?.["2"]?.deviceId === deviceId;
      if (ok) {
        slotCheckCache.set(key, { at: Date.now() });
        pruneSlotCache();
        return next();
      }
      return res.status(409).json({ error: "NO_SESSION_SLOT" });
    } catch {
      return res.status(409).json({ error: "NO_SESSION_SLOT" });
    }
  }

  // Enable CORS for Android app and other origins
  app.use(cors({
    origin: (origin, callback) => {
      // Allow any origin for native apps or dev environments
      if (!origin || origin === 'null' || origin.includes('localhost') || origin.includes('capacitor://') || origin.includes('run.app')) {
        callback(null, true);
      } else {
        callback(null, true); // Fallback to allow all for now to debug
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "X-Device-Id"],
    credentials: true
  }));

  app.use(express.json());

  // Health check endpoints for Cloud Run, GCP load balancers, and monitoring
  app.get(["/api/health", "/healthz", "/_ah/health"], (req, res) => {
    res.json({ status: "ok", message: "Gấu Cinema API Server is healthy", timestamp: Date.now() });
  });

  // --- FIREBASE REALTIME DATABASE SYNC & PRE-COMPUTED CACHE HELPERS ---
  // Dùng Admin SDK (bypass rules đúng cách). REST không kèm auth đã chết từ
  // khi RTDB bị khóa — mọi sync/fetch im lặng thất bại, batch chạy mà DB
  // không nhảy. Giữ nguyên chữ ký để không phải sửa 20+ chỗ gọi.
  const adminDb = getAdminDatabase();

  async function syncToRtdb(endpointPath: string, payload: any, retries = 3): Promise<boolean> {
    const cleanPath = endpointPath.replace(/^\/+/, "").replace(/\.json$/, "");
    let attempt = 0;
    let delay = 1000;

    while (attempt < retries) {
      try {
        await adminDb.ref(cleanPath).set(payload);
        return true;
      } catch (err: any) {
        attempt++;
        if (attempt >= retries) {
          console.log(`[RTDB Sync Info: ${endpointPath} write completed or bypassed]:`, err?.message);
          return false;
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
      }
    }
    return false;
  }

  async function fetchFromRtdb(endpointPath: string, retries = 2): Promise<any | null> {
    const cleanPath = endpointPath.replace(/^\/+/, "").replace(/\.json$/, "");
    let attempt = 0;
    let delay = 800;

    while (attempt < retries) {
      try {
        const snap = await adminDb.ref(cleanPath).get();
        if (snap.exists()) {
          return snap.val();
        }
        return null;
      } catch (err: any) {
        attempt++;
        if (attempt >= retries) {
          console.log(`[RTDB Fetch Info: ${endpointPath} fetch completed or bypassed]:`, err?.message);
          return null;
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
      }
    }
    return null;
  }

  // Helper to generate dynamic aesthetic color palette and contrast tokens for movies
  function generateMoviePalette(movie: { name?: string; origin_name?: string; genre?: string; content?: string }): {
    primary: string;
    accent: string;
    ambientGlow: string;
    isDark: boolean;
    textContrast: string;
  } {
    const text = `${movie.name || ""} ${movie.origin_name || ""} ${movie.genre || ""} ${movie.content || ""}`.toLowerCase();
    
    // Aesthetic Cinematic Palettes based on vibe/genre keywords
    if (text.includes("hành động") || text.includes("action") || text.includes("chiến tranh") || text.includes("lửa") || text.includes("sát thủ")) {
      return { primary: "#dc2626", accent: "#f87171", ambientGlow: "rgba(220, 38, 38, 0.35)", isDark: true, textContrast: "#ffffff" };
    }
    if (text.includes("kinh dị") || text.includes("horror") || text.includes("ma") || text.includes("quỷ") || text.includes("máu")) {
      return { primary: "#7f1d1d", accent: "#ef4444", ambientGlow: "rgba(127, 29, 29, 0.4)", isDark: true, textContrast: "#fecaca" };
    }
    if (text.includes("tình cảm") || text.includes("romance") || text.includes("lãng mạn") || text.includes("yêu")) {
      return { primary: "#db2777", accent: "#f472b6", ambientGlow: "rgba(219, 39, 119, 0.3)", isDark: true, textContrast: "#ffffff" };
    }
    if (text.includes("viễn tưởng") || text.includes("sci-fi") || text.includes("vũ trụ") || text.includes("cyberpunk")) {
      return { primary: "#06b6d4", accent: "#22d3ee", ambientGlow: "rgba(6, 182, 212, 0.35)", isDark: true, textContrast: "#ffffff" };
    }
    if (text.includes("hoạt hình") || text.includes("anime") || text.includes("animation") || text.includes("doraemon") || text.includes("dragon ball")) {
      return { primary: "#f59e0b", accent: "#fbbf24", ambientGlow: "rgba(245, 158, 11, 0.35)", isDark: true, textContrast: "#ffffff" };
    }
    if (text.includes("hài hước") || text.includes("comedy") || text.includes("phiêu lưu") || text.includes("adventure")) {
      return { primary: "#10b981", accent: "#34d399", ambientGlow: "rgba(16, 185, 129, 0.3)", isDark: true, textContrast: "#ffffff" };
    }
    if (text.includes("cổ trang") || text.includes("kiếm hiệp") || text.includes("thần thoại")) {
      return { primary: "#8b5cf6", accent: "#a78bfa", ambientGlow: "rgba(139, 92, 246, 0.35)", isDark: true, textContrast: "#ffffff" };
    }
    
    // Default refined cinematic blue / indigo palette
    return { primary: "#2563eb", accent: "#38bdf8", ambientGlow: "rgba(37, 99, 235, 0.3)", isDark: true, textContrast: "#ffffff" };
  }

  // --- PERSISTENT ADMIN MOVIE OVERRIDES (LOGOS, BACKDROPS, POSTERS, CUSTOM PALETTES) ---
  const movieOverridesMap = new Map<string, any>();
  let isMovieOverridesLoaded = false;

  async function loadMovieOverrides(): Promise<Map<string, any>> {
    try {
      const overridesFromRtdb = await fetchFromRtdb("system_cache/movie_overrides");
      if (overridesFromRtdb && typeof overridesFromRtdb === "object") {
        for (const [key, val] of Object.entries(overridesFromRtdb)) {
          if (val && typeof val === "object") {
            movieOverridesMap.set(key, val);
            if ((val as any).slug) {
              movieOverridesMap.set((val as any).slug, val);
            }
          }
        }
        isMovieOverridesLoaded = true;
      }
    } catch (err: any) {
      console.warn("[loadMovieOverrides Warning]:", err?.message);
    }
    return movieOverridesMap;
  }

  async function saveMovieOverride(slug: string, overrideData: any): Promise<boolean> {
    if (!slug) return false;
    const existing = movieOverridesMap.get(slug) || {};
    const merged = { ...existing, ...overrideData, slug, lastUpdated: Date.now() };
    movieOverridesMap.set(slug, merged);
    
    // Asynchronously save to RTDB
    return syncToRtdb(`system_cache/movie_overrides/${slug}`, merged);
  }

  function mergeMovieOverrides(movie: any, prevMovie?: any): any {
    if (!movie) return movie;
    const slug = movie.slug;
    const tmdbId = movie.tmdbId || movie.tmdb?.id;
    const override = (slug ? movieOverridesMap.get(slug) : null) || (tmdbId ? movieOverridesMap.get(String(tmdbId)) : null);

    const merged = { ...movie };

    // 1. If persistent override exists in database
    if (override) {
      if (override.logo_url) merged.logo_url = override.logo_url;
      if (override.backdrop_url) merged.backdrop_url = override.backdrop_url;
      if (override.poster_url) merged.poster_url = override.poster_url;
      if (override.thumb_url) merged.thumb_url = override.thumb_url;
      if (override.color_palette) merged.color_palette = override.color_palette;
      if (Array.isArray(override.logos) && override.logos.length > 0) {
        merged.logos = override.logos;
      }
      if (Array.isArray(override.backdrops) && override.backdrops.length > 0) {
        merged.backdrops = override.backdrops;
      }
    }

    // 2. If previous movie had custom logo/backdrop selected (e.g. from existing cache or hero list)
    if (prevMovie) {
      if (!merged.logo_url && prevMovie.logo_url) merged.logo_url = prevMovie.logo_url;
      if (prevMovie.backdrop_url && (!merged.backdrop_url || prevMovie.backdrop_url !== movie.thumb_url)) {
        merged.backdrop_url = prevMovie.backdrop_url;
      }
      if (Array.isArray(prevMovie.logos) && prevMovie.logos.length > 0) {
        const primaryLogo = prevMovie.logos.find((l: any) => l.primary);
        if (primaryLogo) {
          merged.logo_url = primaryLogo.url;
          merged.logos = prevMovie.logos;
        }
      }
      if (Array.isArray(prevMovie.backdrops) && prevMovie.backdrops.length > 0) {
        const primaryBackdrop = prevMovie.backdrops.find((b: any) => b.primary);
        if (primaryBackdrop) {
          merged.backdrop_url = primaryBackdrop.url;
          merged.backdrops = prevMovie.backdrops;
        }
      }
      if (prevMovie.color_palette) {
        merged.color_palette = prevMovie.color_palette;
      }
    }

    return merged;
  }

  // Internal TMDB Backdrop & Logo fetcher with caching (up to 3 backdrops & 3 logos)
  async function getTmdbAssetsInternal(tmdbId: string, force = false, tmdbType?: string): Promise<{
    backdropUrl: string | null;
    logoUrl: string | null;
    width?: number;
    height?: number;
    backdrops: Array<{ url: string; width?: number; height?: number; vote_average?: number; vote_count?: number; iso_639_1?: string; primary: boolean }>;
    logos: Array<{ url: string; width?: number; height?: number; vote_average?: number; vote_count?: number; iso_639_1?: string; primary: boolean }>;
  }> {
    const id = String(tmdbId || "").trim();
    if (!id || !/^\d+$/.test(id)) return { backdropUrl: null, logoUrl: null, backdrops: [], logos: [] };
    const normalizedType = tmdbType === 'tv' ? 'tv' : tmdbType === 'movie' ? 'movie' : undefined;
    const cacheKey = normalizedType ? `${id}:${normalizedType}` : id;
    const cached = tmdbBackdropCache.get(cacheKey) as any;
    if (!force && cached && Date.now() - cached.timestamp < TMDB_TTL_MS && cached.backdrops) {
      return {
        backdropUrl: cached.url,
        logoUrl: cached.logoUrl || null,
        backdrops: cached.backdrops || [],
        logos: cached.logos || [],
      };
    }
    const bearer = process.env.TMDB_BEARER_TOKEN || process.env.TMDB_READ_TOKEN || "";
    const apiKey = process.env.TMDB_API_KEY || "";
    const headers: Record<string, string> = { Accept: "application/json", "User-Agent": "GauCinema/1.0" };
    if (bearer) headers["Authorization"] = `Bearer ${bearer}`;
    const tryUrls: string[] = [];
    
    const imgLangs = "null,en,vi,ja,ko,zh,th,fr,de,es,xx";
    // Nếu có type thì ưu tiên type đó trước (fix 296206: type=tv)
    const movieUrls: string[] = [];
    const tvUrls: string[] = [];
    if (bearer) movieUrls.push(`https://api.themoviedb.org/3/movie/${id}/images?include_image_language=${imgLangs}`);
    if (apiKey) movieUrls.push(`https://api.themoviedb.org/3/movie/${id}/images?include_image_language=${imgLangs}&api_key=${apiKey}`);
    if (bearer) tvUrls.push(`https://api.themoviedb.org/3/tv/${id}/images?include_image_language=${imgLangs}`);
    if (apiKey) tvUrls.push(`https://api.themoviedb.org/3/tv/${id}/images?include_image_language=${imgLangs}&api_key=${apiKey}`);
    if (normalizedType === 'tv') tryUrls.push(...tvUrls, ...movieUrls);
    else if (normalizedType === 'movie') tryUrls.push(...movieUrls, ...tvUrls);
    else tryUrls.push(...movieUrls, ...tvUrls);

    const candidates: Array<{ url: string; backdropUrl: string | null; logoUrl: string | null; backdrops: any[]; logos: any[]; score: number }> = [];

    for (const url of tryUrls) {
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 6000);
        const r = await fetch(url, { headers, signal: controller.signal });
        clearTimeout(t);
        if (!r.ok) continue;
        const data: any = await r.json();
        const rawBackdrops: any[] = data.backdrops || [];
        const rawLogos: any[] = (data.logos || []) as any[];

        // Extract up to 3 candidate logos (sorted by vi -> en -> others, then rating/vote/score)
        const extractedLogos: Array<{ url: string; width?: number; height?: number; vote_average?: number; vote_count?: number; iso_639_1?: string; primary: boolean }> = [];
        if (rawLogos.length > 0) {
          const sortedLogos = [...rawLogos].sort((a, b) => {
            const langScore = (iso: string | null) => iso === 'vi' ? 0 : iso === 'en' ? 1 : 2;
            const ls = langScore(a.iso_639_1) - langScore(b.iso_639_1);
            if (ls !== 0) return ls;
            const scoreA = (Number(a.vote_count) > 0 ? (Number(a.vote_average) * Number(a.vote_count) + 15) / (Number(a.vote_count) + 3) : 0) * 1000 + (a.width || 0);
            const scoreB = (Number(b.vote_count) > 0 ? (Number(b.vote_average) * Number(b.vote_count) + 15) / (Number(b.vote_count) + 3) : 0) * 1000 + (b.width || 0);
            return scoreB - scoreA;
          });
          
          const topLogos = sortedLogos.slice(0, 3);
          topLogos.forEach((l, idx) => {
            if (l.file_path) {
              extractedLogos.push({
                url: `https://image.tmdb.org/t/p/original${l.file_path}`,
                width: l.width,
                height: l.height,
                vote_average: l.vote_average,
                vote_count: l.vote_count,
                iso_639_1: l.iso_639_1,
                primary: idx === 0,
              });
            }
          });
        }

        const isNoLanguage = (img: any) => {
          const iso = img.iso_639_1;
          return !iso || iso === 'null' || iso === 'xx' || iso === '';
        };

        const sortTmdbRatingDesc = (list: any[]) => {
          return [...list].sort((a, b) => {
            const avgDiff = (Number(b.vote_average) || 0) - (Number(a.vote_average) || 0);
            if (Math.abs(avgDiff) > 0.001) return avgDiff;
            const countDiff = (Number(b.vote_count) || 0) - (Number(a.vote_count) || 0);
            if (countDiff !== 0) return countDiff;
            return (Number(b.width) || 0) - (Number(a.width) || 0);
          });
        };

        // Extract up to 3 candidate backdrops (prioritizing textless high-resolution)
        const extractedBackdrops: Array<{ url: string; width?: number; height?: number; vote_average?: number; vote_count?: number; iso_639_1?: string; primary: boolean }> = [];
        if (rawBackdrops.length > 0) {
          const noLangBackdrops = rawBackdrops.filter(isNoLanguage);
          const candidateList = noLangBackdrops.length >= 3 ? noLangBackdrops : rawBackdrops;
          const sorted = sortTmdbRatingDesc(candidateList);
          const topBackdrops = sorted.slice(0, 3);
          topBackdrops.forEach((b, idx) => {
            if (b.file_path) {
              extractedBackdrops.push({
                url: `https://image.tmdb.org/t/p/original${b.file_path}`,
                width: b.width,
                height: b.height,
                vote_average: b.vote_average,
                vote_count: b.vote_count,
                iso_639_1: b.iso_639_1,
                primary: idx === 0,
              });
            }
          });
        }

        // Fallback to posters if no backdrops available
        if (extractedBackdrops.length === 0) {
          const rawPosters: any[] = data.posters || [];
          if (rawPosters.length > 0) {
            const sortedPosters = sortTmdbRatingDesc(rawPosters);
            sortedPosters.slice(0, 3).forEach((p, idx) => {
              if (p.file_path) {
                extractedBackdrops.push({
                  url: `https://image.tmdb.org/t/p/original${p.file_path}`,
                  width: p.width,
                  height: p.height,
                  vote_average: p.vote_average,
                  vote_count: p.vote_count,
                  iso_639_1: p.iso_639_1,
                  primary: idx === 0,
                });
              }
            });
          }
        }

        const primaryBackdrop = extractedBackdrops.find(b => b.primary)?.url || (extractedBackdrops[0]?.url || null);
        const primaryLogo = extractedLogos.find(l => l.primary)?.url || (extractedLogos[0]?.url || null);

        if (primaryBackdrop || primaryLogo) {
          // Score để chọn giữa movie vs tv khi cùng ID tồn tại (ví dụ 296206)
          const hasViLogo = extractedLogos.some(l => l.iso_639_1 === 'vi');
          const hasViBackdrop = extractedBackdrops.some(b => b.iso_639_1 === 'vi');
          const maxVote = Math.max(0, ...extractedBackdrops.map(b => Number(b.vote_average) || 0), ...extractedLogos.map(l => Number(l.vote_average) || 0));
          const totalCount = extractedBackdrops.length + extractedLogos.length;
          const score = (hasViLogo ? 1000 : 0) + (hasViBackdrop ? 500 : 0) + maxVote * 100 + totalCount * 10 + (primaryBackdrop ? 5 : 0) + (primaryLogo ? 5 : 0);
          candidates.push({ url, backdropUrl: primaryBackdrop, logoUrl: primaryLogo, backdrops: extractedBackdrops, logos: extractedLogos, score });
        }
      } catch {}
    }

    if (candidates.length > 0) {
      // Nếu có type thì ưu tiên type đó, không dùng điểm để đoán
      let pool = candidates;
      if (normalizedType) {
        const typed = candidates.filter(c => c.url.includes(`/${normalizedType}/`));
        if (typed.length > 0) pool = typed;
      }
      pool.sort((a, b) => b.score - a.score);
      const best = pool[0];
      (tmdbBackdropCache as any).set(cacheKey, {
        url: best.backdropUrl,
        logoUrl: best.logoUrl,
        backdrops: best.backdrops,
        logos: best.logos,
        timestamp: Date.now(),
      });
      return {
        backdropUrl: best.backdropUrl,
        logoUrl: best.logoUrl,
        backdrops: best.backdrops,
        logos: best.logos,
        width: best.backdrops[0]?.width,
        height: best.backdrops[0]?.height,
      };
    }

    tmdbBackdropCache.set(cacheKey, { url: null, logoUrl: null, timestamp: Date.now() } as any);
    return { backdropUrl: null, logoUrl: null, backdrops: [], logos: [] };
  }

  // IntroDB proxy - APK-safe (no cache, single fetch per episode). Handles CORS for native WebView.
  app.get("/api/intro/segments", requireAuth, requireActiveSlot, async (req, res) => {
    // Never allow browser/proxy caching here: Express ETag would answer 304
    // with empty body, and FE fetch (res.ok=false on 304) would drop segments.
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    const imdb_id = String(req.query.imdb_id || "").trim();
    const season = Number(req.query.season);
    const episode = Number(req.query.episode);
    if (!/^tt\d{7,8}$/.test(imdb_id) || !season || !episode || season < 1 || episode < 1) {
      return res.status(400).json({ error: "Invalid imdb_id/season/episode", imdb_id, season, episode });
    }
    const target = `https://api.introdb.app/segments?imdb_id=${encodeURIComponent(imdb_id)}&season=${season}&episode=${episode}`;
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 6000);
      const r = await fetch(target, {
        headers: { Accept: "application/json", "User-Agent": "GauCinema/1.0" },
        signal: controller.signal,
      });
      clearTimeout(t);
      const text = await r.text();
      // IntroDB returns 404 when no segments -> forward as 200 with nulls so FE can skip gracefully
      if (r.status === 404) {
        return res.json({ imdb_id, season, episode, intro: null, recap: null, outro: null });
      }
      if (!r.ok) return res.status(r.status).send(text);
      res.setHeader("Content-Type", "application/json");
      return res.send(text);
    } catch (e: any) {
      return res.status(502).json({ error: e.message || "IntroDB proxy failed", imdb_id, season, episode });
    }
  });

  // TMDB Backdrop + Logo proxy (like chophim.app) - returns original backdrop/logotype for hero banner
  app.get("/api/tmdb/backdrop/:tmdbId", requireAuth, requireActiveSlot, async (req, res) => {
    const tmdbId = String(req.params.tmdbId || "").trim();
    if (!tmdbId || !/^\d+$/.test(tmdbId)) return res.status(400).json({ error: "Invalid tmdbId" });
    const force = req.query.force === "true" || req.query.force === "1";
    const tmdbType = typeof req.query.type === 'string' ? req.query.type : undefined;
    const assets = await getTmdbAssetsInternal(tmdbId, force, tmdbType);
    return res.json({ tmdbId, ...assets, cached: !force });
  });

  // TMDB Generic Proxy - expose toàn bộ TMDb v3 endpoints bạn liệt kê qua Bearer server-side
  // Base: /api/tmdb/v3/*  -> https://api.themoviedb.org/3/*
  const tmdbGenericCache = new LRUCache<string, { data: any; timestamp: number }>(200);
  app.use("/api/tmdb/v3", requireAuth, requireActiveSlot, async (req: any, res, next) => {
    if (req.method !== "GET") return next();
    const fullPath = req.originalUrl || req.url || "";
    // extract subPath after /api/tmdb/v3/
    const m = fullPath.match(/\/api\/tmdb\/v3\/([^\?]+)/);
    const subPath = m ? m[1] : "";
    if (!subPath) return res.status(400).json({ error: "Missing TMDB path" });
    const qs = new URLSearchParams(req.query as Record<string, string>).toString();
    const target = `https://api.themoviedb.org/3/${subPath}${qs ? `?${qs}` : ""}`;
    const cacheKey = `v3:${subPath}?${qs}`;
    const cached = tmdbGenericCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
      return res.json(cached.data);
    }
    const bearer = process.env.TMDB_BEARER_TOKEN || process.env.TMDB_READ_TOKEN || "";
    const apiKey = process.env.TMDB_API_KEY || "";
    const headers: Record<string, string> = { Accept: "application/json", "User-Agent": "GauCinema/1.0" };
    if (bearer) headers["Authorization"] = `Bearer ${bearer}`;
    // auto-inject api_key if no bearer
    let finalUrl = target;
    if (!bearer && apiKey && !target.includes("api_key=")) {
      finalUrl += (qs ? "&" : "?") + `api_key=${apiKey}`;
    }
    // default language vi-VN if not specified
    if (!finalUrl.includes("language=") && (subPath.includes("movie") || subPath.includes("tv") || subPath.includes("trending") || subPath.includes("search") || subPath.includes("discover"))) {
      finalUrl += (finalUrl.includes("?") ? "&" : "?") + "language=vi-VN";
    }
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 8000);
      const r = await fetch(finalUrl, { headers, signal: controller.signal });
      clearTimeout(t);
      if (!r.ok) {
        const text = await r.text();
        return res.status(r.status).json({ error: `TMDB ${r.status}`, body: text.slice(0, 500) });
      }
      const data = await r.json();
      tmdbGenericCache.set(cacheKey, { data, timestamp: Date.now() });
      return res.json(data);
    } catch (e: any) {
      return res.status(502).json({ error: e.message || "TMDB proxy failed" });
    }
  });

  // TMDB Trending (hot) - like chophim: lấy phim đang hot quốc tế làm fallback hero
  const tmdbTrendingCache = new LRUCache<string, { data: any; timestamp: number }>(10);
  app.get("/api/tmdb/trending", requireAuth, requireActiveSlot, async (req, res) => {
    const cacheKey = "trending:movie:day:vi";
    const cached = tmdbTrendingCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 10 * 60 * 1000) {
      return res.json(cached.data);
    }
    const bearer = process.env.TMDB_BEARER_TOKEN || process.env.TMDB_READ_TOKEN || "";
    const apiKey = process.env.TMDB_API_KEY || "";
    const headers: Record<string, string> = { Accept: "application/json", "User-Agent": "GauCinema/1.0" };
    if (bearer) headers["Authorization"] = `Bearer ${bearer}`;
    const urls: string[] = [];
    if (bearer) urls.push("https://api.themoviedb.org/3/trending/movie/day?language=vi-VN");
    if (apiKey) urls.push(`https://api.themoviedb.org/3/trending/movie/day?language=vi-VN&api_key=${apiKey}`);
    if (bearer) urls.push("https://api.themoviedb.org/3/movie/popular?language=vi-VN&page=1");
    if (apiKey) urls.push(`https://api.themoviedb.org/3/movie/popular?language=vi-VN&page=1&api_key=${apiKey}`);
    for (const url of urls) {
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 6000);
        const r = await fetch(url, { headers, signal: controller.signal });
        clearTimeout(t);
        if (!r.ok) continue;
        const data: any = await r.json();
        const results = (data.results || []).slice(0, 20).map((it: any) => ({
          tmdbId: String(it.id),
          title: it.title || it.name || "",
          original_title: it.original_title || it.original_name || "",
          overview: it.overview || "",
          release_date: it.release_date || it.first_air_date || "",
          vote_average: it.vote_average || 0,
          backdrop_path: it.backdrop_path || null,
          poster_path: it.poster_path || null,
          backdropUrl: it.backdrop_path ? `https://image.tmdb.org/t/p/original${it.backdrop_path}` : null,
          posterUrl: it.poster_path ? `https://image.tmdb.org/t/p/w500${it.poster_path}` : null,
        }));
        const payload = { results, total: results.length };
        tmdbTrendingCache.set(cacheKey, { data: payload, timestamp: Date.now() });
        return res.json(payload);
      } catch {}
    }
    return res.status(502).json({ results: [], error: "TMDB trending failed" });
  });

    // Hero Banner - TMDB Discover (vi-VN, region VN, sort popularity.desc) + validate stream availability + Precompute 4K backdrop, Logo, and Color Palette
  const tmdbHeroCache = new LRUCache<string, { data: any; timestamp: number }>(10);
  let isHeroRefreshing = false;

  // Chuẩn hóa tên để so khớp TMDB <-> phimapi (tránh gắn nhầm như Ám Ảnh/Obsession -> Bạch Dạ Ám Ảnh)
  function normHeroTitle(s: any): string {
    return String(s || "").toLowerCase().trim().replace(/[“”"'`’.:;\-–—!?()[\]{}]/g, " ").replace(/\s+/g, " ").trim();
  }
  function stripHeroDiacritics(s: string): string {
    try { return s.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); } catch { return s; }
  }
  // Chọn kết quả phimapi khớp nhất với TMDB; trả null nếu không đủ tin cậy (thà bỏ qua còn hơn gắn nhầm)
  // Ưu tiên 1: khớp tmdb.id chính xác (phimapi search đã trả kèm tmdb.id) — vd 1339713 -> Ám Ảnh/Obsession, không lấy nhầm Bạch Dạ 292435.
  // Fallback: chấm điểm tên/năm/loại khi thiếu tmdb.id.
  function pickBestPhimapiMatch(foundItems: any[], opts: { title: string; originalTitle: string; altTitle?: string; year?: number; tmdbId?: string }): any | null {
    if (!Array.isArray(foundItems) || foundItems.length === 0) return null;
    const wantId = opts.tmdbId ? String(opts.tmdbId).trim() : '';
    if (wantId) {
      const byId = foundItems.find((c: any) => c && c.slug && String(c?.tmdb?.id ?? '').trim() === wantId);
      if (byId) return byId;
    }
    const t = normHeroTitle(opts.title);
    const ot = normHeroTitle(opts.originalTitle);
    const tFlat = normHeroTitle(stripHeroDiacritics(opts.title));
    const otFlat = normHeroTitle(stripHeroDiacritics(opts.originalTitle));
    // Tên Việt từ TMDB (vd Tudum "The 4 Rascals" <-> TMDB "Bộ Tứ Báo Thủ"
    // <-> phimapi name "Bộ Tứ Báo Thủ"). Chỉ khớp CHÍNH XÁC.
    const at = normHeroTitle(opts.altTitle || "");
    const atFlat = normHeroTitle(stripHeroDiacritics(opts.altTitle || ""));
    let best: any = null;
    let bestScore = -Infinity;
    for (const c of foundItems) {
      if (!c || !c.slug) continue;
      const cName = normHeroTitle(c.name);
      const cOrigin = normHeroTitle(c.origin_name);
      const cNameFlat = normHeroTitle(stripHeroDiacritics(c.name));
      const cOriginFlat = normHeroTitle(stripHeroDiacritics(c.origin_name));
      let score = 0;
      if (cName && t && cName === t) score += 10;
      else if (cNameFlat && tFlat && cNameFlat === tFlat) score += 8;
      else if (t && cName && t.length >= 4 && (cName.includes(t) || t.includes(cName))) score += 2;
      if (cOrigin && ot && cOrigin === ot) score += 8;
      else if (cOriginFlat && otFlat && cOriginFlat === otFlat) score += 6;
      else if (cOrigin && t && cOrigin === t) score += 4;
      // Cầu Anh-Việt qua tên Việt chính chủ của TMDB (chỉ chính xác tuyệt đối)
      if (cName && at && cName === at) score += 10;
      else if (cNameFlat && atFlat && cNameFlat === atFlat) score += 8;
      else if (cOrigin && at && cOrigin === at) score += 6;
      if (opts.year && Number(c.year) === Number(opts.year)) score += 3;
      // discover/movie là phim lẻ -> ưu tiên single, phạt series (case Ám Ảnh movie vs Bạch Dạ series)
      if (c.type === "single") score += 4;
      else if (c.type === "series" || c.type === "tvshows") score -= 2;
      if (score > bestScore) { bestScore = score; best = c; }
    }
    if (!best || bestScore < 10) return null;
    return best;
  }

  async function refreshHeroPopular(force = false): Promise<any> {
    const cacheKey = "hero:discover:vi-VN:VN:popularity.desc:v3";
    const bearer = process.env.TMDB_BEARER_TOKEN || process.env.TMDB_READ_TOKEN || "";
    const apiKey = process.env.TMDB_API_KEY || "";
    const headers: Record<string, string> = { Accept: "application/json", "User-Agent": "GauCinema/1.0" };
    if (bearer) headers["Authorization"] = `Bearer ${bearer}`;
    const urls: string[] = [];
    if (bearer) urls.push("https://api.themoviedb.org/3/discover/movie?language=vi-VN&region=VN&sort_by=popularity.desc&page=1");
    if (apiKey) urls.push(`https://api.themoviedb.org/3/discover/movie?language=vi-VN&region=VN&sort_by=popularity.desc&page=1&api_key=${apiKey}`);
    if (bearer) urls.push("https://api.themoviedb.org/3/discover/movie?language=vi-VN&region=VN&sort_by=popularity.desc&page=2");
    if (apiKey) urls.push(`https://api.themoviedb.org/3/discover/movie?language=vi-VN&region=VN&sort_by=popularity.desc&page=2&api_key=${apiKey}`);

    let tmdbResults: any[] = [];
    for (const url of urls) {
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 5000);
        const r = await fetch(url, { headers, signal: controller.signal });
        clearTimeout(t);
        if (!r.ok) continue;
        const data: any = await r.json();
        const results = data.results || [];
        if (results.length) {
          tmdbResults = tmdbResults.concat(results);
          if (tmdbResults.length >= 30) break;
        }
      } catch {}
    }

    if (tmdbResults.length === 0) {
      // Try to load pre-computed batch from Firebase RTDB
      const rtdbBackup = await fetchFromRtdb("system_cache/hero_banner");
      if (rtdbBackup && rtdbBackup.items && rtdbBackup.items.length >= 6) {
        tmdbHeroCache.set(cacheKey, { data: rtdbBackup, timestamp: Date.now() });
        return rtdbBackup;
      }
      return null;
    }

    // Parallel batch validation: kiểm tra song song các phim và tự động lấy Logo + Backdrop 4K + Palette
    const candidates = tmdbResults.slice(0, 30);
    const checkBatch = async (itemsToCheck: any[]) => {
      return Promise.all(
        itemsToCheck.map(async (it: any) => {
          const title: string = (it.title || it.original_title || "").trim();
          if (!title) return null;
          const searchQuery = title.replace(/\s*\(.*?\)/, "").replace(/:\s*.*$/, "").trim();
          if (!searchQuery) return null;
          try {
            const searchUrl = `https://phimapi.com/v1/api/tim-kiem?keyword=${encodeURIComponent(searchQuery)}&limit=10`;
            const searchRes = await fetchWithTimeout(searchUrl, 3000).catch(() => null);
            const foundItems = searchRes?.data?.items || searchRes?.items || [];
            if (!foundItems || foundItems.length === 0) return null;
            // Không lấy [0] mù quáng (phimapi sort theo modified -> dễ gắn nhầm, vd "Ám Ảnh" trả Bạch Dạ trước Obsession).
            // Khớp tmdb.id trước, fallback chấm điểm tên/năm/loại để chọn đúng phim.
            const tmdbYear = it.release_date ? Number(String(it.release_date).slice(0, 4)) : undefined;
            const matchedItem = pickBestPhimapiMatch(foundItems, { title, originalTitle: it.original_title || "", year: tmdbYear, tmdbId: String(it.id) });
            if (!matchedItem?.slug) return null;

            const tmdbId = String(it.id);
            // Parallel fetch TMDB Backdrop & Logo
            let backdropUrl = it.backdrop_path ? `https://image.tmdb.org/t/p/original${it.backdrop_path}` : matchedItem.thumb_url || "";
            let logoUrl: string | null = null;
            let backdrops: any[] = [];
            let logos: any[] = [];
            try {
              const assets = await getTmdbAssetsInternal(tmdbId);
              if (assets.backdropUrl) backdropUrl = assets.backdropUrl;
              if (assets.logoUrl) logoUrl = assets.logoUrl;
              backdrops = assets.backdrops || [];
              logos = assets.logos || [];
            } catch {}

            if (backdrops.length === 0 && backdropUrl) {
              backdrops = [{ url: backdropUrl, primary: true }];
            }
            if (logos.length === 0 && logoUrl) {
              logos = [{ url: logoUrl, primary: true }];
            }

            // Compute dynamic color palette and contrast tokens
            const color_palette = generateMoviePalette({
              name: matchedItem.name || it.title,
              origin_name: matchedItem.origin_name || it.original_title,
              content: it.overview || "",
            });

            return {
              slug: matchedItem.slug,
              name: matchedItem.name || it.title,
              origin_name: matchedItem.origin_name || it.original_title || "",
              poster_url: (it.poster_path ? `https://image.tmdb.org/t/p/w500${it.poster_path}` : matchedItem.poster_url || matchedItem.thumb_url || ""),
              thumb_url: (it.poster_path ? `https://image.tmdb.org/t/p/w500${it.poster_path}` : matchedItem.thumb_url || matchedItem.poster_url || ""),
              backdrop_url: backdropUrl,
              logo_url: logoUrl,
              backdrops,
              logos,
              color_palette,
              year: matchedItem.year || (it.release_date ? Number(String(it.release_date).slice(0, 4)) : undefined),
              quality: matchedItem.quality || "FHD",
              lang: matchedItem.lang || "Vietsub",
              source: "kkphim",
              sourceLabel: "KKPhim",
              tmdb: { id: tmdbId, type: "movie" },
              tmdbId: tmdbId,
              content: it.overview || "",
              vote_average: it.vote_average,
              popularity: it.popularity,
            };
          } catch {
            return null;
          }
        })
      );
    };

    // Chạy song song 2 batch (mỗi batch 15 phim)
    const items: any[] = [];
    const usedSlugs = new Set<string>();

    const batch1 = await checkBatch(candidates.slice(0, 15));
    for (const res of batch1) {
      if (res && !usedSlugs.has(res.slug)) {
        usedSlugs.add(res.slug);
        items.push(res);
        if (items.length >= 10) break;
      }
    }

    if (items.length < 10) {
      const batch2 = await checkBatch(candidates.slice(15, 30));
      for (const res of batch2) {
        if (res && !usedSlugs.has(res.slug)) {
          usedSlugs.add(res.slug);
          items.push(res);
          if (items.length >= 10) break;
        }
      }
    }

    // Fallback nếu vẫn < 10: lấy nhanh phim lẻ chất lượng cao
    if (items.length < 10) {
      try {
        const catRes = await fetchWithTimeout(`https://phimapi.com/v1/api/danh-sach/phim-le?page=1&limit=20`, 4000).catch(() => null);
        const catItems = catRes?.data?.items || catRes?.items || [];
        for (const catItem of catItems) {
          if (items.length >= 10) break;
          if (!catItem.slug || usedSlugs.has(catItem.slug)) continue;
          const tmdbId = catItem.tmdb?.id ? String(catItem.tmdb.id) : null;
          const palette = generateMoviePalette({ name: catItem.name, origin_name: catItem.origin_name });
          const filler: any = {
            slug: catItem.slug,
            name: catItem.name,
            origin_name: catItem.origin_name || "",
            poster_url: catItem.poster_url || catItem.thumb_url || "",
            thumb_url: catItem.thumb_url || catItem.poster_url || "",
            backdrop_url: catItem.poster_url || catItem.thumb_url || "",
            color_palette: palette,
            year: catItem.year,
            quality: catItem.quality || "FHD",
            lang: catItem.lang || "Vietsub",
            source: "kkphim",
            sourceLabel: "KKPhim",
          };
          if (tmdbId) {
            filler.tmdb = { id: tmdbId, type: "movie" };
            filler.tmdbId = tmdbId;
            try {
              const assets = await getTmdbAssetsInternal(tmdbId);
              if (assets.backdropUrl) filler.backdrop_url = assets.backdropUrl;
              if (assets.logoUrl) filler.logo_url = assets.logoUrl;
              filler.backdrops = assets.backdrops || [];
              filler.logos = assets.logos || [];
            } catch {}
          }
          if (!filler.backdrops || filler.backdrops.length === 0) {
            filler.backdrops = [{ url: filler.backdrop_url, primary: true }];
          }
          if (!filler.logos || filler.logos.length === 0) {
            filler.logos = filler.logo_url ? [{ url: filler.logo_url, primary: true }] : [];
          }
          usedSlugs.add(filler.slug);
          items.push(filler);
        }
      } catch {}
    }

    // Load overrides and merge with any existing hero configs
    await loadMovieOverrides();
    const existingHero = tmdbHeroCache.get(cacheKey)?.data?.items || [];
    const prevHeroMap = new Map<string, any>();
    for (const h of existingHero) {
      if (h.slug) prevHeroMap.set(h.slug, h);
    }
    const finalItems = items.slice(0, 10).map((m: any) => mergeMovieOverrides(m, prevHeroMap.get(m.slug)));

    const payload = {
      status: true,
      items: finalItems,
      total: finalItems.length,
      source: "tmdb_discover_vi-VN_VN_popularity.desc_validated_rtdb",
      lastUpdated: Date.now(),
    };

    // Save to LRU Memory Cache
    tmdbHeroCache.set(cacheKey, { data: payload, timestamp: Date.now() });

    // Asynchronously Persist to Firebase Realtime Database for instant global reads
    syncToRtdb("system_cache/hero_banner", payload).catch(() => {});

    return payload;
  }

  app.get("/api/tmdb/hero-popular", requireAuth, requireActiveSlot, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const cacheKey = "hero:discover:vi-VN:VN:popularity.desc:v3";
    const force = req.query.refresh === '1' || req.query.force === '1';
    const cached = tmdbHeroCache.get(cacheKey);

    // [TESTING MODE] If force requested or no cache, prioritize fresh fetch or real-time RTDB
    if (!force && cached && cached.data?.items?.length >= 8) {
      return res.json(cached.data);
    }

    try {
      // Chỉ dùng RTDB shortcut khi KHÔNG force; khi force (?refresh=1) phải recompute để đẩy item gắn nhầm ra
      if (!force) {
        const rtdbData = await fetchFromRtdb("system_cache/hero_banner");
        if (rtdbData && rtdbData.items && rtdbData.items.length >= 8) {
          tmdbHeroCache.set(cacheKey, { data: rtdbData, timestamp: Date.now() });
          return res.json(rtdbData);
        }
      }

      const payload = await refreshHeroPopular(force);
      if (payload) return res.json(payload);
      if (cached) return res.json(cached.data);
      return res.status(502).json({ status: false, items: [], error: "TMDB popular fetch failed" });
    } catch (e: any) {
      if (cached) return res.json(cached.data);
      return res.status(502).json({ status: false, items: [], error: e.message || "TMDB hero failed" });
    }
  });

  // Comprehensive System API Health Check & Ping Tester (Backend-based to prevent CORS & accurately measure latency)
  app.post("/api/system/apis/ping", requireAuth, requireActiveSlot, requireAdmin, async (req, res) => {
    let { url, timeoutMs = 8000 } = req.body || {};
    if (!url || typeof url !== "string" || !url.startsWith("http")) {
      return res.status(400).json({
        ok: false,
        status: "down",
        statusCode: 400,
        latencyMs: 0,
        message: "URL không hợp lệ hoặc thiếu giao thức http/https",
      });
    }

    // Auto-resolve known bare root domains that return 404 because they only serve subpaths
    const cleanUrl = url.trim().replace(/\/+$/, "");
    let targetUrl = url;
    if (cleanUrl === "https://phimapi.com" || cleanUrl === "http://phimapi.com") {
      targetUrl = "https://phimapi.com/danh-sach/phim-moi-cap-nhat?page=1";
    } else if (cleanUrl.includes("ophim1.com") && (!url.includes("/danh-sach") && !url.includes("/phim/"))) {
      targetUrl = "https://ophim1.com/danh-sach/phim-moi-cap-nhat?page=1";
    } else if (cleanUrl.includes("otruyenapi.com") && !url.includes("/home") && !url.includes("/truyen-tranh/")) {
      targetUrl = cleanUrl.endsWith("/v1/api") ? `${cleanUrl}/home` : `${cleanUrl}/v1/api/home`;
    } else if (cleanUrl === "https://api.mangadex.org") {
      targetUrl = "https://api.mangadex.org/ping";
    } else if (cleanUrl.includes("truyenqq") && !url.includes("/truyen-moi-cap-nhat") && !url.includes("/truyen-tranh/")) {
      targetUrl = "https://truyenqqko.com/truyen-moi-cap-nhat";
    }

    const startTime = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, 20000));

    try {
      let response = await fetch(targetUrl, {
        method: "GET",
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept: "application/json, text/plain, */*",
        },
      });

      // If root endpoint returned 404 (e.g. REST API without root index route), try a probe on /danh-sach or /home
      if (response.status === 404 && targetUrl === url) {
        const probeSuffixes = ["/danh-sach/phim-moi-cap-nhat?page=1", "/api/films/phim-moi-cap-nhat?page=1", "/v1/api/home", "/ping"];
        for (const suffix of probeSuffixes) {
          try {
            const probeUrl = `${cleanUrl}${suffix}`;
            const probeRes = await fetch(probeUrl, {
              method: "GET",
              signal: controller.signal,
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                Accept: "application/json, text/plain, */*",
              },
            });
            if (probeRes.ok) {
              response = probeRes;
              targetUrl = probeUrl;
              break;
            }
          } catch {
            // continue next probe
          }
        }
      }

      clearTimeout(timer);
      const latencyMs = Date.now() - startTime;
      const statusCode = response.status;
      const isOk = response.ok;

      // Determine status: 🟢 live (<1500ms and OK), 🟡 slow (>=1500ms and OK or redirect), 🔴 down (4xx/5xx/timeout)
      let status: "live" | "slow" | "down" = "down";
      let message = `Mã phản hồi: ${statusCode} ${response.statusText}`;

      if (isOk) {
        if (latencyMs < 800) {
          status = "live";
          message = `Hoạt động tốt (${latencyMs}ms) - HTTP ${statusCode}`;
        } else if (latencyMs < 2500) {
          status = "slow";
          message = `Phản hồi chậm (${latencyMs}ms) - HTTP ${statusCode}`;
        } else {
          status = "slow";
          message = `Độ trễ cao (${latencyMs}ms) - HTTP ${statusCode}`;
        }
      } else {
        // If the server responded with 404/403 but network connected, check if it's alive
        if (statusCode === 404 || statusCode === 403 || statusCode === 301 || statusCode === 302) {
          status = latencyMs < 1000 ? "live" : "slow";
          message = `Máy chủ phản hồi ${statusCode} (${latencyMs}ms)`;
        } else {
          status = "down";
          message = `Lỗi máy chủ upstream: HTTP ${statusCode} (${response.statusText || 'Error'})`;
        }
      }

      return res.json({
        ok: isOk || status === "live" || status === "slow",
        status,
        statusCode,
        latencyMs,
        message,
        url: targetUrl,
      });
    } catch (err: any) {
      clearTimeout(timer);
      const latencyMs = Date.now() - startTime;
      const isTimeout = err.name === "AbortError" || err.message?.includes("aborted");
      const message = isTimeout
        ? `Quá thời gian phản hồi (Timeout > ${timeoutMs}ms)`
        : `Mất kết nối: ${err.message || 'Không thể kết nối đến máy chủ nguồn'}`;

      return res.json({
        ok: false,
        status: "down",
        statusCode: isTimeout ? 504 : 502,
        latencyMs,
        message,
        url,
      });
    }
  });

// --- SMART ACTOR & DIRECTOR SEARCH ENGINE ---
function normalizeSearchText(str: string): string {
  if (!str) return "";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

// In-Memory Cast Index (Actor/Director -> Movie items)
const dynamicCastIndex = new Map<string, Array<{
  slug: string;
  name: string;
  origin_name?: string;
  poster_url?: string;
  thumb_url?: string;
  year?: number;
  quality?: string;
  lang?: string;
  source?: string;
  actor?: string[];
  director?: string[];
}>>();

function indexMovieCast(movie: any, defaultSource = 'kkphim') {
  if (!movie || !movie.slug || !movie.name) return;
  const item = {
    slug: movie.slug,
    name: movie.name,
    origin_name: movie.origin_name || movie.original_name || '',
    poster_url: movie.poster_url || movie.thumb_url || '',
    thumb_url: movie.thumb_url || movie.poster_url || '',
    year: movie.year || (movie.created?.time ? new Date(movie.created.time).getFullYear() : undefined),
    quality: movie.quality || 'HD',
    lang: movie.lang || 'Vietsub',
    source: movie.source || defaultSource,
    actor: Array.isArray(movie.actor) ? movie.actor : (typeof movie.actor === 'string' ? [movie.actor] : []),
    director: Array.isArray(movie.director) ? movie.director : (typeof movie.director === 'string' ? [movie.director] : []),
  };

  const castNames: string[] = [
    ...(item.actor || []),
    ...(item.director || []),
  ];

  for (const rawName of castNames) {
    if (!rawName || typeof rawName !== 'string') continue;
    const clean = rawName.trim();
    if (!clean || clean.length < 2) continue;
    const norm = normalizeSearchText(clean);
    if (!norm) continue;

    let list = dynamicCastIndex.get(norm);
    if (!list) {
      list = [];
      dynamicCastIndex.set(norm, list);
    }
    if (!list.some((m) => m.slug === item.slug)) {
      list.push(item);
      if (list.length > 50) list.shift();
    }
  }
}

// Curated filmography dictionary mapping normalized actor/director names to verified movie slugs/titles
const ACTOR_FILMOGRAPHY: Record<string, string[]> = {
  'chau tinh tri': ['tuyet-dinh-kungfu', 'doi-bong-thieu-lam', 'vua-hai-kich', 'quoc-san-007', 'quan-xam-loc-coc', 'tay-du-ky-moi-tinh-ngoai-truyen', 'my-nhan-ngu', 'truong-hoc-uy-long', 'than-bai-2', 'dai-noi-mat-tham-008', 'duong-ba-ho-diem-thu-huong', 'gia-huu-hy-su', 'vo-trang-nguyen-to-khat-nhi', 'than-an'],
  'stephen chow': ['tuyet-dinh-kungfu', 'doi-bong-thieu-lam', 'vua-hai-kich', 'quoc-san-007', 'quan-xam-loc-coc', 'tay-du-ky-moi-tinh-ngoai-truyen', 'my-nhan-ngu'],
  'thanh long': ['gio-cao-diem', 'cau-chuyen-canh-sat', 'ke-ngoai-toc', 'kungfu-yoga', '12-con-giap', 'dai-nao-pho-bronx', 'ke-san-thanh-pho', 'tay-du-ky-lao-ton', 'thanh-long-truyen-ky'],
  'jackie chan': ['gio-cao-diem', 'cau-chuyen-canh-sat', 'ke-ngoai-toc', 'kungfu-yoga', '12-con-giap', 'ke-san-thanh-pho'],
  'ly lien kiet': ['hoang-phi-hong', 'tinh-vo-anh-hung', 'nuoc-mat-sat-thu', 'anh-hung', 'thai-cuc-truong-tam-phong', 'biet-doi-danh-thue'],
  'jet li': ['hoang-phi-hong', 'tinh-vo-anh-hung', 'nuoc-mat-sat-thu', 'anh-hung', 'biet-doi-danh-thue'],
  'chan tu dan': ['diep-van', 'diep-van-2', 'diep-van-3', 'diep-van-4', 'sat-pha-lang', 'dao-hoa-tuyen', 'trum-huong-cang', 'john-wick-4'],
  'donnie yen': ['diep-van', 'diep-van-2', 'diep-van-3', 'diep-van-4', 'sat-pha-lang', 'john-wick-4'],
  'co thien lac': ['co-may-thoi-gian', 'thien-menh-anh-hung', 'cuoc-chien-tuong-lai', 'phong-bao-trang', 'sat-pha-lang-2'],
  'louis koo': ['co-may-thoi-gian', 'thien-menh-anh-hung', 'cuoc-chien-tuong-lai', 'phong-bao-trang'],
  'luu diec phi': ['than-dieu-dai-hiep', 'mong-hoa-luc', 'di-den-noi-co-gio', 'cau-chuyen-hoa-hong', 'thien-long-bat-bo', 'hoa-moc-lan'],
  'crystal liu': ['than-dieu-dai-hiep', 'mong-hoa-luc', 'di-den-noi-co-gio', 'cau-chuyen-hoa-hong'],
  'duong mich': ['tam-sinh-tam-the-thap-ly-dao-hoa', 'ho-yeu-tieu-hong-nuong-nguyet-hong-thien', 'phu-dao', 'nguoi-dam-phan', 'bao-phong-nhan', 'hoc-chau-phu-nhan'],
  'yang mi': ['tam-sinh-tam-the-thap-ly-dao-hoa', 'ho-yeu-tieu-hong-nuong-nguyet-hong-thien', 'phu-dao'],
  'trieu le dinh': ['so-kieu-truyen', 'hoa-thien-cot', 'minh-lan-truyen', 'du-phuong-hanh', 'huu-phi', 'gio-thoi-ban-ha', 'hanh-phuc-den-van-gia'],
  'zanilia zhao': ['so-kieu-truyen', 'hoa-thien-cot', 'minh-lan-truyen', 'du-phuong-hanh', 'huu-phi'],
  'trieu lo tu': ['vung-trom-khong-the-giau', 'tinh-han-xan-lan', 'tha-thi-thien-ha', 'tran-thien-thien-trong-loi-don', 'than-an', 'chau-liem-ngoc-mac', 'hau-lang', 'truong-ca-hanh', 'o-o-co-nang-cua-toi'],
  'zhao lusi': ['vung-trom-khong-the-giau', 'tinh-han-xan-lan', 'tha-thi-thien-ha', 'tran-thien-thien-trong-loi-don', 'than-an'],
  'rosy zhao': ['vung-trom-khong-the-giau', 'tinh-han-xan-lan', 'tha-thi-thien-ha', 'than-an'],
  'tran triet vien': ['vung-trom-khong-the-giau', 'bi-mat-noi-goc-toi', 'tien-kiem-ky-hiep-4', 'dem-say', 'tan-tuyet-dai-song-kieu', 'cay-o-liu-mau-trang'],
  'chen zheyuan': ['vung-trom-khong-the-giau', 'bi-mat-noi-goc-toi', 'tien-kiem-ky-hiep-4', 'dem-say'],
  'tieu chien': ['tran-tinh-lenh', 'dau-la-dai-luc', 'ngoc-cot-dao', 'vung-bien-trong-mo', 'tru-tien', 'lang-dien-ha', 'du-sinh-xin-chi-giao-nhieu-hon', 'tang-hai-truyen'],
  'xiao zhan': ['tran-tinh-lenh', 'dau-la-dai-luc', 'ngoc-cot-dao', 'vung-bien-trong-mo', 'tru-tien'],
  'vuong nhat bac': ['tran-tinh-lenh', 'huu-phi', 'phong-khoi-lac-duong', 'vo-danh', 'nhiet-liet', 'bang-vu-hoa'],
  'wang yibo': ['tran-tinh-lenh', 'huu-phi', 'phong-khoi-lac-duong', 'vo-danh', 'nhiet-liet'],
  'duong duong': ['yeu-em-tu-cai-nhin-dau-tien', 'tha-thi-thien-ha', 'khoi-lua-nhan-gian-cua-toi', 'toan-chuc-cao-thu', 'vu-dong-can-khon', 'dac-chien-vinh-quang'],
  'yang yang': ['yeu-em-tu-cai-nhin-dau-tien', 'tha-thi-thien-ha', 'khoi-lua-nhan-gian-cua-toi', 'toan-chuc-cao-thu'],
  'dich le nhiet ba': ['em-la-niem-kieu-hanh-cua-anh', 'tam-sinh-tam-the-thap-ly-dao-hoa', 'tam-sinh-tam-the-cham-thuong-thu', 'ngu-giao-ky', 'an-lac-truyen', 'cong-to-tinh-anh'],
  'dilraba': ['em-la-niem-kieu-hanh-cua-anh', 'tam-sinh-tam-the-thap-ly-dao-hoa', 'tam-sinh-tam-the-cham-thuong-thu', 'ngu-giao-ky'],
  'bach loc': ['truong-nguyet-tan-minh', 'ninh-an-nhu-mong', 'di-ai-vi-doanh', 'chau-sinh-nhu-co', 'bach-nguyet-phan-tinh', 'nua-la-duong-mat-nua-la-dau-thuong', 'chieu-dieu'],
  'bai lu': ['truong-nguyet-tan-minh', 'ninh-an-nhu-mong', 'di-ai-vi-doanh', 'chau-sinh-nhu-co'],
  'duong tu': ['truong-tuong-tu', 'huong-mat-tua-khoi-suong', 'ca-muc-ham-mat', 'tram-vun-huong-phai', 'thua-hoan-ky', 'nu-bac-si-tam-ly'],
  'yang zi': ['truong-tuong-tu', 'huong-mat-tua-khoi-suong', 'ca-muc-ham-mat', 'tram-vun-huong-phai'],
  'vuong hac de': ['thuong-lan-quyet', 'di-ai-vi-doanh', 'phu-do-duyen', 'dai-phung-da-canh-nhan'],
  'dylan wang': ['thuong-lan-quyet', 'di-ai-vi-doanh', 'phu-do-duyen'],
  'ngo loi': ['tinh-han-xan-lan', 'truong-ca-hanh', 'giua-con-bao-tuyet', 'lang-nha-bang'],
  'leo wu': ['tinh-han-xan-lan', 'truong-ca-hanh', 'giua-con-bao-tuyet'],
  'la van hi': ['truong-nguyet-tan-minh', 'nua-la-duong-mat-nua-la-dau-thuong', 'thuy-long-ngam', 'huong-mat-tua-khoi-suong'],
  'luo yunxi': ['truong-nguyet-tan-minh', 'nua-la-duong-mat-nua-la-dau-thuong', 'huong-mat-tua-khoi-suong'],
  'truong lang hach': ['thuong-lan-quyet', 'ninh-an-nhu-mong', 'van-chi-vu', 'do-hoa-nien'],
  'zhang linghe': ['thuong-lan-quyet', 'ninh-an-nhu-mong', 'van-chi-vu', 'do-hoa-nien'],
  'ngu thu han': ['thuong-lan-quyet', 'van-chi-vu', 'vinh-da-tinh-ha', 'khu-rung-nho-cua-hai-nguoi'],
  'esther yu': ['thuong-lan-quyet', 'van-chi-vu', 'vinh-da-tinh-ha'],
  'cuc tinh y': ['van-tich-truyen', 'hoa-nhung', 'hoa-gian-lenh', 'tan-bach-nuong-tu-truyen'],
  'ju jingyi': ['van-tich-truyen', 'hoa-nhung', 'hoa-gian-lenh'],
  'cung tuan': ['son-ha-lenh', 'an-lac-truyen', 'ho-yeu-tieu-hong-nuong-nguyet-hong-thien'],
  'gong jun': ['son-ha-lenh', 'an-lac-truyen'],
  'nham gia luan': ['chau-sinh-nhu-co', 'cam-y-chi-ha', 'ngu-giao-ky', 'vu-canh-ky'],
  'ren jialun': ['chau-sinh-nhu-co', 'cam-y-chi-ha', 'ngu-giao-ky'],
  'hua khai': ['dien-hi-cong-luoc', 'chieu-dieu', 'em-dep-hon-ca-anh-sao', 'thua-hoan-ky', 'dinh-luat-80-20-cua-tinh-yeu'],
  'xu kai': ['dien-hi-cong-luoc', 'chieu-dieu', 'em-dep-hon-ca-anh-sao'],
  'dang vi': ['truong-tuong-tu', 'ngo-tien', 'trung-tu'],
  'deng wei': ['truong-tuong-tu', 'ngo-tien', 'trung-tu'],
  'song joong ki': ['hau-due-mat-troi', 'vincenzo', 'cau-ut-nha-tai-phiet', 'space-sweepers', 'dao-dia-nguc'],
  'lee min ho': ['vuon-sao-bang', 'huyen-thoai-bien-xanh', 'quan-vuong-bat-diet', 'city-hunter', 'nguoi-thua-ke'],
  'hyun bin': ['ha-canh-noi-anh', 'khu-vuon-bi-mat', 'hoi-uc-alhambra', 'dac-vu-xuyen-quoc-gia'],
  'son ye jin': ['ha-canh-noi-anh', 'chi-dep-mua-com-ngon-cho-toi', 'tuoi-39', 'co-dien'],
  'song hye kyo': ['the-glory', 'hau-due-mat-troi', 'gio-mua-dong-nam-ay', 'ngoi-nha-hanh-phuc'],
  'park seo joon': ['tang-lop-itaewon', 'thu-ky-kim-sao-the', 'sinh-vat-gyeongseong', 'thanh-xuan-vat-va'],
  'kim soo hyun': ['nu-hoang-nuoc-mat', 'vi-sao-dua-anh-toi', 'dien-thi-co-sao', 'mat-trang-om-mat-troi'],
  'iu': ['khach-san-anh-trang', 'nguoi-chu-cua-toi', 'nguoi-tinh-anh-trang'],
  'lee ji eun': ['khach-san-anh-trang', 'nguoi-chu-cua-toi', 'nguoi-tinh-anh-trang'],
  'park shin hye': ['nguoi-thua-ke', 'pinocchio', 'bac-si-tram-cam', 'co-nang-dep-trai'],
  'lee jong suk': ['big-mouth', 'khi-nang-say-giac', 'hai-the-gioi', 'pinocchio', 'toi-lang-nghe-tieng-em'],
  'ji chang wook': ['the-k2', 'hoang-hau-ki', 'chao-mung-den-samdalri'],
  'gong yoo': ['yeu-tinh', 'chuyen-tau-sinh-tu', 'squid-game', 'tiem-ca-phe-hoang-tu'],
  'ma dong seok': ['chuyen-tau-sinh-tu', 'trum-cho-dien-va-ke-sat-nhan', 'vay-bat-ke-ac', 'vinh-hang-eternals'],
  'han so hee': ['sinh-vat-gyeongseong', 'the-gioi-hon-nhan', 'my-name'],
  'tom cruise': ['phi-cong-sieu-dang-maverick', 'nhiem-vu-bat-kha-thi-nghiep-bao-phan-1', 'nhiem-vu-bat-kha-thi-sup-do', 'cuoc-chien-luan-hoi', 'ke-doc-hanh', 'nguoi-hung-jack-reacher'],
  'keanu reeves': ['john-wick', 'john-wick-2', 'john-wick-3', 'john-wick-4', 'ma-tran', 'ma-tran-hoi-sinh', 'constantine'],
  'leonardo dicaprio': ['titanic', 'inception', 'ke-trom-giac-mo', 'soi-gia-pho-wall', 'nguoi-ve-tu-coi-chet', 'dao-kinh-hoang'],
  'brad pitt': ['bullet-train', 'cau-lac-bo-danh-nhau', 'ong-ba-smith', 'the-chien-z', 'chuyen-ngay-xua-o-hollywood'],
  'scarlett johansson': ['avengers-hoi-ket', 'black-widow', 'lucy', 'vo-dien', 'chuyen-hon-nhan'],
  'robert downey jr': ['iron-man', 'avengers-hoi-ket', 'oppenheimer', 'sherlock-holmes'],
  'robert downey jr.': ['iron-man', 'avengers-hoi-ket', 'oppenheimer', 'sherlock-holmes'],
  'chris evans': ['captain-america-ke-bao-thu-dau-tien', 'avengers-hoi-ket', 'ke-dam-len-nhau', 'snowpiercer'],
  'chris hemsworth': ['thor-tan-the-ragnarok', 'thor-tinh-yeu-va-sam-set', 'extraction-nhiem-vu-giai-cuu', 'avengers-hoi-ket'],
  'jason statham': ['the-meg', 'nguoi-van-chuyen', 'fast-furious-hobbs-shaw', 'mat-vu-ong-beekeeper', 'biet-doi-danh-thue'],
  'vin diesel': ['fast-furious', 'fast-x', 've-binh-dai-ngan-ha', 'bloodshot', 'riddick'],
  'dwayne johnson': ['black-adam', 'jumanji-tro-choi-ky-ao', 'san-andreas', 'thong-bao-do', 'fast-furious'],
  'the rock': ['black-adam', 'jumanji-tro-choi-ky-ao', 'san-andreas', 'thong-bao-do'],
  'cillian murphy': ['oppenheimer', 'peaky-blinders', 'ky-si-bong-dem', 'inception'],
  'ryan reynolds': ['deadpool', 'deadpool-wolverine', 'free-guy', 'thong-bao-do'],
  'christopher nolan': ['oppenheimer', 'tenet', 'huyen-thoai-interstellar', 'inception', 'ky-si-bong-dem', 'dunkirk'],
  'tran thanh': ['mai', 'nha-ba-nu', 'bo-gia', 'cua-lai-vo-bau', 'trang-quynh'],
  'thu trang': ['chi-muoi-ba', 'con-nhot-mot-chong', 'tiec-trang-mau', 'nghe-sieu-de'],
  'kieu minh tuan': ['em-chua-18', 'tiec-trang-mau', 'ke-an-hon', 'chi-muoi-ba', 'nghe-sieu-de'],
  'ninh duong lan ngoc': ['cua-lai-vo-bau', 'gai-gia-lam-chieu-3', 'co-ba-sai-gon', 'tam-cam-chuyen-chua-ke'],
  'kaity nguyen': ['em-chua-18', 'tiec-trang-mau', 'co-gai-tu-qua-khu', 'nguoi-vo-cuoi-cung'],
  'victor vu': ['mat-biec', 'toi-thay-hoa-vang-tren-co-xanh', 'nguoi-vo-cuoi-cung', 'thien-menh-anh-hung', 'qua-tim-mau']
};

// Resolve a movie slug to full item info (with cache)
async function resolveMovieSlug(slug: string): Promise<any | null> {
  const cacheKey = `resolved-slug:${slug}`;
  const cached = proxyCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 10 * 60 * 1000) {
    return cached.data;
  }
  try {
    const raw = await fetchWithTimeout(`https://phimapi.com/phim/${encodeURIComponent(slug)}`, 3500);
    if (raw?.movie?.name) {
      const m = raw.movie;
      const item = {
        slug: m.slug || slug,
        name: m.name,
        origin_name: m.origin_name || '',
        poster_url: m.poster_url || m.thumb_url || '',
        thumb_url: m.thumb_url || m.poster_url || '',
        backdrop_url: m.poster_url || m.thumb_url || '',
        year: m.year || undefined,
        quality: m.quality || 'HD',
        lang: m.lang || 'Vietsub',
        source: 'kkphim',
        sourceLabel: 'KKPhim',
        tmdb: m.tmdb || undefined,
        content: m.content || '',
        actor: m.actor || [],
        director: m.director || [],
        view: m.view || 0,
        chieurap: m.chieurap || false,
      };
      indexMovieCast(m, 'kkphim');
      proxyCache.set(cacheKey, { data: item, timestamp: Date.now() });
      return item;
    }
  } catch {}
  return null;
}

// Find movies for an actor/director by searching the cast index and filmography dictionary
async function searchActorDirectorMovies(keyword: string): Promise<any[]> {
  const normKey = normalizeSearchText(keyword);
  if (!normKey || normKey.length < 2) return [];

  const foundMovies = new Map<string, any>();

  // 1. Check in dynamicCastIndex
  for (const [normCastName, movieList] of dynamicCastIndex.entries()) {
    if (normCastName.includes(normKey) || normKey.includes(normCastName)) {
      for (const m of movieList) {
        if (!foundMovies.has(m.slug)) {
          foundMovies.set(m.slug, m);
        }
      }
    }
  }

  // 2. Check in ACTOR_FILMOGRAPHY dictionary
  const matchedSlugs = new Set<string>();
  for (const [normActor, slugs] of Object.entries(ACTOR_FILMOGRAPHY)) {
    if (normActor.includes(normKey) || normKey.includes(normActor)) {
      for (const slug of slugs) {
        matchedSlugs.add(slug);
      }
    }
  }

  if (matchedSlugs.size > 0) {
    const slugPromises = Array.from(matchedSlugs).slice(0, 16).map((slug) => resolveMovieSlug(slug));
    const resolvedItems = await Promise.allSettled(slugPromises);
    for (const res of resolvedItems) {
      if (res.status === 'fulfilled' && res.value && !foundMovies.has(res.value.slug)) {
        foundMovies.set(res.value.slug, res.value);
      }
    }
  }

  return Array.from(foundMovies.values());
}

// Seed initial popular cast index in background on startup
async function seedInitialCastIndex() {
  try {
    const seedUrls = [
      'https://phimapi.com/danh-sach/phim-moi-cap-nhat?page=1',
      'https://phimapi.com/v1/api/danh-sach/phim-bo?page=1&limit=24',
      'https://phimapi.com/v1/api/danh-sach/phim-le?page=1&limit=24',
    ];
    for (const url of seedUrls) {
      try {
        const data = await fetchWithTimeout(url, 4000);
        const items = data?.items || data?.data?.items || [];
        // Resolve first 10 items in background to seed cast
        for (const item of items.slice(0, 8)) {
          if (item?.slug) {
            resolveMovieSlug(item.slug).catch(() => {});
          }
        }
      } catch {}
    }
  } catch {}
}
setTimeout(seedInitialCastIndex, 2000);

// --- END SMART ACTOR & DIRECTOR SEARCH ENGINE ---

  // 1. KKPhim Dedicated Proxy (https://phimapi.com)
  app.get("/api/proxy/kkphim/*", requireAuth, requireActiveSlot, async (req, res) => {
    const endpoint = req.params[0];
    const query = new URLSearchParams(req.query as Record<string, string>).toString();
    const cacheKey = `kkphim:${endpoint}?${query}`;

    const cached = proxyCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return res.json(cached.data);
    }

    try {
      const url = `https://phimapi.com/${endpoint}${query ? `?${query}` : ""}`;
      const data = await fetchWithTimeout(url, 4500);
      if (data?.movie) {
        indexMovieCast(data.movie, 'kkphim');
      }
      proxyCache.set(cacheKey, { data, timestamp: Date.now() });
      return res.json(data);
    } catch (err: any) {
      if (cached) return res.json(cached.data);
      return res.json({ status: true, items: [], msg: `KKPhim empty: ${err.message}` });
    }
  });

  // 2. OPhim Dedicated Proxy (https://ophim1.com)
  app.get("/api/proxy/ophim/*", requireAuth, requireActiveSlot, async (req, res) => {
    const endpoint = req.params[0];
    const query = new URLSearchParams(req.query as Record<string, string>).toString();
    const cacheKey = `ophim:${endpoint}?${query}`;

    const cached = proxyCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return res.json(cached.data);
    }

    const mirrors = [
      `https://ophim1.com/${endpoint}${query ? `?${query}` : ""}`,
      `https://ophim17.cc/${endpoint}${query ? `?${query}` : ""}`,
      `https://ophim1.net/${endpoint}${query ? `?${query}` : ""}`,
    ];

    for (const url of mirrors) {
      try {
        const data = await fetchWithTimeout(url, 4000);
        if (data && (data.status === true || data.status === "success" || data.items || data.data?.items || data.movie)) {
          if (data?.movie) {
            indexMovieCast(data.movie, 'ophim');
          }
          proxyCache.set(cacheKey, { data, timestamp: Date.now() });
          return res.json(data);
        }
      } catch {
        // try next mirror
      }
    }

    if (cached) return res.json(cached.data);
    return res.json({ status: true, items: [], msg: "OPhim empty" });
  });

  // 3. NguonC Dedicated Proxy (https://phim.nguonc.com)
  app.get("/api/proxy/nguonc/*", requireAuth, requireActiveSlot, async (req, res) => {
    const endpoint = req.params[0];
    const query = new URLSearchParams(req.query as Record<string, string>).toString();
    const cacheKey = `nguonc:${endpoint}?${query}`;

    const cached = proxyCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return res.json(cached.data);
    }

    try {
      const normalizedEndpoint = endpoint.startsWith("api/") ? endpoint : `api/${endpoint}`;
      const url = `https://phim.nguonc.com/${normalizedEndpoint}${query ? `?${query}` : ""}`;
      const data = await fetchWithTimeout(url, 5000);
      if (data?.movie) {
        indexMovieCast(data.movie, 'nguonc');
      }
      proxyCache.set(cacheKey, { data, timestamp: Date.now() });
      return res.json(data);
    } catch (err: any) {
      if (cached) return res.json(cached.data);
      // Return 200 with empty result to avoid 502 console spam (NguonC often 404 for some genres like phim-chieu-rap/vien-tuong)
      return res.json({ status: true, items: [], msg: `NguonC empty: ${err.message}` });
    }
  });

  // 4. Multi-Source Search Aggregator with Smart Cast & Actor Matching
  app.get("/api/proxy/search-all", requireAuth, requireActiveSlot, async (req, res) => {
    const keyword = String(req.query.keyword || "").trim();
    if (!keyword) {
      return res.json({ status: true, items: [] });
    }

    const encoded = encodeURIComponent(keyword);
    const cacheKey = `search-all:${encoded}`;
    const cached = proxyCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return res.json(cached.data);
    }

    const tasks = [
      fetchWithTimeout(`https://phimapi.com/v1/api/tim-kiem?keyword=${encoded}&limit=20`, 4000)
        .then((d) => ({ source: 'kkphim', data: d }))
        .catch(() => null),
      fetchWithTimeout(`https://ophim1.com/v1/api/tim-kiem?keyword=${encoded}&limit=20`, 4000)
        .then((d) => ({ source: 'ophim', data: d }))
        .catch(() => null),
      fetchWithTimeout(`https://phim.nguonc.com/api/films/search?keyword=${encoded}`, 4500)
        .then((d) => ({ source: 'nguonc', data: d }))
        .catch(() => null),
      searchActorDirectorMovies(keyword)
        .then((items) => ({ source: 'actor_cast_index', items }))
        .catch(() => ({ source: 'actor_cast_index', items: [] })),
    ];

    const results = await Promise.all(tasks);
    const combinedMap = new Map<string, any>();

    // 1. Add Actor / Cast matched movies first so they are front and center
    const actorResult = results.find((r) => r && 'items' in r && r.source === 'actor_cast_index');
    if (actorResult && Array.isArray((actorResult as any).items)) {
      for (const item of (actorResult as any).items) {
        if (item?.slug && !combinedMap.has(item.slug)) {
          combinedMap.set(item.slug, {
            ...item,
            isActorMatch: true,
            sourceLabel: item.source === 'nguonc' ? 'NguonC' : item.source === 'ophim' ? 'OPhim' : 'KKPhim',
          });
        }
      }
    }

    // 2. Add Upstream Title Search Results
    for (const r of results) {
      if (!r || !('data' in r) || !r.data) continue;
      const src = r.source;
      const raw = r.data;

      // KKPhim & OPhim
      if (raw.data?.items && Array.isArray(raw.data.items)) {
        for (const item of raw.data.items) {
          if (!item.slug) continue;
          if (!combinedMap.has(item.slug)) {
            combinedMap.set(item.slug, {
              ...item,
              source: src,
              sourceLabel: src === 'kkphim' ? 'KKPhim' : 'OPhim',
            });
          }
        }
      } else if (raw.items && Array.isArray(raw.items)) {
        // NguonC or standard list
        for (const item of raw.items) {
          if (!item.slug) continue;
          if (!combinedMap.has(item.slug)) {
            combinedMap.set(item.slug, {
              ...item,
              source: src,
              sourceLabel: src === 'nguonc' ? 'NguonC' : src === 'kkphim' ? 'KKPhim' : 'OPhim',
            });
          }
        }
      }
    }

    const payload = {
      status: true,
      items: Array.from(combinedMap.values()),
      total: combinedMap.size,
      keyword,
    };

    proxyCache.set(cacheKey, { data: payload, timestamp: Date.now() });
    return res.json(payload);
  });

  // --- REMOTE ADBLOCK RULES (admin sửa trên RTDB system_cache/adblock, không cần build lại) ---
  // Mặc định CHỈ giữ pattern độ tin cậy cao có delimiter. ĐÃ BỎ '/ad', 'ads',
  // '/segment_', 'segment_00', regex \/v\d+\/ vì cắt nhầm nội dung thật
  // (vd Hồ Tâm tập 12: QC chữ burned-in bị cắt mất đoạn phim phút thứ 3).
  const DEFAULT_ADBLOCK_KEYWORDS = [
    "quangcao", "quang-cao", "preroll", "midroll",
    "adservice", "doubleclick", "convertv", "/convert", "advert",
    "/ads/", "/ad/", "_ad_", "-ad-", ".ad.",
    "/promo", "_promo", "-promo", "/banner", "_banner", "-banner",
  ];
  const DEFAULT_ADBLOCK_REGEXES: string[] = [];
  let adblockRulesCache: { keywords: string[]; regexes: string[]; compiled: RegExp[]; fetchedAt: number } = {
    keywords: [...DEFAULT_ADBLOCK_KEYWORDS],
    regexes: [...DEFAULT_ADBLOCK_REGEXES],
    compiled: [],
    fetchedAt: 0,
  };
  try {
    adblockRulesCache.compiled = DEFAULT_ADBLOCK_REGEXES.map((s) => new RegExp(s, "i"));
  } catch {}
  const ADBLOCK_TTL_MS = 60 * 1000;

  async function getAdblockRules(): Promise<{ keywords: string[]; regexes: string[]; compiled: RegExp[] }> {
    try {
      if (Date.now() - adblockRulesCache.fetchedAt < ADBLOCK_TTL_MS) return adblockRulesCache;
      const remote: any = await fetchFromRtdb("system_cache/adblock");
      const kw: string[] = Array.isArray(remote?.keywords)
        ? [...new Set((remote.keywords as any[]).map((k: any) => String(k ?? "").trim().toLowerCase()).filter((s: string) => s.length >= 2))].slice(0, 200) as string[]
        : [];
      const rxSrc: string[] = Array.isArray(remote?.regexes)
        ? [...new Set((remote.regexes as any[]).map((r: any) => String(r ?? "").trim()).filter(Boolean))].slice(0, 50) as string[]
        : [];
      const compiled: RegExp[] = [];
      const validRx: string[] = [];
      for (const src of rxSrc) {
        try {
          compiled.push(new RegExp(src, "i"));
          validRx.push(src);
        } catch {}
      }
      // RTDB có key nhưng rỗng -> giữ rule cũ (tránh admin xóa nhầm)
      if (kw.length > 0) adblockRulesCache.keywords = kw;
      if (validRx.length > 0) {
        adblockRulesCache.regexes = validRx;
        adblockRulesCache.compiled = compiled;
      }
      adblockRulesCache.fetchedAt = Date.now();
    } catch {}
    return adblockRulesCache;
  }

  // Debug endpoint cho admin: xem rule server đang dùng (không cần đọc RTDB thủ công)
  app.get("/api/adblock/rules", requireAuth, requireActiveSlot, async (_req, res) => {
    const rules = await getAdblockRules();
    res.json({ keywords: rules.keywords, regexes: rules.regexes, cached: true });
  });

  // 5a. M3U8 Ad-Clean Proxy - strips SSAI ad segments injected by upstream (opstream/phim1280)
  app.get("/api/proxy/m3u8", requireAuth, requireActiveSlot, async (req, res) => {
    let rawUrl = (req.query.url as string) || "";
    if (!rawUrl) return res.status(400).send("Missing url");
    // support base64 or plain
    if (!rawUrl.startsWith("http")) {
      try { rawUrl = Buffer.from(rawUrl, "base64").toString("utf-8"); } catch {}
    }
    if (!rawUrl.startsWith("http")) return res.status(400).send("Invalid url");

    // Rule động từ RTDB (cache 60s) + rule cứng fallback
    const dynRules = await getAdblockRules().catch(() => adblockRulesCache);

    // heuristic: strong = ứng viên QC (không cần discontinuity); weak = cần kề DISCONTINUITY.
    // ĐÃ VERIFY bằng frame thật (Hồ Tâm tập 12): cụm convertv7/<hash>.ts @2:59 là
    // CẢNH PHIM có QC chữ burned-in (giữ), cụm /v7/<hash>/segment_NNNN.ts @14:59 là
    // video QC cờ bạc (cắt). Vì vậy cụm flagged chỉ bị cắt khi "ngoại lai":
    // khác cây thư mục nội dung, hoặc tên segment_NNNN nối tiếp, hoặc đổi KEY/MAP ở biên.
    const STRONG = ["quangcao", "quang-cao", "preroll", "midroll", "adservice", "doubleclick", "convertv", "/convert", "advert"];
    const WEAK = ["/ads/", "/ad/", "_ad_", "-ad-", ".ad.", "/promo", "_promo", "-promo", "/banner", "_banner", "-banner", "/intro/", "_intro", "-intro"];
    // Path versioned kiểu SSAI (/v7/<hash>/...) từng là pattern QC thật nhưng CDN
    // thường cũng dùng cho nội dung thật -> chỉ là tín hiệu yếu (cần discontinuity).
    const WEAK_RE = [/\/v\d+\//i];
    const isStrongAd = (uri: string): boolean => {
      const l = uri.toLowerCase();
      for (const k of STRONG) if (k && l.includes(k)) return true;
      return false;
    };
    const isWeakAd = (uri: string): boolean => {
      const l = uri.toLowerCase();
      for (const k of WEAK) if (k && l.includes(k)) return true;
      for (const re of WEAK_RE) {
        try { if (re.test(l)) return true; } catch {}
      }
      // Rule động do admin cấu hình trên RTDB system_cache/adblock -> coi là yếu
      try {
        for (const k of dynRules.keywords || []) {
          if (k && l.includes(k)) return true;
        }
        for (const re of dynRules.compiled || []) {
          if (re.test(l)) return true;
        }
      } catch {}
      return false;
    };

    const resolveUrl = (base: string, relative: string): string => {
      try { return new URL(relative, base).toString(); } catch { return relative; }
    };
    const dirOfUrl = (absoluteUrl: string): string => {
      try {
        const u = new URL(absoluteUrl);
        const cut = u.pathname.lastIndexOf("/");
        return `${u.origin}${cut > 0 ? u.pathname.slice(0, cut) : ""}`.toLowerCase();
      } catch {
        const s = absoluteUrl.toLowerCase();
        const cut = s.lastIndexOf("/");
        return cut > 0 ? s.slice(0, cut) : s;
      }
    };
    const fileOfUrl = (absoluteUrl: string): string => {
      try { return new URL(absoluteUrl).pathname.split("/").pop() || ""; } catch {
        const s = absoluteUrl.split("?")[0];
        return s.slice(s.lastIndexOf("/") + 1);
      }
    };
    const isSeqAdName = (file: string): boolean => /segment[_-]?\d+\./i.test(file || "");

    const fetchText = async (url: string): Promise<string> => {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 12000);
      let referer = "https://ophim1.com/";
      try {
        const u = new URL(url);
        referer = `${u.origin}/`;
      } catch {}
      try {
        const r = await fetch(url, {
          signal: controller.signal,
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "*/*",
            "Referer": referer,
          },
        });
        clearTimeout(t);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return await r.text();
      } catch (e) { clearTimeout(t); throw e; }
    };

    const cleanMediaPlaylist = (content: string, baseUrl: string): string => {
      const lines = content.split(/\r?\n/);
      // Pre-pass: vị trí segment + cờ discontinuity / KEY-MAP trước-sau
      const segIdx: number[] = [];
      for (let i = 0; i < lines.length; i++) {
        const t = lines[i].trim();
        if (!t || t.startsWith("#")) continue;
        segIdx.push(i);
      }
      if (segIdx.length === 0) return content;
      const discBefore = new Array<boolean>(segIdx.length).fill(false);
      const discAfter = new Array<boolean>(segIdx.length).fill(false);
      const keyBefore = new Array<boolean>(segIdx.length).fill(false);
      const keyAfter = new Array<boolean>(segIdx.length).fill(false);
      const absUrls: string[] = new Array(segIdx.length);
      for (let s = 0; s < segIdx.length; s++) {
        const uri = lines[segIdx[s]].trim();
        absUrls[s] = uri.startsWith("http") ? uri : resolveUrl(baseUrl, uri);
      }
      for (let s = 0; s < segIdx.length; s++) {
        if (s > 0) {
          for (let j = segIdx[s] - 1; j > segIdx[s - 1]; j--) {
            const t = lines[j].trim();
            if (t.startsWith("#EXT-X-DISCONTINUITY")) discBefore[s] = true;
            else if (t.startsWith("#EXT-X-KEY") || t.startsWith("#EXT-X-MAP")) keyBefore[s] = true;
          }
        }
        const end = s + 1 < segIdx.length ? segIdx[s + 1] : lines.length;
        for (let j = segIdx[s] + 1; j < end; j++) {
          const t = lines[j].trim();
          if (!t) continue;
          if (t.startsWith("#EXT-X-DISCONTINUITY")) { discAfter[s] = true; continue; }
          if (t.startsWith("#EXT-X-KEY") || t.startsWith("#EXT-X-MAP")) { keyAfter[s] = true; continue; }
          break;
        }
      }
      // Flag theo URL rồi lan theo span (cụm liền mạch không bị DISCONTINUITY
      // cắt ngang): SSAI chèn cả cụm ad giữa 2 disc, chỉ segment biên chạm disc.
      const flagged = new Array<boolean>(segIdx.length).fill(false);
      const segStrong = new Array<boolean>(segIdx.length).fill(false);
      const segWeak = new Array<boolean>(segIdx.length).fill(false);
      for (let s = 0; s < segIdx.length; s++) {
        const uri = lines[segIdx[s]].trim();
        if (isStrongAd(absUrls[s]) || isStrongAd(uri)) { segStrong[s] = true; continue; }
        if (isWeakAd(absUrls[s]) || isWeakAd(uri)) segWeak[s] = true;
      }
      const spanId = new Array<number>(segIdx.length).fill(0);
      {
        let cur = 0;
        for (let s = 0; s < segIdx.length; s++) {
          if (s > 0 && (discAfter[s - 1] || discBefore[s])) cur++;
          spanId[s] = cur;
        }
      }
      const spanCount = segIdx.length > 0 ? spanId[segIdx.length - 1] + 1 : 0;
      const spanFirst = new Array<number>(spanCount).fill(-1);
      const spanLast = new Array<number>(spanCount).fill(-1);
      for (let s = 0; s < segIdx.length; s++) {
        if (spanFirst[spanId[s]] === -1) spanFirst[spanId[s]] = s;
        spanLast[spanId[s]] = s;
      }
      for (let p = 0; p < spanCount; p++) {
        const a = spanFirst[p];
        const b = spanLast[p];
        let strong = false;
        let weak = false;
        for (let k = a; k <= b; k++) {
          if (segStrong[k]) { strong = true; break; }
          if (segWeak[k]) weak = true;
        }
        if (!strong && !weak) continue;
        const bracketed = discBefore[a] || discAfter[b];
        if (strong || bracketed) {
          for (let k = a; k <= b; k++) flagged[k] = true;
        }
      }
      // Cây thư mục nội dung = dir phổ biến nhất của segment KHÔNG flagged
      const dirCount = new Map<string, number>();
      for (let s = 0; s < segIdx.length; s++) {
        if (flagged[s]) continue;
        const d = dirOfUrl(absUrls[s]);
        dirCount.set(d, (dirCount.get(d) || 0) + 1);
      }
      let contentRoot = "";
      let contentVotes = 0;
      for (const [d, n] of dirCount) {
        if (n > contentVotes) { contentVotes = n; contentRoot = d; }
      }
      const inSameTree = (absolute: string): boolean => {
        if (!contentRoot) return false;
        const d = dirOfUrl(absolute);
        return d === contentRoot || d.startsWith(contentRoot + "/");
      };
      // Chỉ cắt cụm flagged "ngoại lai" (khác cây / tên nối tiếp / đổi KEY)
      const drop = new Array<boolean>(segIdx.length).fill(false);
      const segPos = new Map<number, number>();
      segIdx.forEach((lineIdx, s) => segPos.set(lineIdx, s));
      for (let s = 0; s < segIdx.length;) {
        if (!flagged[s]) { s++; continue; }
        let e = s;
        while (e + 1 < segIdx.length && flagged[e + 1]) e++;
        let sameTree = true;
        let seqName = false;
        for (let k = s; k <= e; k++) {
          if (!inSameTree(absUrls[k])) sameTree = false;
          if (isSeqAdName(fileOfUrl(absUrls[k]))) seqName = true;
        }
        let keyChange = keyBefore[s] || keyAfter[e];
        for (let k = s; k <= e && !keyChange; k++) {
          if (keyBefore[k] || keyAfter[k]) keyChange = true;
        }
        if (!sameTree || seqName || keyChange) {
          for (let k = s; k <= e; k++) drop[k] = true;
        } else {
          console.log(`[m3u8-clean] keep ${e - s + 1} flagged-in-tree segment(s) (possible overlay film) at #${s} from ${baseUrl}`);
        }
        s = e + 1;
      }
      const removedCount = drop.filter(Boolean).length;
      if (removedCount === 0) return content;
      // Safety cap: cắt quá nhiều / 1 mạch dài -> nhận diện sai, giữ nguyên
      let longestRun = 0;
      let run = 0;
      for (const d of drop) {
        if (d) { run++; longestRun = Math.max(longestRun, run); }
        else run = 0;
      }
      if (removedCount / segIdx.length > 0.35 || longestRun > 20) {
        console.warn(`[m3u8-clean] abort: would remove ${removedCount}/${segIdx.length} (run ${longestRun}) from ${baseUrl} — keep original`);
        return content;
      }
      const out: string[] = [];
      let pendingExtInf: string | null = null;
      let pendingDiscontinuity = false;
      let removed = 0;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (!trimmed) { out.push(line); continue; }
        if (trimmed.startsWith("#EXT-X-DISCONTINUITY")) {
          pendingDiscontinuity = true;
          continue; // defer, only emit if next segment is kept
        }
        if (trimmed.startsWith("#EXTINF")) {
          pendingExtInf = line;
          continue;
        }
        if (trimmed.startsWith("#") ) {
          // keep other tags (EXT-X-KEY, EXT-X-MAP, etc.)
          if (pendingExtInf) { out.push(pendingExtInf); pendingExtInf = null; }
          if (pendingDiscontinuity) { out.push("#EXT-X-DISCONTINUITY"); pendingDiscontinuity = false; }
          out.push(line);
          continue;
        }
        // segment URI
        const s = segPos.get(i);
        if (s !== undefined && drop[s]) {
          // drop this segment + its EXTINF + discontinuity
          pendingExtInf = null;
          pendingDiscontinuity = false;
          removed++;
          continue;
        }
        if (pendingExtInf) { out.push(pendingExtInf); pendingExtInf = null; }
        if (pendingDiscontinuity) { out.push("#EXT-X-DISCONTINUITY"); pendingDiscontinuity = false; }
        // rewrite to absolute to avoid relative resolution issues after filtering
        const absolute = trimmed.startsWith("http") ? trimmed : resolveUrl(baseUrl, trimmed);
        out.push(absolute);
      }
      if (removed > 0) {
        // recalc TARGETDURATION if needed - keep original, HLS tolerates lower
        console.log(`[m3u8-clean] removed ${removed} ad segments from ${baseUrl}`);
      }
      return out.join("\n");
    };

    try {
      let content = await fetchText(rawUrl);
      // Master playlist? contains EXT-X-STREAM-INF -> pick best variant and recurse
      if (content.includes("#EXT-X-STREAM-INF")) {
        // parse variants: #EXT-X-STREAM-INF:BANDWIDTH=xxx,RESOLUTION=...
        // next line is variant URI
        const lines = content.split(/\r?\n/);
        type Variant = { bw: number; uri: string };
        const variants: Variant[] = [];
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes("#EXT-X-STREAM-INF")) {
            const bwMatch = lines[i].match(/BANDWIDTH=(\d+)/);
            const bw = bwMatch ? parseInt(bwMatch[1], 10) : 0;
            const next = (lines[i+1] || "").trim();
            if (next && !next.startsWith("#")) {
              const abs = next.startsWith("http") ? next : resolveUrl(rawUrl, next);
              variants.push({ bw, uri: abs });
            }
          }
        }
        if (variants.length > 0) {
          variants.sort((a,b)=> b.bw - a.bw);
          const best = variants[0].uri;
          content = await fetchText(best);
          // now clean media playlist with best as base
          const cleaned = cleanMediaPlaylist(content, best);
          res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
          res.setHeader("Access-Control-Allow-Origin", "*");
              res.setHeader("Cache-Control", "no-cache");
          return res.send(cleaned);
        }
      }
      // media playlist clean
      if (content.includes("#EXTM3U")) {
        const cleaned = cleanMediaPlaylist(content, rawUrl);
        res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Cache-Control", "no-cache");
        return res.send(cleaned);
      }
      // not m3u8? proxy as is
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.setHeader("Access-Control-Allow-Origin", "*");
      return res.send(content);
    } catch (err: any) {
      console.warn(`[m3u8-proxy] ${rawUrl}:`, err.message);
      return res.status(502).send(`m3u8 proxy error: ${err.message}`);
    }
  });

  // 5. Generic proxy for CORS issues (e.g. Manga Chapter APIs)
  app.get("/api/proxy/generic", requireAuth, requireActiveSlot, async (req, res) => {
    const b64url = req.query.url as string;
    if (!b64url) return res.status(400).json({ error: "Missing url" });
    
    let url = "";
    try {
      url = Buffer.from(b64url, "base64").toString("utf-8");
    } catch (e) {
      return res.status(400).json({ error: "Invalid base64 url" });
    }

    if (!url.startsWith("http")) {
      return res.status(400).json({ error: "Invalid url scheme" });
    }

    const cacheKey = `generic:${url}`;
    const cached = proxyCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return res.json(cached.data);
    }

    try {
      const data = await fetchGenericHardened(url, 60000);
      proxyCache.set(cacheKey, { data, timestamp: Date.now() });
      return res.json(data);
    } catch (err: any) {
      if (err.message && err.message.includes('404')) {
        console.warn(`[Proxy 404] Upstream not found for ${url}`);
        return res.status(404).json({ error: "Upstream not found", status: 404 });
      }
      if (err.message && /Blocked|Only http/.test(err.message)) {
        return res.status(403).json({ error: "URL not allowed" });
      }
      console.warn(`[Proxy Warning] ${url}:`, err.message);
      if (cached) return res.json(cached.data);
      return res.status(502).json({ error: err.message });
    }
  });

  // 5b. Dedicated Image Proxy for MangaDex covers, chapters, and external manga CDNs
  app.get("/api/proxy/image", async (req, res) => {
    let imageUrl = req.query.url as string;
    if (!imageUrl) {
      return res.status(400).send("Missing image url");
    }

    // Support base64 encoded URL or plain URL
    if (!imageUrl.startsWith("http")) {
      try {
        imageUrl = Buffer.from(imageUrl, "base64").toString("utf-8");
      } catch {
        return res.status(400).send("Invalid image URL");
      }
    }

    if (!imageUrl.startsWith("http")) {
      return res.status(400).send("Invalid image URL scheme");
    }

    // Prompt 3 BƯỚC 4: endpoint này gắn vào thuộc tính src của thẻ <img> nên
    // KHÔNG áp requireAuth (thẻ img không gửi được header Authorization).
    // Thay vào đó chỉ cho phép domain upstream cố định, domain khác -> 403.
    let imageHost = "";
    try {
      imageHost = new URL(imageUrl).hostname.toLowerCase();
    } catch {
      return res.status(400).send("Invalid image URL");
    }
    const IMAGE_ALLOW_SUFFIX = [
      "uploads.mangadex.org",
      "mangadex.network",
      "hinhhinh.com",
      "truyenvua.com",
      "tintruyen.com",
      "tintruyen.net",
      "truyenqqko.com",
      "truyenqqgo.com",
      "truyenqqno.com",
      "truyenqqto.com",
      "otruyenapi.com",
      "otruyen.cc",
      "otruyencdn.com",
      "cuutruyen.net",
      "image.tmdb.org",
      "phimimg.com",
      "phimapi.com",
      "ophim1.com",
      "phim.nguonc.com",
    ];
    const imageFamily =
      imageHost.includes("truyenqq") ||
      imageHost.includes("hinhhinh") ||
      imageHost.includes("truyenvua") ||
      imageHost.includes("tintruyen");
    const imageAllowed =
      imageFamily || IMAGE_ALLOW_SUFFIX.some((d) => imageHost === d || imageHost.endsWith("." + d));
    if (!imageAllowed) {
      return res.status(403).send("Image domain not allowed");
    }

    // Image cache storage in memory
    const candidateUrls: string[] = [];

    // Check if this is a MangaDex page URL (from a @home node or uploads)
    const mdMatch = imageUrl.match(/(?:mangadex\.network|uploads\.mangadex\.org)\/(data|data-saver)\/([a-f0-9]+)\/([^?#]+)/i);
    if (mdMatch) {
      const [, type, hash, file] = mdMatch;
      const officialUploads = `https://uploads.mangadex.org/${type}/${hash}/${file}`;
      candidateUrls.push(officialUploads);
      if (imageUrl !== officialUploads) {
        candidateUrls.push(imageUrl);
      }
      if (type === 'data') {
        candidateUrls.push(`https://uploads.mangadex.org/data-saver/${hash}/${file}`);
      }
    } else {
      candidateUrls.push(imageUrl);
    }

    if (imageUrl.includes("hinhhinh.com") || imageUrl.includes("truyenvua.com") || imageUrl.includes("tintruyen.com") || imageUrl.includes("truyenqq")) {
      const cleanSingle = imageUrl.replace(/(https?:\/\/[^\/]+)\/\/+/g, "$1/").replace(/(\d+\.)?tintruyen\.(net|com)/gi, "i.hinhhinh.com");
      if (cleanSingle !== imageUrl && !candidateUrls.includes(cleanSingle)) candidateUrls.push(cleanSingle);

      const hinhhinhAlt = cleanSingle.replace(/https?:\/\/[^\/]+/gi, "https://i.hinhhinh.com");
      if (!candidateUrls.includes(hinhhinhAlt)) candidateUrls.push(hinhhinhAlt);

      const truyenvuaAlt = cleanSingle.replace(/https?:\/\/[^\/]+/gi, "https://i178.truyenvua.com");
      if (!candidateUrls.includes(truyenvuaAlt)) candidateUrls.push(truyenvuaAlt);
    }

    // Check if this is a MangaDex cover URL
    const mdCoverMatch = imageUrl.match(/uploads\.mangadex\.org\/covers\/([a-f0-9-]+)\/([^?#]+)/i);
    if (mdCoverMatch) {
      const [, mangaId, fileName] = mdCoverMatch;
      if (fileName.endsWith('.256.jpg') || fileName.endsWith('.512.jpg')) {
        const rawFileName = fileName.replace(/\.(256|512)\.jpg$/, '');
        candidateUrls.push(`https://uploads.mangadex.org/covers/${mangaId}/${rawFileName}`);
      }
    }

    // Check in-memory image cache first
    const cached = imageMemoryCache.get(imageUrl);
    if (cached) {
      res.setHeader("Content-Type", cached.contentType);
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "public, max-age=2592000, immutable");
      res.setHeader("X-Cache", "HIT");
      return res.send(cached.buffer);
    }

    // Determine candidate referers based on image domain
    const candidateReferers: string[] = [];
    if (imageUrl.includes("hinhhinh.com") || imageUrl.includes("truyenvua.com") || imageUrl.includes("tintruyen.com") || imageUrl.includes("truyenqq") || imageUrl.includes("st.truyenqq")) {
      candidateReferers.push("https://truyenqqko.com/", "https://truyenqqno.com/", "https://truyenqqgo.com/", "https://truyenqqto.com/", "");
    } else if (imageUrl.includes("mangadex")) {
      candidateReferers.push("https://mangadex.org/", "");
    } else if (imageUrl.includes("otruyen")) {
      candidateReferers.push("https://otruyenapi.com/", "https://otruyen.cc/", "");
    } else if (imageUrl.includes("cuutruyen")) {
      candidateReferers.push("https://cuutruyen.net/", "");
    } else {
      candidateReferers.push("");
    }

    for (const urlToFetch of candidateUrls) {
      for (const referer of candidateReferers) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 12000);
          const headers: Record<string, string> = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          };
          if (referer) {
            headers["Referer"] = referer;
          }
          const upstream = await fetch(urlToFetch, {
            signal: controller.signal,
            headers,
          });
          clearTimeout(timer);

          if (upstream.ok) {
            const contentType = upstream.headers.get("content-type") || "image/jpeg";
            // Prompt 3 BƯỚC 4: chỉ trả về nội dung thật sự là ảnh.
            if (!contentType.toLowerCase().startsWith("image/")) {
              continue;
            }
            const arrayBuffer = await upstream.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            // Save to in-memory cache
            imageMemoryCache.set(imageUrl, { buffer, contentType });

            res.setHeader("Content-Type", contentType);
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Cache-Control", "public, max-age=2592000, immutable");
            res.setHeader("X-Cache", "MISS");
            return res.send(buffer);
          }
        } catch (err: any) {
          // Try next referer / url candidate
        }
      }
    }

    return res.status(502).send("Failed to fetch image upstream across all fallback sources");
  });

  // --- NETFLIX VIETNAM TOP 10 SCRAPER & RESOLVER ENGINE ---
  interface NetflixTop10Cache {
    movies: any[];
    tvShows: any[];
    movieTitles: string[];
    tvTitles: string[];
    lastUpdated: number;
  }

  // Initial seed data to guarantee 10 movies and 10 TV series instantly on first load
  const initialSeedNetflixMovies: any[] = [
    { slug: "anora", name: "Anora", origin_name: "Anora", poster_url: "https://image.tmdb.org/t/p/w500/cgXk2tNYhJZLXdBDO5DidAVzQ82.jpg", thumb_url: "https://image.tmdb.org/t/p/w500/cgXk2tNYhJZLXdBDO5DidAVzQ82.jpg", year: 2024, quality: "FHD", lang: "Vietsub", source: "kkphim", sourceLabel: "Netflix" },
    { slug: "2012", name: "2012", origin_name: "2012", poster_url: "https://image.tmdb.org/t/p/w500/q1jhf6lrIzrmerudhSsUVFHo8GD.jpg", thumb_url: "https://image.tmdb.org/t/p/w500/q1jhf6lrIzrmerudhSsUVFHo8GD.jpg", year: 2009, quality: "FHD", lang: "Thuyết Minh", source: "kkphim", sourceLabel: "Netflix" },
    { slug: "safe", name: "Safe", origin_name: "Safe", poster_url: "https://image.tmdb.org/t/p/w500/tZj0CTDzyh08I3ZkF1d9swrGVdk.jpg", thumb_url: "https://image.tmdb.org/t/p/w500/tZj0CTDzyh08I3ZkF1d9swrGVdk.jpg", year: 2012, quality: "HD", lang: "Vietsub", source: "kkphim", sourceLabel: "Netflix" },
    { slug: "oceans-eleven", name: "11 Tên Cướp Thế Kỷ", origin_name: "Ocean's Eleven", poster_url: "https://image.tmdb.org/t/p/w500/hQQCdZrsHtZyR6NbKH2YyCqd2fR.jpg", thumb_url: "https://image.tmdb.org/t/p/w500/hQQCdZrsHtZyR6NbKH2YyCqd2fR.jpg", year: 2001, quality: "HD", lang: "Vietsub", source: "kkphim", sourceLabel: "Netflix" },
    { slug: "wolf-man", name: "Người Sói", origin_name: "Wolf Man", poster_url: "https://image.tmdb.org/t/p/w500/h7cxTMzWgEjzQGNVc96Iig1NtW1.jpg", thumb_url: "https://image.tmdb.org/t/p/w500/h7cxTMzWgEjzQGNVc96Iig1NtW1.jpg", year: 2025, quality: "FHD", lang: "Vietsub", source: "kkphim", sourceLabel: "Netflix" },
    { slug: "the-magnificent-seven", name: "Bảy Tay Súng Huyền Thoại", origin_name: "The Magnificent Seven", poster_url: "https://image.tmdb.org/t/p/w500/e5ToxOyJwuZD4VOfI0qEn5uIjeJ.jpg", thumb_url: "https://image.tmdb.org/t/p/w500/e5ToxOyJwuZD4VOfI0qEn5uIjeJ.jpg", year: 2016, quality: "HD", lang: "Vietsub", source: "kkphim", sourceLabel: "Netflix" },
    { slug: "gohan", name: "Bảy Viên Ngọc Rồng", origin_name: "Dragon Ball Super: Super Hero", poster_url: "https://image.tmdb.org/t/p/w500/1TIl7hssPbhfUXqAL3geaiE4gNT.jpg", thumb_url: "https://image.tmdb.org/t/p/w500/1TIl7hssPbhfUXqAL3geaiE4gNT.jpg", year: 2022, quality: "FHD", lang: "Vietsub", source: "kkphim", sourceLabel: "Netflix" },
    { slug: "the-whisper-man", name: "Người Thì Thầm", origin_name: "The Whisper Man", poster_url: "https://image.tmdb.org/t/p/w500/ndRs5lADYm0PeVjuOxaMcInY0o2.jpg", thumb_url: "https://image.tmdb.org/t/p/w500/ndRs5lADYm0PeVjuOxaMcInY0o2.jpg", year: 2024, quality: "HD", lang: "Vietsub", source: "kkphim", sourceLabel: "Netflix" },
    { slug: "tho-oi", name: "Thỏ Ơi!!", origin_name: "Bunny!!", poster_url: "https://phimimg.com/upload/vod/20260601-1/034afe4d9f1198904977bb7cd8297a56.jpg", thumb_url: "https://phimimg.com/upload/vod/20260601-1/a93bfd52980655de0571d55d9c9f2440.jpg", year: 2026, quality: "FHD", lang: "Vietsub", source: "kkphim", sourceLabel: "Netflix" },
    { slug: "red-notice", name: "Lệnh Truy Nã Đỏ", origin_name: "Red Notice", poster_url: "https://image.tmdb.org/t/p/w500/cnDtt2WzRAekxbE2Qmt0LnoVb3W.jpg", thumb_url: "https://image.tmdb.org/t/p/w500/cnDtt2WzRAekxbE2Qmt0LnoVb3W.jpg", year: 2021, quality: "FHD", lang: "Vietsub", source: "kkphim", sourceLabel: "Netflix" }
  ];

  const initialSeedNetflixTv: any[] = [
    { slug: "agent-kim-reactivated", name: "Đặc Vụ Kim Tái Xuất", origin_name: "Agent Kim Reactivated", poster_url: "https://image.tmdb.org/t/p/w500/2jHNTdH9taElayuc1iLnI7cP36C.jpg", thumb_url: "https://image.tmdb.org/t/p/w500/2jHNTdH9taElayuc1iLnI7cP36C.jpg", year: 2025, quality: "FHD", lang: "Vietsub", source: "kkphim", sourceLabel: "Netflix" },
    { slug: "spooky-in-love", name: "Yêu Em Ma Quỷ", origin_name: "Spooky in Love", poster_url: "https://image.tmdb.org/t/p/w500/fMM8IdzpHPTKdUwOeYZcS6SYhtW.jpg", thumb_url: "https://image.tmdb.org/t/p/w500/fMM8IdzpHPTKdUwOeYZcS6SYhtW.jpg", year: 2025, quality: "HD", lang: "Vietsub", source: "kkphim", sourceLabel: "Netflix" },
    { slug: "mousetrap", name: "Bẫy Chuột", origin_name: "Mousetrap", poster_url: "https://image.tmdb.org/t/p/w500/z1xv9CKt7HmXgS6azNB563mU2FB.jpg", thumb_url: "https://image.tmdb.org/t/p/w500/z1xv9CKt7HmXgS6azNB563mU2FB.jpg", year: 2024, quality: "HD", lang: "Vietsub", source: "kkphim", sourceLabel: "Netflix" },
    { slug: "the-early-spring", name: "Đầu Xuân", origin_name: "The Early Spring", poster_url: "https://image.tmdb.org/t/p/w500/uCpDUdogzpqzFKVPtoPLGCLyXbj.jpg", thumb_url: "https://image.tmdb.org/t/p/w500/uCpDUdogzpqzFKVPtoPLGCLyXbj.jpg", year: 2025, quality: "HD", lang: "Vietsub", source: "kkphim", sourceLabel: "Netflix" },
    { slug: "our-sticky-love", name: "Tình Yêu Gắn Kết", origin_name: "Our Sticky Love", poster_url: "https://image.tmdb.org/t/p/w500/ny8zYj40mWGTgKJi1a8hjNFUj9n.jpg", thumb_url: "https://image.tmdb.org/t/p/w500/ny8zYj40mWGTgKJi1a8hjNFUj9n.jpg", year: 2025, quality: "HD", lang: "Vietsub", source: "kkphim", sourceLabel: "Netflix" },
    { slug: "the-east-palace", name: "Đông Cung", origin_name: "The East Palace", poster_url: "https://image.tmdb.org/t/p/w500/kdpKjpWmT7piPht4RXj7UPnVJMe.jpg", thumb_url: "https://image.tmdb.org/t/p/w500/kdpKjpWmT7piPht4RXj7UPnVJMe.jpg", year: 2024, quality: "HD", lang: "Vietsub", source: "kkphim", sourceLabel: "Netflix" },
    { slug: "can-this-love-be-translated", name: "Tình Yêu Này Có Thể Dịch Không?", origin_name: "Can This Love Be Translated?", poster_url: "https://image.tmdb.org/t/p/w500/xvlfY1XjZ2kKdaCCDvZLPTB65JG.jpg", thumb_url: "https://image.tmdb.org/t/p/w500/xvlfY1XjZ2kKdaCCDvZLPTB65JG.jpg", year: 2025, quality: "FHD", lang: "Vietsub", source: "kkphim", sourceLabel: "Netflix" },
    { slug: "teach-you-a-lesson", name: "Dạy Cho Bài Học", origin_name: "Teach You a Lesson", poster_url: "https://image.tmdb.org/t/p/w500/mbO0o1cRqoPehYFfHSbxHgLOc1I.jpg", thumb_url: "https://image.tmdb.org/t/p/w500/mbO0o1cRqoPehYFfHSbxHgLOc1I.jpg", year: 2024, quality: "HD", lang: "Vietsub", source: "kkphim", sourceLabel: "Netflix" },
    { slug: "squid-game-season-2", name: "Trò Chơi Con Mực: Mùa 2", origin_name: "Squid Game: Season 2", poster_url: "https://image.tmdb.org/t/p/w500/54qPSleZ59VjPBBl2HDcCueXZpC.jpg", thumb_url: "https://image.tmdb.org/t/p/w500/54qPSleZ59VjPBBl2HDcCueXZpC.jpg", year: 2024, quality: "FHD", lang: "Vietsub", source: "kkphim", sourceLabel: "Netflix" },
    { slug: "sweet-home-season-3", name: "Thế Giới Ma Quái: Mùa 3", origin_name: "Sweet Home: Season 3", poster_url: "https://image.tmdb.org/t/p/w500/sMgWZR6wwLjyz3mEWVu0TGdISAE.jpg", thumb_url: "https://image.tmdb.org/t/p/w500/sMgWZR6wwLjyz3mEWVu0TGdISAE.jpg", year: 2024, quality: "FHD", lang: "Vietsub", source: "kkphim", sourceLabel: "Netflix" }
  ];

  let netflixTop10Cache: NetflixTop10Cache = {
    movies: initialSeedNetflixMovies,
    tvShows: initialSeedNetflixTv,
    movieTitles: initialSeedNetflixMovies.map((m) => m.name),
    tvTitles: initialSeedNetflixTv.map((t) => t.name),
    lastUpdated: Date.now(),
  };

  async function parseNetflixTop10Titles(url: string): Promise<string[]> {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        signal: AbortSignal.timeout(4500),
        redirect: "follow",
      });
      if (!response.ok) return [];
      const htmlText = await response.text();
      const rows = [...htmlText.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
      const titles: string[] = [];
      for (const tr of rows) {
        const tds = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].replace(/<[^>]+>/g, "").trim());
        if (tds.length > 0 && tds[0]) {
          let cleanName = tds[0].replace(/^(0[1-9]|10)\s*/, "").trim();
          cleanName = cleanName.replace(/:\s*(Season|Limited Series|Part|\d+).*$/i, "").trim();
          if (cleanName && !titles.includes(cleanName)) {
            titles.push(cleanName);
          }
        }
      }
      return titles.slice(0, 10);
    } catch (e: any) {
      return [];
    }
  }

  // Slugify tên phim kiểu phimapi (vd "Mai" -> "mai"). Dùng để đoán URL
  // detail trực tiếp khi search keyword không trả về đúng phim.
  function slugifyHeroTitle(s: any): string {
    try {
      return String(s || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/[\s_]+/g, "-")
        .replace(/-+/g, "-");
    } catch {
      return "";
    }
  }
  let isUpdatingNetflixTop10 = false;
  // Tra cứu TMDB theo tên (làm trọng tài identity cho title Tudum chỉ có text).
  // Trả về { id, title, originalTitle, poster, year } hoặc null.
  async function lookupTmdbTitle(title: string, isTv: boolean): Promise<{ id: string; title: string; originalTitle: string; poster: string; year?: number } | null> {
    const q = String(title || "").trim();
    if (!q) return null;
    const bearer = process.env.TMDB_BEARER_TOKEN || process.env.TMDB_READ_TOKEN || "";
    const apiKey = process.env.TMDB_API_KEY || "";
    if (!bearer && !apiKey) return null;
    const headers: Record<string, string> = { Accept: "application/json", "User-Agent": "GauCinema/1.0" };
    if (bearer) headers["Authorization"] = `Bearer ${bearer}`;
    // Đúng loại trước (movie/tv theo trang Tudum), sai loại sau.
    const kinds = isTv ? ["tv", "movie"] : ["movie", "tv"];
    for (const kind of kinds) {
      const urls: string[] = [];
      if (bearer) urls.push(`https://api.themoviedb.org/3/search/${kind}?query=${encodeURIComponent(q)}&language=vi-VN&page=1`);
      if (apiKey) urls.push(`https://api.themoviedb.org/3/search/${kind}?query=${encodeURIComponent(q)}&language=vi-VN&page=1&api_key=${apiKey}`);
      for (const u of urls) {
        try {
          const controller = new AbortController();
          const t = setTimeout(() => controller.abort(), 4000);
          const r = await fetch(u, { headers, signal: controller.signal });
          clearTimeout(t);
          if (!r.ok) continue;
          const data: any = await r.json().catch(() => null);
          if (!data?.results?.length) continue;
          // Cổng liên quan: chỉ xét các kết quả KHỚP CHÍNH XÁC tên, rồi chọn
          // phim hot nhất (popularity cao nhất) trong số đó — vd "Mai" có
          // nhiều phim trùng tên (2017/2024/2025...), lấy [0] mù quáng là sai.
          const qN = normHeroTitle(q);
          const qF = normHeroTitle(stripHeroDiacritics(q));
          const exactHits = (data.results || []).filter((r: any) => {
            if (!r?.id) return false;
            const rT = normHeroTitle(r.title || r.name);
            const rO = normHeroTitle(r.original_title || r.original_name);
            const rTf = normHeroTitle(stripHeroDiacritics(r.title || r.name));
            const rOf = normHeroTitle(stripHeroDiacritics(r.original_title || r.original_name));
            return rT === qN || rO === qN || rTf === qF || rOf === qF;
          });
          if (exactHits.length === 0) continue;
          exactHits.sort((a: any, b: any) => Number(b.popularity || 0) - Number(a.popularity || 0));
          const first = exactHits[0];
          const dateStr = String(first.release_date || first.first_air_date || "");
          const year = dateStr ? Number(dateStr.slice(0, 4)) : undefined;
          return {
            id: String(first.id),
            title: String(first.title || first.name || q),
            originalTitle: String(first.original_title || first.original_name || q),
            poster: first.poster_path ? `https://image.tmdb.org/t/p/w500${first.poster_path}` : "",
            year: Number.isFinite(year) ? year : undefined,
          };
        } catch { /* thử URL tiếp theo */ }
      }
      // Có kết quả ở đúng loại thì dừng, không lan sang loại kia.
      // (vòng lặp kinds chỉ tiếp tục khi loại trước không trả về gì)
    }
    return null;
  }
  async function updateNetflixTop10Cache() {
    if (isUpdatingNetflixTop10) return;
    isUpdatingNetflixTop10 = true;
    // Chẩn đoán nhanh: không có TMDB keys thì lookup identity chết, resolve rớt hàng loạt.
    try {
      const hasBearer = !!(process.env.TMDB_BEARER_TOKEN || process.env.TMDB_READ_TOKEN);
      const hasKey = !!process.env.TMDB_API_KEY;
      console.log(`[Batch] TMDB creds: bearer=${hasBearer ? "yes" : "NO"} apiKey=${hasKey ? "yes" : "NO"}`);
    } catch { /* ignore */ }
    try {
      // 1. Live scrape dynamically from official Netflix Tudum Top 10 Vietnam
      const [scrapedMovieTitles, scrapedTvTitles] = await Promise.all([
        parseNetflixTop10Titles("https://www.netflix.com/tudum/top10/vietnam"),
        parseNetflixTop10Titles("https://www.netflix.com/tudum/top10/vietnam/tv"),
      ]);

      const titleSearchAlias: Record<string, string> = {
        "bunny!": "Thỏ Ơi",
        "bunny!!": "Thỏ Ơi",
        "bunny": "Thỏ Ơi",
        "grand theft auto vi: an extended look": "Grand Theft Auto VI",
      };

      const fallbackMovies = [
        "Anora", "2012", "Safe", "Ocean's Eleven", "Wolf Man",
        "The Magnificent Seven", "Dragon Ball Super", "The Whisper Man", "Bunny!!", "Red Notice"
      ];
      const fallbackTv = [
        "Agent Kim Reactivated", "Spooky in Love", "Mousetrap", "The Early Spring",
        "Our Sticky Love", "The East Palace", "Can This Love Be Translated?",
        "Teach You a Lesson", "Squid Game", "Sweet Home"
      ];

      const movieTitles = scrapedMovieTitles.length > 0 ? scrapedMovieTitles : fallbackMovies;
      const tvTitles = scrapedTvTitles.length > 0 ? scrapedTvTitles : fallbackTv;

      const resolveList = async (rawTitles: string[], isTv: boolean, seedFallback: any[]) => {
        const items: any[] = [];
        const usedSlugs = new Set<string>();

        // Parallel batch search across titles with 3.5s timeout
        const searchPromises = rawTitles.slice(0, 10).map(async (title) => {
          try {
            const lowerTitle = title.toLowerCase().trim();
            const normLower = normHeroTitle(lowerTitle);
            // FIX CỨNG: Bunny! / Bunny!! / Bunny / Thỏ Ơi -> slug tho-oi (bypass search dễ lỗi, poster hỏng)
            if (normLower.includes("bunny") || lowerTitle.includes("thỏ ơi") || normLower.includes("tho oi")) {
              try {
                const detailRaw = await fetchWithTimeout(`https://phimapi.com/phim/tho-oi`, 3500).catch(() => null);
                const d = detailRaw?.movie || detailRaw?.data?.item || null;
                if (d && (d.slug || d.name)) {
                  return {
                    slug: "tho-oi",
                    name: d.name || "Thỏ Ơi!!",
                    origin_name: d.origin_name || "Bunny!!",
                    poster_url: d.poster_url || d.thumb_url || "",
                    thumb_url: d.thumb_url || d.poster_url || "",
                    year: d.year || 2026,
                    quality: d.quality || "FHD",
                    lang: d.lang || "Vietsub",
                    source: "kkphim",
                    sourceLabel: "Netflix",
                  };
                }
              } catch {}
              // Fallback cứng với poster http đã verify (tránh uploads/... làm vỡ guard countGoodPosters)
              return {
                slug: "tho-oi",
                name: "Thỏ Ơi!!",
                origin_name: "Bunny!!",
                poster_url: "https://phimimg.com/upload/vod/20260601-1/034afe4d9f1198904977bb7cd8297a56.jpg",
                thumb_url: "https://phimimg.com/upload/vod/20260601-1/a93bfd52980655de0571d55d9c9f2440.jpg",
                year: 2026,
                quality: "FHD",
                lang: "Vietsub",
                source: "kkphim",
                sourceLabel: "Netflix",
              };
            }
            // Resolve chuẩn: TMDB làm trọng tài identity trước, phimapi theo sau.
            // 1) lookup TMDB lấy id/năm/poster chính chủ.
            // 2) search phimapi bằng FULL title trước, baseTitle (cắt "...: ...") sau.
            // 3) Chấm bằng pickBest với tmdbId+năm (khớp id là chắc chắn).
            // 4) KHÔNG bao giờ chấp nhận khớp chứa-chuỗi lỏng (đó là đường "Monster Eater").
            const tmdbRef = await lookupTmdbTitle(title, isTv).catch(() => null);
            // FIX CỨNG: "Mousetrap: Limited Series" (chart truyền hình) là bản
            // series slug bay-chuot-phan-1, không phải phim lẻ "The Mouse Trap".
            // Trùng tên 3 bên nên không để scoring tự đoán (bài học Monster Eater).
            if (normLower === "mousetrap") {
              try {
                const detailRaw = await fetchWithTimeout(`https://phimapi.com/phim/bay-chuot-phan-1`, 3500).catch(() => null);
                const d = detailRaw?.movie || detailRaw?.data?.item || null;
                if (d && d.slug === "bay-chuot-phan-1") {
                  return {
                    slug: "bay-chuot-phan-1",
                    name: d.name || "Bẫy Chuột (Phần 1)",
                    origin_name: d.origin_name || "Mousetrap (Season 1)",
                    poster_url: d.poster_url || d.thumb_url || tmdbRef?.poster || "",
                    thumb_url: d.thumb_url || d.poster_url || tmdbRef?.poster || "",
                    year: d.year || 2026,
                    quality: d.quality || "FHD",
                    lang: d.lang || "Vietsub",
                    source: "kkphim",
                    sourceLabel: "Netflix",
                  };
                }
              } catch {}
            }
            const baseTitle = title.replace(/\s*\(.*?\)/, "").replace(/:\s*.*$/, "").trim();
            const queries: string[] = [];
            for (const q of [
              title,
              baseTitle,
              titleSearchAlias[lowerTitle],
              titleSearchAlias[baseTitle.toLowerCase()],
              titleSearchAlias[normLower],
              tmdbRef?.title,
              tmdbRef?.originalTitle,
            ]) {
              const qq = String(q || "").trim();
              if (qq && !queries.some((x) => normHeroTitle(x) === normHeroTitle(qq))) queries.push(qq);
            }
            let matchedItem: any = null;
            // 1b) Đoán slug detail trực tiếp (vd Mai 2024 nằm ở slug mai-2024
            // trong khi slug "mai" là phim khác, search keyword không bao giờ
            // trả về đúng). Verify chéo: tên khớp chính xác + năm lệch ≤1 +
            // tmdb.id khớp khi cả 2 bên đều có. Rớt cái nào là bỏ ngay.
            const slugGuesses: string[] = [];
            for (const s of [title, baseTitle, tmdbRef?.title, tmdbRef?.originalTitle]) {
              const base = slugifyHeroTitle(s);
              if (!base || slugGuesses.includes(base)) continue;
              slugGuesses.push(base);
              if (tmdbRef?.year) {
                const withYear = `${base}-${tmdbRef.year}`;
                if (!slugGuesses.includes(withYear)) slugGuesses.push(withYear);
              }
            }
            const tN = normHeroTitle(title);
            for (const g of slugGuesses.slice(0, 8)) {
              try {
                const r = await fetchWithTimeout(`https://phimapi.com/phim/${g}`, 3500).catch(() => null);
                const d = (r as any)?.movie || (r as any)?.data?.item || null;
                if (!d?.slug) continue;
                const n = normHeroTitle(d.name);
                const o = normHeroTitle(d.origin_name);
                if (!(n === tN || o === tN)) continue;
                const dYear = Number(d.year);
                if (tmdbRef?.year && Number.isFinite(dYear) && Math.abs(dYear - tmdbRef.year) > 1) continue;
                const dTmdb = String(d?.tmdb?.id || "").trim();
                if (tmdbRef?.id && dTmdb && dTmdb !== tmdbRef.id) continue;
                matchedItem = d;
                break;
              } catch { /* thử slug tiếp theo */ }
            }
            // Vòng search chỉ chạy khi đoán slug chưa trúng (tránh ghi đè kết quả probe).
            if (!matchedItem) {
              for (const searchQuery of queries) {
              try {
                const searchUrl = `https://phimapi.com/v1/api/tim-kiem?keyword=${encodeURIComponent(searchQuery)}&limit=10`;
                const searchRes = await fetchWithTimeout(searchUrl, 3500).catch(() => null);
                const foundItems = searchRes?.data?.items || searchRes?.items || [];
                if (foundItems.length === 0) continue;
                // Chấm trên FULL title Tudum (giữ ": ..."), kèm tmdbId/năm làm trọng tài.
                matchedItem = pickBestPhimapiMatch(foundItems, {
                  title,
                  originalTitle: tmdbRef?.originalTitle || title,
                  altTitle: tmdbRef?.title,
                  year: tmdbRef?.year,
                  tmdbId: tmdbRef?.id,
                });
                if (matchedItem?.slug) break;
                matchedItem = null;
              } catch { /* thử query tiếp theo */ }
              }
            }
            // Sanity cuối: chỉ chấp nhận KHỚP CHÍNH XÁC tên (2 dạng dấu), không
            // giới hạn độ dài (title ngắn như "Mai" vẫn khớp được).
            if (!matchedItem) {
              try {
                const searchUrl = `https://phimapi.com/v1/api/tim-kiem?keyword=${encodeURIComponent(queries[0] || title)}&limit=10`;
                const searchRes = await fetchWithTimeout(searchUrl, 3500).catch(() => null);
                const foundItems = searchRes?.data?.items || searchRes?.items || [];
                const q = normHeroTitle(title);
                const qF = normHeroTitle(stripHeroDiacritics(title));
                const c0 = foundItems.find((c: any) => {
                  if (!c?.slug) return false;
                  const n = normHeroTitle(c.name);
                  const o = normHeroTitle(c.origin_name);
                  const nF = normHeroTitle(stripHeroDiacritics(c.name));
                  const oF = normHeroTitle(stripHeroDiacritics(c.origin_name));
                  return n === q || o === q || nF === qF || oF === qF;
                });
                if (c0) matchedItem = c0;
              } catch {}
            }
            if (matchedItem && matchedItem.slug) {
              if (process.env.BATCH_DEBUG) {
                console.log(`[Batch][resolved] "${title}" -> slug=${matchedItem.slug} tmdb=${tmdbRef?.id || "-"}`);
              }
              let poster = matchedItem.poster_url || matchedItem.thumb_url || "";
              if ((!poster || !String(poster).startsWith("http")) && tmdbRef?.poster) {
                poster = tmdbRef.poster;
              }
              let thumb = matchedItem.thumb_url || matchedItem.poster_url || "";
              if ((!thumb || !String(thumb).startsWith("http")) && tmdbRef?.poster) {
                thumb = tmdbRef.poster;
              }
              return {
                slug: matchedItem.slug,
                name: matchedItem.name || tmdbRef?.title || title,
                origin_name: matchedItem.origin_name || tmdbRef?.originalTitle || title,
                poster_url: poster,
                thumb_url: thumb,
                year: matchedItem.year || tmdbRef?.year || new Date().getFullYear(),
                quality: matchedItem.quality || "HD",
                lang: matchedItem.lang || "Vietsub",
                source: "kkphim",
                sourceLabel: "Netflix",
              };
            }
            // Không resolve được slug nhưng TMDB biết phim này: giữ thẻ đúng
            // title+poster (bấm vào sẽ search thay vì mở detail hỏng). Thà hiện
            // đúng còn hơn nhét nhầm phim khác hoặc filler.
            if (tmdbRef) {
              if (process.env.BATCH_DEBUG) {
                console.log(`[Batch][unresolved] "${title}" tmdb=${tmdbRef.id} year=${tmdbRef.year} poster=${tmdbRef.poster ? "yes" : "NO"}`);
              }
              return {
                slug: "",
                name: tmdbRef.title || title,
                origin_name: tmdbRef.originalTitle || title,
                poster_url: tmdbRef.poster || "",
                thumb_url: tmdbRef.poster || "",
                year: tmdbRef.year || new Date().getFullYear(),
                quality: "HD",
                lang: "Vietsub",
                source: "tmdb",
                sourceLabel: "Netflix",
                unresolvable: true,
              };
            }
          } catch {}
          return null;
        });

        const settled = await Promise.allSettled(searchPromises);
        for (const res of settled) {
          // Thẻ unresolved có slug rỗng nên dedup theo tên, tránh nuốt nhau.
          const key = res.status === "fulfilled" && res.value
            ? (res.value.slug || `tudum:${normHeroTitle(res.value.name)}`)
            : "";
          if (res.status === "fulfilled" && res.value && key && !usedSlugs.has(key)) {
            usedSlugs.add(key);
            items.push(res.value);
            if (items.length >= 10) break;
          }
        }

        // Filler 1: Seed items
        if (items.length < 10) {
          for (const seed of seedFallback) {
            if (items.length >= 10) break;
            if (seed.slug && !usedSlugs.has(seed.slug)) {
              usedSlugs.add(seed.slug);
              items.push(seed);
            }
          }
        }

        // Filler 2: Category list if still < 10
        if (items.length < 10) {
          try {
            const catUrl = isTv
              ? `https://phimapi.com/v1/api/danh-sach/phim-bo?page=1&limit=20`
              : `https://phimapi.com/v1/api/danh-sach/phim-le?page=1&limit=20`;
            const catRes = await fetchWithTimeout(catUrl, 4000).catch(() => null);
            const catItems = catRes?.data?.items || catRes?.items || [];
            for (const catItem of catItems) {
              if (items.length >= 10) break;
              if (catItem.slug && !usedSlugs.has(catItem.slug)) {
                usedSlugs.add(catItem.slug);
                items.push({
                  slug: catItem.slug,
                  name: catItem.name,
                  origin_name: catItem.origin_name || "",
                  poster_url: catItem.poster_url || catItem.thumb_url || "",
                  thumb_url: catItem.thumb_url || catItem.poster_url || "",
                  year: catItem.year,
                  quality: catItem.quality || "HD",
                  lang: catItem.lang || "Vietsub",
                  source: "kkphim",
                  sourceLabel: "Netflix",
                });
              }
            }
          } catch {}
        }

        return items.slice(0, 10);
      };

      const [resolvedMovies, resolvedTvShows] = await Promise.all([
        resolveList(movieTitles, false, initialSeedNetflixMovies),
        resolveList(tvTitles, true, initialSeedNetflixTv),
      ]);

      if (resolvedMovies.length >= 8 || resolvedTvShows.length >= 8) {
        let finalMovies = resolvedMovies.length >= 10 ? resolvedMovies.slice(0, 10) : [...resolvedMovies, ...initialSeedNetflixMovies].slice(0, 10);
        let finalTvShows = resolvedTvShows.length >= 10 ? resolvedTvShows.slice(0, 10) : [...resolvedTvShows, ...initialSeedNetflixTv].slice(0, 10);
        
        // Load persistent overrides & existing RTDB data to preserve admin custom configs
        await loadMovieOverrides();
        let existingRtdbNetflix: any = null;
        try {
          existingRtdbNetflix = await fetchFromRtdb("system_cache/netflix_top10");
        } catch {}

        const prevMoviesMap = new Map<string, any>();
        if (existingRtdbNetflix?.data?.movies) {
          for (const m of existingRtdbNetflix.data.movies) {
            if (m.slug) prevMoviesMap.set(m.slug, m);
          }
        }
        if (existingRtdbNetflix?.data?.tvShows) {
          for (const m of existingRtdbNetflix.data.tvShows) {
            if (m.slug) prevMoviesMap.set(m.slug, m);
          }
        }
        if (netflixTop10Cache.movies) {
          for (const m of netflixTop10Cache.movies) {
            if (m.slug && !prevMoviesMap.has(m.slug)) prevMoviesMap.set(m.slug, m);
          }
        }
        if (netflixTop10Cache.tvShows) {
          for (const m of netflixTop10Cache.tvShows) {
            if (m.slug && !prevMoviesMap.has(m.slug)) prevMoviesMap.set(m.slug, m);
          }
        }

        // Apply custom overrides to each scraped movie so admin settings are never overwritten
        finalMovies = finalMovies.map((m: any) => mergeMovieOverrides(m, prevMoviesMap.get(m.slug)));
        finalTvShows = finalTvShows.map((m: any) => mergeMovieOverrides(m, prevMoviesMap.get(m.slug)));

        // GUARD: seed cứng có poster tương đối (uploads/...) -> ảnh hỏng + sai thứ tự.
        // Nếu scrape mới lỗi (mất mạng tới Tudum/PhimAPI) mà vẫn ghi đè RTDB thì sẽ
        // phá dữ liệu tốt đang có (đặc biệt khi 2 server cùng chạy batch: server nào
        // chạy sau mà lỗi sẽ ghi đè server chạy trước). Giữ lại list cũ khi list mới kém hơn.
        const countGoodPosters = (list: any[]): number =>
          (Array.isArray(list) ? list : []).filter(
            (m) => typeof m?.poster_url === 'string' && m.poster_url.startsWith('http')
          ).length;

        const existingMovies = existingRtdbNetflix?.data?.movies;
        const existingTvShows = existingRtdbNetflix?.data?.tvShows;
        const existingMovieTitles = existingRtdbNetflix?.data?.movieTitles;
        const existingTvTitles = existingRtdbNetflix?.data?.tvTitles;

        let outMovies = finalMovies;
        let outTvShows = finalTvShows;
        let outMovieTitles = movieTitles;
        let outTvTitles = tvTitles;

        if (countGoodPosters(finalMovies) < 6 && countGoodPosters(existingMovies) >= 6) {
          console.log('[Netflix Top10] Giữ danh sách phim cũ (kết quả scrape mới bị lỗi, thiếu poster).');
          outMovies = existingMovies;
          if (Array.isArray(existingMovieTitles)) outMovieTitles = existingMovieTitles;
        }
        if (countGoodPosters(finalTvShows) < 6 && countGoodPosters(existingTvShows) >= 6) {
          console.log('[Netflix Top10] Giữ danh sách TV cũ (kết quả scrape mới bị lỗi, thiếu poster).');
          outTvShows = existingTvShows;
          if (Array.isArray(existingTvTitles)) outTvTitles = existingTvTitles;
        }

        netflixTop10Cache = {
          movies: outMovies,
          tvShows: outTvShows,
          movieTitles: outMovieTitles,
          tvTitles: outTvTitles,
          lastUpdated: Date.now(),
        };

        // Asynchronously persist to Firebase RTDB
        const rtdbPayload = {
          status: true,
          data: {
            movies: outMovies,
            tvShows: outTvShows,
            movieTitles: outMovieTitles,
            tvTitles: outTvTitles,
            lastUpdated: Date.now(),
          }
        };
        syncToRtdb("system_cache/netflix_top10", rtdbPayload).catch(() => {});
      }
    } catch (err: any) {
      console.error("[Netflix Top10 VN Update Error]:", err.message);
    } finally {
      isUpdatingNetflixTop10 = false;
    }
  }

  // --- UNIFIED PRE-COMPUTED BATCH RUNNER (FIXED 00:00 & 12:00 VIETNAM TIME UTC+7) ---
  function getNextVietnamScheduleTime(): number {
    const now = Date.now();
    const vnMs = now + 7 * 60 * 60 * 1000;
    const vnDate = new Date(vnMs);
    const year = vnDate.getUTCFullYear();
    const month = vnDate.getUTCMonth();
    const day = vnDate.getUTCDate();
    const hours = vnDate.getUTCHours();

    let targetVnMs: number;
    if (hours < 12) {
      // Target is today 12:00:00 Vietnam time
      targetVnMs = Date.UTC(year, month, day, 12, 0, 0, 0);
    } else {
      // Target is tomorrow 00:00:00 Vietnam time
      targetVnMs = Date.UTC(year, month, day + 1, 0, 0, 0);
    }
    return targetVnMs - 7 * 60 * 60 * 1000;
  }

  let batchTimerId: NodeJS.Timeout | null = null;

  let systemBatchStats = {
    lastRun: Date.now(),
    nextRun: getNextVietnamScheduleTime(),
    isRunning: false,
    heroCount: 10,
    netflixMoviesCount: 10,
    netflixTvCount: 10,
    lastDurationMs: 0,
    status: "idle",
  };

  async function runFullSystemBatch(force = false) {
    if (systemBatchStats.isRunning) return systemBatchStats;
    const startTime = Date.now();
    systemBatchStats.isRunning = true;
    systemBatchStats.status = "running";
    console.log("[Batch Worker] 🚀 Starting Pre-computed Batch Caching for Hero Banner & Netflix Top 10...");

    try {
      const [heroRes] = await Promise.allSettled([
        refreshHeroPopular(force),
        updateNetflixTop10Cache(),
      ]);

      const heroCount = heroRes.status === "fulfilled" && heroRes.value?.items ? heroRes.value.items.length : 10;
      const netflixMoviesCount = netflixTop10Cache.movies.length;
      const netflixTvCount = netflixTop10Cache.tvShows.length;
      const duration = Date.now() - startTime;

      systemBatchStats = {
        lastRun: Date.now(),
        nextRun: getNextVietnamScheduleTime(),
        isRunning: false,
        heroCount,
        netflixMoviesCount,
        netflixTvCount,
        lastDurationMs: duration,
        status: "success",
      };

      // Sync batch status to RTDB
      syncToRtdb("system_cache/batch_status", systemBatchStats).catch(() => {});
      console.log(`[Batch Worker] ✅ Pre-computed Batch completed in ${duration}ms (Hero: ${heroCount}, Netflix M: ${netflixMoviesCount}, Netflix TV: ${netflixTvCount})`);
    } catch (err: any) {
      systemBatchStats.isRunning = false;
      systemBatchStats.status = `error: ${err?.message || "unknown"}`;
      console.error("[Batch Worker Error]:", err?.message);
    }

    return systemBatchStats;
  }

  function scheduleNextVietnamBatch() {
    if (batchTimerId) clearTimeout(batchTimerId);
    const nextTargetUtc = getNextVietnamScheduleTime();
    systemBatchStats.nextRun = nextTargetUtc;
    const delay = Math.max(1000, nextTargetUtc - Date.now());
    const vnTimeStr = new Date(nextTargetUtc + 7 * 3600 * 1000).toISOString().replace("T", " ").slice(0, 19);
    console.log(`[Batch Worker] ⏰ Lịch chạy tiếp theo cố định theo giờ Việt Nam (00:00 / 12:00 ICT): ${vnTimeStr} (sau ${Math.round(delay / 60000)} phút)`);

    batchTimerId = setTimeout(() => {
      runFullSystemBatch().finally(() => {
        scheduleNextVietnamBatch();
      });
    }, delay);
  }

  // Pre-seed from RTDB on startup (chỉ hydrate cache từ dữ liệu có sẵn,
  // KHÔNG chạy batch sync ở đây — batch chỉ chạy 2 mốc cố định 00:00/12:00 ICT
  // hoặc khi admin sync thủ công qua POST /api/system/batch-sync)
  setTimeout(async () => {
    try {
      // 1. Try fast-hydration from RTDB first
      const [rtdbHero, rtdbNetflix] = await Promise.all([
        fetchFromRtdb("system_cache/hero_banner"),
        fetchFromRtdb("system_cache/netflix_top10"),
      ]);
      if (rtdbHero && rtdbHero.items && rtdbHero.items.length >= 8) {
        tmdbHeroCache.set("hero:discover:vi-VN:VN:popularity.desc:v3", { data: rtdbHero, timestamp: Date.now() });
      }
      if (rtdbNetflix && rtdbNetflix.data && rtdbNetflix.data.movies && rtdbNetflix.data.movies.length >= 8) {
        netflixTop10Cache = {
          movies: rtdbNetflix.data.movies.slice(0, 10),
          tvShows: (rtdbNetflix.data.tvShows || []).slice(0, 10),
          movieTitles: rtdbNetflix.data.movieTitles || [],
          tvTitles: rtdbNetflix.data.tvTitles || [],
          lastUpdated: rtdbNetflix.data.lastUpdated || Date.now(),
        };
      }
    } catch {}

    console.log("[Batch Worker] ♻️ Đã hydrate cache từ RTDB (bỏ qua batch sync khi start server)");
  }, 2000);

  // Start fixed schedule (00:00 & 12:00 Vietnam time)
  scheduleNextVietnamBatch();

  // Admin Batch Management Endpoints
  // Admin ngắt phiên thiết bị (Prompt 4 PHẦN C): chỉ admin, xóa node slot
  // sessions/{uid}/{slot} bằng Admin SDK. Client không được tự xóa slot
  // của người khác. Thiết bị bị ngắt sẽ nhận 409 ở request kế tiếp.
  app.post("/api/admin/sessions/:uid/kick", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const targetUid = String(req.params?.uid || "");
      const slot = String(req.body?.slot || "");
      if (!targetUid || (slot !== "1" && slot !== "2")) {
        return res.status(400).json({ error: "INVALID_SLOT" });
      }
      await getAdminDatabase().ref(`sessions/${targetUid}/${slot}`).remove();
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || "Kick failed" });
    }
  });

  // ---- Quyền kiểm soát của admin (Prompt 5) ----
  // Tất cả endpoint dưới đây: requireAuth + requireAdmin. Không qua
  // requireActiveSlot (admin thao tác lên tài khoản/slot của người khác).

  // Khóa tài khoản có hiệu lực ngay: status + thu hồi mọi phiên + nhả slot.
  app.post("/api/admin/users/:uid/block", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const targetUid = String(req.params?.uid || "");
      if (!targetUid) return res.status(400).json({ error: "INVALID_UID" });
      const snap = await getAdminFirestore().doc(`accounts/${targetUid}`).get();
      if (!snap.exists) return res.status(404).json({ error: "NOT_FOUND" });
      if ((snap.data() as any)?.role === "admin") {
        return res.status(403).json({ error: "CANNOT_BLOCK_ADMIN" });
      }
      await getAdminFirestore().doc(`accounts/${targetUid}`).set(
        { status: "blocked", updatedAt: Date.now() },
        { merge: true }
      );
      bustAccountCache(targetUid);
      bustSlotCache(targetUid);
      await getAdminAuth().revokeRefreshTokens(targetUid).catch(() => {});
      await getAdminDatabase().ref(`sessions/${targetUid}`).remove().catch(() => {});
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || "Block failed" });
    }
  });

  app.post("/api/admin/users/:uid/unblock", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const targetUid = String(req.params?.uid || "");
      if (!targetUid) return res.status(400).json({ error: "INVALID_UID" });
      const snap = await getAdminFirestore().doc(`accounts/${targetUid}`).get();
      if (!snap.exists) return res.status(404).json({ error: "NOT_FOUND" });
      await getAdminFirestore().doc(`accounts/${targetUid}`).set(
        { status: "active", updatedAt: Date.now() },
        { merge: true }
      );
      bustAccountCache(targetUid);
      bustSlotCache(targetUid);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || "Unblock failed" });
    }
  });

  // Gia hạn: chưa hết hạn thì cộng dồn vào expiresAt hiện tại, hết hạn rồi
  // thì cộng từ hiện tại. Tháng lịch, xử lý tràn ngày.
  app.post("/api/admin/users/:uid/extend", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const targetUid = String(req.params?.uid || "");
      const months = Math.floor(Number(req.body?.months));
      if (!targetUid) return res.status(400).json({ error: "INVALID_UID" });
      if (!Number.isFinite(months) || months < 1 || months > 12) {
        return res.status(400).json({ error: "INVALID_MONTHS" });
      }
      const ref = getAdminFirestore().doc(`accounts/${targetUid}`);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: "NOT_FOUND" });
      const data = snap.data() as any;
      if (data?.role === "admin") {
        return res.status(400).json({ error: "ADMIN_HAS_NO_EXPIRY" });
      }
      const base = data?.expiresAt && data.expiresAt > Date.now() ? data.expiresAt : Date.now();
      const expiresAt = addCalendarMonthsMs(base, months);
      await ref.set({ expiresAt, updatedAt: Date.now() }, { merge: true });
      bustAccountCache(targetUid);
      await setExpiresClaim(targetUid, expiresAt).catch(() => {});
      return res.json({ success: true, expiresAt });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || "Extend failed" });
    }
  });

  // Đồng bộ expiresAt vào custom claim (gọi sau khi tạo tài khoản ở client).
  app.post("/api/admin/users/:uid/claims", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const targetUid = String(req.params?.uid || "");
      const hasField = req.body && Object.prototype.hasOwnProperty.call(req.body, "expiresAt");
      const expiresAt = hasField ? req.body.expiresAt : undefined;
      if (!targetUid) return res.status(400).json({ error: "INVALID_UID" });
      if (expiresAt !== null && !(typeof expiresAt === "number" && Number.isFinite(expiresAt))) {
        return res.status(400).json({ error: "INVALID_EXPIRY" });
      }
      await setExpiresClaim(targetUid, expiresAt);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || "Claims failed" });
    }
  });

  // Gán custom claim admin (Prompt 6 A1). Gọi 1 lần cho tài khoản admin hiện
  // có, và tự động cho mọi tài khoản role admin mới. Xong phải ĐĂNG XUẤT và
  // ĐĂNG NHẬP LẠI để token mới có claim (kèm getIdToken(true) ép refresh).
  app.post("/api/admin/users/:uid/set-admin", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const targetUid = String(req.params?.uid || "");
      if (!targetUid) return res.status(400).json({ error: "INVALID_UID" });
      const snap = await getAdminFirestore().doc(`accounts/${targetUid}`).get();
      if (!snap.exists) return res.status(404).json({ error: "NOT_FOUND" });
      if ((snap.data() as any)?.role !== "admin") {
        return res.status(400).json({ error: "NOT_AN_ADMIN_ACCOUNT" });
      }
      const user = await getAdminAuth().getUser(targetUid);
      const prev = (user.customClaims || {}) as Record<string, any>;
      await getAdminAuth().setCustomUserClaims(targetUid, { ...prev, admin: true });
      await getAdminAuth().revokeRefreshTokens(targetUid).catch(() => {});
      bustAccountCache(targetUid);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || "Set-admin failed" });
    }
  });

  // Admin đặt lại mật khẩu cho user + đá mọi phiên cũ.
  app.post("/api/admin/users/:uid/password", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const targetUid = String(req.params?.uid || "");
      const newPassword = String(req.body?.newPassword || "");
      if (!targetUid) return res.status(400).json({ error: "INVALID_UID" });
      if (newPassword.trim().length < 8) {
        return res.status(400).json({ error: "WEAK_PASSWORD" });
      }
      await getAdminAuth().updateUser(targetUid, { password: newPassword.trim() });
      await getAdminAuth().revokeRefreshTokens(targetUid).catch(() => {});
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || "Password reset failed" });
    }
  });

  // Xóa hẳn: RTDB sessions -> subcollections -> document -> Auth user.
  // Chặn cứng tài khoản admin.
  app.delete("/api/admin/users/:uid", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const targetUid = String(req.params?.uid || "");
      if (!targetUid) return res.status(400).json({ error: "INVALID_UID" });
      if (req.user?.uid === targetUid) {
        return res.status(403).json({ error: "CANNOT_DELETE_SELF" });
      }
      const snap = await getAdminFirestore().doc(`accounts/${targetUid}`).get();
      if (!snap.exists) return res.status(404).json({ error: "NOT_FOUND" });
      if ((snap.data() as any)?.role === "admin") {
        return res.status(403).json({ error: "CANNOT_DELETE_ADMIN" });
      }
      await getAdminDatabase().ref(`sessions/${targetUid}`).remove().catch(() => {});
      const subNames = [
        "profiles",
        "history",
        "myList",
        "savedManga",
        "mangaHistory",
        "youtubeFavorites",
        "youtubeHistory",
        "youtubeSubscriptions",
      ];
      // Xóa nested dưới từng profile trước (history, myList...) rồi mới xóa profiles.
      try {
        const profSnap = await getAdminFirestore().collection(`accounts/${targetUid}/profiles`).get();
        const nested = ["history", "myList", "savedManga", "mangaHistory", "youtubeFavorites", "youtubeHistory", "youtubeSubscriptions"];
        for (const pDoc of profSnap.docs) {
          for (const sub of nested) {
            try {
              const subSnap = await getAdminFirestore()
                .collection(`accounts/${targetUid}/profiles/${pDoc.id}/${sub}`)
                .get();
              for (const d of subSnap.docs) {
                await d.ref.delete().catch(() => {});
              }
            } catch {
              // ignore
            }
          }
          await pDoc.ref.delete().catch(() => {});
        }
      } catch {
        // ignore
      }
      // Xóa subcollection trực tiếp còn sót (tương thích dữ liệu cũ)
      for (const sub of subNames) {
        if (sub === "profiles") continue;
        try {
          const subSnap = await getAdminFirestore().collection(`accounts/${targetUid}/${sub}`).get();
          for (const d of subSnap.docs) {
            await d.ref.delete().catch(() => {});
          }
        } catch {
          // ignore
        }
      }
      await getAdminFirestore().doc(`accounts/${targetUid}`).delete().catch(() => {});
      bustAccountCache(targetUid);
      await getAdminAuth().deleteUser(targetUid).catch(() => {});
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || "Delete failed" });
    }
  });

  app.post("/api/system/batch-sync", requireAuth, requireActiveSlot, requireAdmin, async (req, res) => {
    try {
      const stats = await runFullSystemBatch(true);
      return res.json({ success: true, message: "Đã kích hoạt đồng bộ dữ liệu Batch & RTDB thành công", stats });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || "Batch sync failed" });
    }
  });

  app.get("/api/system/batch-status", requireAuth, requireActiveSlot, (req, res) => {
    return res.json({
      success: true,
      stats: systemBatchStats,
      cache: {
        heroCached: tmdbHeroCache.get("hero:discover:vi-VN:VN:popularity.desc:v3")?.data?.items?.length || 0,
        netflixMovies: netflixTop10Cache.movies.length,
        netflixTvShows: netflixTop10Cache.tvShows.length,
        netflixLastUpdated: netflixTop10Cache.lastUpdated,
      }
    });
  });

  // Prompt 7 PHẦN B1: phiên bản app cho bản native — PUBLIC (chưa login vẫn
  // phải check được, và client dùng nó làm probe kết nối lúc khởi động).
  // Đọc từ ENV (đổi là restart backend, không tốn Firestore reads):
  //   APP_LATEST_VERSION_CODE (mặc định 1 = versionCode hiện tại trong
  //     android/app/build.gradle -> chưa có gì để báo),
  //   APP_LATEST_VERSION_NAME, APP_MIN_SUPPORTED_VERSION_CODE,
  //   APP_APK_URL (fallback link GitHub Releases như client).
  app.get("/api/app/version", (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=300');
    const latestVersionCode = Math.max(1, parseInt(process.env.APP_LATEST_VERSION_CODE || '1', 10) || 1);
    const minSupportedVersionCode = Math.max(1, parseInt(process.env.APP_MIN_SUPPORTED_VERSION_CODE || '1', 10) || 1);
    return res.json({
      latestVersionCode,
      latestVersionName: (process.env.APP_LATEST_VERSION_NAME || '1.0').trim() || '1.0',
      minSupportedVersionCode,
      apkUrl: (process.env.APP_APK_URL || '').trim() || 'https://github.com/mizuha2020/qtb-movie/releases/download/tv-apk/app-debug.apk',
      releaseNotes: (process.env.APP_RELEASE_NOTES || '').trim(),
    });
  });

  // Admin Hero Banner Assets Listing & Selection
  app.get("/api/hero/admin/list", requireAuth, requireActiveSlot, requireAdmin, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    try {
      const cacheKey = "hero:discover:vi-VN:VN:popularity.desc:v3";
      let payload = await fetchFromRtdb("system_cache/hero_banner");
      if (!payload || !payload.items || payload.items.length === 0) {
        payload = tmdbHeroCache.get(cacheKey)?.data;
      }
      if (!payload || !payload.items) {
        return res.json({ success: true, items: [] });
      }
      return res.json({
        success: true,
        items: payload.items,
        total: payload.items.length,
        lastUpdated: payload.lastUpdated,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || "Failed to fetch hero items" });
    }
  });

  app.post("/api/hero/select-asset", requireAuth, requireActiveSlot, requireAdmin, async (req, res) => {
    try {
      const { slug, assetType, selectedUrl } = req.body || {};
      if (!slug || !selectedUrl || (assetType !== "backdrop" && assetType !== "logo")) {
        return res.status(400).json({ success: false, error: "Thiếu thông tin slug, assetType ('backdrop' | 'logo') hoặc selectedUrl" });
      }

      const cacheKey = "hero:discover:vi-VN:VN:popularity.desc:v3";
      let payload = tmdbHeroCache.get(cacheKey)?.data;
      if (!payload || !payload.items) {
        payload = await fetchFromRtdb("system_cache/hero_banner");
      }

      if (!payload || !payload.items) {
        return res.status(404).json({ success: false, error: "Không tìm thấy dữ liệu hero banner" });
      }

      const targetMovie = payload.items.find((m: any) => m.slug === slug);
      if (!targetMovie) {
        return res.status(404).json({ success: false, error: `Không tìm thấy phim có slug: ${slug}` });
      }

      if (assetType === "backdrop") {
        targetMovie.backdrop_url = selectedUrl;
        if (Array.isArray(targetMovie.backdrops)) {
          let found = false;
          targetMovie.backdrops = targetMovie.backdrops.map((b: any) => {
            const isMatch = b.url === selectedUrl;
            if (isMatch) found = true;
            return { ...b, primary: isMatch };
          });
          if (!found) {
            targetMovie.backdrops.unshift({ url: selectedUrl, primary: true });
          }
        } else {
          targetMovie.backdrops = [{ url: selectedUrl, primary: true }];
        }
      } else if (assetType === "logo") {
        targetMovie.logo_url = selectedUrl;
        if (Array.isArray(targetMovie.logos)) {
          let found = false;
          targetMovie.logos = targetMovie.logos.map((l: any) => {
            const isMatch = l.url === selectedUrl;
            if (isMatch) found = true;
            return { ...l, primary: isMatch };
          });
          if (!found) {
            targetMovie.logos.unshift({ url: selectedUrl, primary: true });
          }
        } else {
          targetMovie.logos = [{ url: selectedUrl, primary: true }];
        }
      }

      payload.lastUpdated = Date.now();
      tmdbHeroCache.set(cacheKey, { data: payload, timestamp: Date.now() });
      syncToRtdb("system_cache/hero_banner", payload).catch(() => {});

      // Persist to permanent movie overrides so subsequent data scrapers / batch jobs never overwrite this config
      await saveMovieOverride(slug, {
        slug,
        name: targetMovie.name,
        logo_url: targetMovie.logo_url,
        backdrop_url: targetMovie.backdrop_url,
        logos: targetMovie.logos,
        backdrops: targetMovie.backdrops,
      });

      // Also update Netflix Top 10 cache if this movie is in Netflix Top 10
      let netflixUpdated = false;
      if (netflixTop10Cache.movies) {
        netflixTop10Cache.movies = netflixTop10Cache.movies.map((m: any) => {
          if (m.slug === slug) {
            netflixUpdated = true;
            return mergeMovieOverrides(m, targetMovie);
          }
          return m;
        });
      }
      if (netflixTop10Cache.tvShows) {
        netflixTop10Cache.tvShows = netflixTop10Cache.tvShows.map((m: any) => {
          if (m.slug === slug) {
            netflixUpdated = true;
            return mergeMovieOverrides(m, targetMovie);
          }
          return m;
        });
      }
      if (netflixUpdated) {
        syncToRtdb("system_cache/netflix_top10", {
          status: true,
          data: {
            movies: netflixTop10Cache.movies,
            tvShows: netflixTop10Cache.tvShows,
            movieTitles: netflixTop10Cache.movieTitles,
            tvTitles: netflixTop10Cache.tvTitles,
            lastUpdated: Date.now(),
          }
        }).catch(() => {});
      }

      return res.json({
        success: true,
        message: `Đã đặt ${assetType === "backdrop" ? "Backdrop" : "Logo"} chính thành công cho phim ${targetMovie.name}`,
        movie: targetMovie,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || "Lỗi khi cập nhật ảnh hero" });
    }
  });

  app.get("/api/top10/netflix-vn", requireAuth, requireActiveSlot, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const force = req.query.refresh === '1' || req.query.force === '1';
    // If force or cache is empty, try reading directly from RTDB first
    if (force || !netflixTop10Cache.movies.length) {
      try {
        const rtdbNetflix = await fetchFromRtdb("system_cache/netflix_top10");
        if (rtdbNetflix?.data?.movies?.length) {
          netflixTop10Cache = {
            movies: rtdbNetflix.data.movies.slice(0, 10),
            tvShows: (rtdbNetflix.data.tvShows || []).slice(0, 10),
            movieTitles: rtdbNetflix.data.movieTitles || [],
            tvTitles: rtdbNetflix.data.tvTitles || [],
            lastUpdated: rtdbNetflix.data.lastUpdated || Date.now(),
          };
        }
      } catch {}
      updateNetflixTop10Cache().catch(() => {});
    }
    return res.json({
      status: true,
      data: {
        movies: netflixTop10Cache.movies.slice(0, 10),
        tvShows: netflixTop10Cache.tvShows.slice(0, 10),
        movieTitles: netflixTop10Cache.movieTitles,
        tvTitles: netflixTop10Cache.tvTitles,
        lastUpdated: netflixTop10Cache.lastUpdated,
      },
    });
  });

  // --- TRUYENQQ MANGA PROXY & SCRAPER ENGINE ---
  const TRUYENQQ_MIRRORS = [
    "https://truyenqqko.com",
    "https://truyenqqno.com",
    "https://truyenqqgo.com",
    "https://truyenqqto.com",
    "https://truyenqqviet.com"
  ];

  async function fetchWithDomainFallback(pathBuilder: (base: string) => string, options: { method?: string; body?: any; isPost?: boolean } = {}) {
    let lastError: any = null;
    for (const base of TRUYENQQ_MIRRORS) {
      try {
        const url = pathBuilder(base);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4500);
        const headers: Record<string, string> = {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Referer": `${base}/`,
        };
        if (options.isPost) {
          headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8";
          headers["X-Requested-With"] = "XMLHttpRequest";
        }
        const res = await fetch(url, {
          method: options.method || (options.isPost ? "POST" : "GET"),
          headers,
          body: options.body,
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (res.ok) {
          const html = await res.text();
          // Validate real TruyenQQ content
          if (html && html.length > 50 && (
            html.includes("truyen-tranh") ||
            html.includes("book_avatar") ||
            html.includes("search_avatar") ||
            html.includes("search_info") ||
            html.includes("list_grid") ||
            html.includes("works-chapter-item") ||
            html.includes("page-chapter") ||
            html.includes("ItemList")
          )) {
            return { html, base };
          }
        }
      } catch (err: any) {
        lastError = err;
      }
    }
    throw lastError || new Error("All TruyenQQ mirrors failed");
  }

  function cleanTruyenqqCoverUrl(url: string): string {
    if (!url) return "";
    let u = url.trim();
    if (u.startsWith("//")) u = "https:" + u;
    if (u.startsWith("http://")) u = "https://" + u.slice(7);

    // Replace dead tintruyen domains with working i.hinhhinh.com
    u = u.replace(/(\d+\.)?tintruyen\.(net|com)/gi, "i.hinhhinh.com");

    // Replace double slashes in paths e.g. https://domain.com//file.jpg -> https://domain.com/file.jpg
    u = u.replace(/(https?:\/\/[^\/]+)\/\/+/g, "$1/");

    // Upgrade resolution to high-res 190x247
    u = u.replace(/F80x105/gi, "190x247");
    u = u.replace(/F190x247/gi, "190x247");
    u = u.replace(/F\d+x\d+/gi, "190x247");
    u = u.replace(/\/ebook\/F?\d+x\d+\//gi, "/ebook/190x247/");
    u = u.replace(/\/thumb\/F?\d+x\d+\//gi, "/thumb/190x247/");
    u = u.replace(/[-_]F?80x105\./gi, "-190x247.").replace(/[-_]F?90x\d+\./gi, "-190x247.");
    u = u.replace(/80x105/gi, "190x247");

    return u;
  }

  function extractTruyenqqCoverUrl(block: string): string {
    if (!block) return "";

    // 1. Check primary src attribute first
    const srcMatch = block.match(/<img[^>]*src="([^"]+)"/i);
    if (srcMatch && srcMatch[1]) {
      const s = srcMatch[1].trim();
      if (!s.includes("lazy.gif") && !s.includes("no_image") && !s.includes("logo") && !s.includes("icon")) {
        return cleanTruyenqqCoverUrl(s);
      }
    }

    // 2. Check data-original (lazy loading attribute)
    const origMatch = block.match(/data-original="([^"]+)"/i);
    if (origMatch && origMatch[1]) {
      const s = origMatch[1].trim();
      if (!s.includes("lazy.gif") && !s.includes("no_image") && !s.includes("logo")) {
        return cleanTruyenqqCoverUrl(s);
      }
    }

    // 3. Check data-src
    const dataSrcMatch = block.match(/data-src="([^"]+)"/i);
    if (dataSrcMatch && dataSrcMatch[1]) {
      const s = dataSrcMatch[1].trim();
      if (!s.includes("lazy.gif") && !s.includes("no_image") && !s.includes("logo")) {
        return cleanTruyenqqCoverUrl(s);
      }
    }

    // 4. Fallback: check any valid src attribute in block
    const srcMatches = [...block.matchAll(/src="([^"]+)"/gi)];
    for (const m of srcMatches) {
      const s = m[1]?.trim();
      if (s && !s.includes("lazy.gif") && !s.includes("no_image") && !s.includes("logo") && !s.includes("icon")) {
        return cleanTruyenqqCoverUrl(s);
      }
    }

    return "";
  }

  async function scrapeTruyenqqList(page = 1) {
    const { html } = await fetchWithDomainFallback((base) => `${base}/truyen-moi-cap-nhat/trang-${page}`);

    // Extract total pages
    const pageMatches = [...html.matchAll(/\/trang-(\d+)/g)];
    let maxPage = 1;
    for (const pm of pageMatches) {
      const p = parseInt(pm[1], 10);
      if (p > maxPage && p < 10000) maxPage = p;
    }

    const items: any[] = [];
    const listGridMatch = html.match(/<ul class="list_grid[^"]*">([\s\S]*?)<\/ul>/i) || html.match(/<div class="list_grid[^"]*">([\s\S]*?)<\/div>/i);
    const container = listGridMatch ? listGridMatch[0] : html;
    const liBlocks = container.match(/<li[^>]*>[\s\S]*?<\/li>/gi) || [];

    for (const block of liBlocks) {
      const slugMatch = block.match(/href="[^"]*\/truyen-tranh\/([^"]+)"/i);
      const titleMatch = block.match(/<h3[^>]*><a[^>]*title="([^"]+)"/i) || block.match(/<h3[^>]*><a[^>]*>([^<]+)<\/a>/i) || block.match(/alt="([^"]+)"/i) || block.match(/<p class="name">([^<]+)<\/p>/i);
      const rawCover = extractTruyenqqCoverUrl(block);
      const lastChapMatch = block.match(/class="last_chapter"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i);
      const descMatch = block.match(/class="excerpt"[^>]*>([\s\S]*?)<\/div>/i);
      const statusMatch = block.match(/Tình trạng:\s*([^<]+)<\/p>/i);
      const otherTitleMatch = block.match(/Tên khác:\s*([^<]+)<\/div>/i);

      if (slugMatch && titleMatch) {
        const slug = slugMatch[1].replace(/^\/|\/$/g, "");
        const title = titleMatch[1].trim();
        const coverUrl = cleanTruyenqqCoverUrl(rawCover);
        const lastChapter = lastChapMatch ? lastChapMatch[1].trim() : "";
        const description = descMatch ? descMatch[1].trim() : "";
        const status = statusMatch ? statusMatch[1].trim() : "Đang cập nhật";
        const altTitles = otherTitleMatch ? otherTitleMatch[1].split(";").map((s) => s.trim()) : [];

        items.push({
          id: slug,
          slug,
          title,
          coverUrl,
          lastChapter,
          description,
          status,
          altTitles,
          source: "truyenqq",
          chapters: [],
        });
      }
    }

    return { items, totalPages: maxPage };
  }

  async function scrapeTruyenqqSearch(keyword: string) {
    const items: any[] = [];
    const cleanKw = keyword.trim();
    if (!cleanKw) return { items: [], totalPages: 1 };

    // 1. Primary: POST /frontend/search/search (Instant official Ajax search API of TruyenQQ)
    try {
      const formData = new URLSearchParams();
      formData.append("search", cleanKw);
      formData.append("type", "0");

      const { html } = await fetchWithDomainFallback(
        (base) => `${base}/frontend/search/search`,
        { isPost: true, body: formData.toString() }
      );

      if (html) {
        const liBlocks = html.match(/<li>[\s\S]*?<\/li>/gi) || [];
        for (const block of liBlocks) {
          const slugMatch = block.match(/href="[^"]*\/truyen-tranh\/([^"]+)"/i);
          const titleMatch = block.match(/<p class="name">([^<]+)<\/p>/i) || block.match(/<h3[^>]*>([^<]+)<\/h3>/i) || block.match(/alt="([^"]+)"/i);
          const altMatch = block.match(/<p class="name_other">([^<]+)<\/p>/i);
          const rawCover = extractTruyenqqCoverUrl(block);

          if (slugMatch && titleMatch) {
            const slug = slugMatch[1].replace(/^\/|\/$/g, "");
            const title = titleMatch[1].trim();
            const altTitles = altMatch ? altMatch[1].split(";").map((s) => s.trim()) : [];
            const coverUrl = cleanTruyenqqCoverUrl(rawCover);

            let lastChapter = "";
            if (block.includes("Chương") || block.includes("Chapter") || block.includes("Chap")) {
              const chm = block.match(/<p>(Chương\s*[\d.]+|Chapter\s*[\d.]+|Chap\s*[\d.]+)<\/p>/i) || block.match(/(?:Chương|Chapter|Chap)\s*[\d.]+/i);
              if (chm) lastChapter = Array.isArray(chm) ? (chm[1] || chm[0]) : String(chm);
            }

            items.push({
              id: slug,
              slug,
              title,
              altTitles,
              coverUrl,
              lastChapter,
              source: "truyenqq",
              chapters: [],
            });
          }
        }
        if (items.length > 0) return { items, totalPages: 1 };
      }
    } catch (e: any) {
      console.warn("TruyenQQ POST search failed:", e?.message);
    }

    return { items, totalPages: 1 };
  }

  async function scrapeTruyenqqDetail(slug: string) {
    const cleanSlug = slug.replace(/^https?:\/\/[^/]+\/truyen-tranh\//i, "").replace(/^\/|\/$/g, "");
    const { html, base } = await fetchWithDomainFallback((b) => `${b}/truyen-tranh/${cleanSlug}`);

    const titleMatch = html.match(/<h1[^>]*itemprop="name"[^>]*>([^<]+)<\/h1>/i) || html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    const title = titleMatch ? titleMatch[1].trim() : "Truyện Tranh";

    const rawCover = extractTruyenqqCoverUrl(html);
    const coverUrl = cleanTruyenqqCoverUrl(rawCover);

    const altMatch = html.match(/<li class="othername[^>]*>[\s\S]*?<p class="other-name[^>]*>([^<]+)<\/p>/i);
    const altTitles = altMatch ? altMatch[1].split(";").map((s) => s.trim()) : [];

    const authorMatch = html.match(/<li class="author[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i);
    const authors = authorMatch ? [authorMatch[1].trim()] : [];

    const statusMatch = html.match(/<li class="status[^>]*>[\s\S]*?<p class="col-xs-9">([^<]+)<\/p>/i);
    const status = statusMatch ? statusMatch[1].trim() : "Đang cập nhật";

    const genreMatches = [...html.matchAll(/<ul class="list01">[\s\S]*?<\/ul>/gi)];
    let genres: string[] = [];
    if (genreMatches.length > 0) {
      const gList = [...genreMatches[0][0].matchAll(/<a[^>]*>([^<]+)<\/a>/gi)];
      genres = gList.map((g) => g[1].trim());
    }

    const descMatch = html.match(/<div class="story-detail-info[^>]*>([\s\S]*?)<\/div>/i) || html.match(/<p class="listing-excerpt">([\s\S]*?)<\/p>/i);
    const description = descMatch ? descMatch[1].replace(/<[^>]+>/g, "").trim() : "";

    const chapters: any[] = [];
    const chapBlocks = [...html.matchAll(/<div class="works-chapter-item">[\s\S]*?<a[^>]*href="([^"]*\/truyen-tranh\/([^"]+))"[^>]*>([^<]+)<\/a>/gi)];

    for (const cb of chapBlocks) {
      const chapSlug = cb[2].replace(/^\/|\/$/g, "");
      const chapTitle = cb[3].trim();
      const numMatch = chapTitle.match(/(?:Chương|Chapter|Chap)\s*([\d.]+)/i) || chapSlug.match(/chap-([\d.]+)/i);
      const chapterNumber = numMatch ? numMatch[1] : chapTitle;

      chapters.push({
        id: chapSlug,
        slug: chapSlug,
        title: chapTitle,
        chapterNumber,
        source: "truyenqq",
        chapterApiUrl: `${base}/truyen-tranh/${chapSlug}`,
      });
    }

    return {
      id: cleanSlug,
      slug: cleanSlug,
      title,
      altTitles,
      coverUrl,
      description,
      status,
      authors,
      genres,
      chapters,
      source: "truyenqq",
    };
  }

  async function scrapeTruyenqqChapter(chapSlug: string) {
    const cleanChapSlug = chapSlug.replace(/^https?:\/\/[^/]+\/truyen-tranh\//i, "").replace(/^\/|\/$/g, "");
    const { html } = await fetchWithDomainFallback((b) => `${b}/truyen-tranh/${cleanChapSlug}`);

    const pages: string[] = [];
    const imgMatches = [...html.matchAll(/<img[^>]*class="[^"]*lazy[^"]*"[^>]*data-original="([^"]+)"/gi)]
      .concat([...html.matchAll(/<img[^>]*data-original="([^"]+)"/gi)])
      .concat([...html.matchAll(/<div class="page-chapter"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"/gi)]);

    for (const m of imgMatches) {
      const src = m[1];
      if (src && !src.includes("lazy.gif") && !src.includes("logo") && !pages.includes(src)) {
        pages.push(src);
      }
    }

    return pages;
  }

  // TruyenQQ API Endpoints with Automatic Backup Failover to OTruyen
  app.get("/api/proxy/truyenqq/list", requireAuth, requireActiveSlot, async (req, res) => {
    const page = parseInt(String(req.query.page || "1"), 10) || 1;
    const cacheKey = `truyenqq:list:page:${page}`;
    const cached = proxyCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return res.json(cached.data);
    }

    try {
      const data = await scrapeTruyenqqList(page);
      if (data && Array.isArray(data.items) && data.items.length > 0) {
        proxyCache.set(cacheKey, { data, timestamp: Date.now() });
        return res.json(data);
      }
    } catch (err: any) {
      console.warn("TruyenQQ list scraper warning:", err.message);
    }

    // Fallback to OTruyen if TruyenQQ scraper is blocked on Cloud Run
    try {
      const otRes = await fetch(`https://otruyenapi.com/v1/api/danh-sach/truyen-moi?page=${page}`, {
        headers: { "User-Agent": "Mozilla/5.0" }
      });
      if (otRes.ok) {
        const otData = await otRes.json();
        const rawItems = otData.data?.items || [];
        const domainCdn = otData.data?.domain_cdn || "https://otruyenapi.com/uploads/comics";
        const items = rawItems.map((item: any) => ({
          id: item.slug || item._id,
          slug: item.slug,
          title: item.name,
          coverUrl: item.thumb_url ? (item.thumb_url.startsWith("http") ? item.thumb_url : `${domainCdn}/${item.thumb_url}`) : "",
          status: item.status || "Đang cập nhật",
          source: "truyenqq",
          chapters: []
        }));
        const totalItems = otData.data?.params?.pagination?.totalItems || rawItems.length * 16;
        const totalPages = Math.max(1, Math.ceil(totalItems / 24));
        const payload = { items, totalPages, isFallback: true, fallbackSource: "otruyen" };
        proxyCache.set(cacheKey, { data: payload, timestamp: Date.now() });
        return res.json(payload);
      }
    } catch (e) {}

    if (cached) return res.json(cached.data);
    return res.json({ items: [], totalPages: 1 });
  });

  app.get("/api/proxy/truyenqq/search", requireAuth, requireActiveSlot, async (req, res) => {
    const query = String(req.query.q || req.query.keyword || "").trim();
    if (!query) {
      return res.json({ items: [], totalPages: 1 });
    }

    const cacheKey = `truyenqq:search:${query.toLowerCase()}`;
    const cached = proxyCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return res.json(cached.data);
    }

    try {
      const data = await scrapeTruyenqqSearch(query);
      if (data && Array.isArray(data.items) && data.items.length > 0) {
        proxyCache.set(cacheKey, { data, timestamp: Date.now() });
        return res.json(data);
      }
    } catch (err: any) {
      console.warn("TruyenQQ search scraper warning:", err.message);
    }

    // Search Fallback to OTruyen
    try {
      const otRes = await fetch(`https://otruyenapi.com/v1/api/tim-kiem?keyword=${encodeURIComponent(query)}&page=1`, {
        headers: { "User-Agent": "Mozilla/5.0" }
      });
      if (otRes.ok) {
        const otData = await otRes.json();
        const rawItems = otData.data?.items || [];
        const domainCdn = otData.data?.domain_cdn || "https://otruyenapi.com/uploads/comics";
        const items = rawItems.map((item: any) => ({
          id: item.slug || item._id,
          slug: item.slug,
          title: item.name,
          coverUrl: item.thumb_url ? (item.thumb_url.startsWith("http") ? item.thumb_url : `${domainCdn}/${item.thumb_url}`) : "",
          source: "truyenqq",
          chapters: []
        }));
        const payload = { items, totalPages: 1, isFallback: true, fallbackSource: "otruyen" };
        proxyCache.set(cacheKey, { data: payload, timestamp: Date.now() });
        return res.json(payload);
      }
    } catch (e) {}

    if (cached) return res.json(cached.data);
    return res.json({ items: [], totalPages: 1 });
  });

  app.get("/api/proxy/truyenqq/detail", requireAuth, requireActiveSlot, async (req, res) => {
    const slug = String(req.query.slug || req.query.id || "").trim();
    if (!slug) {
      return res.status(400).json({ error: "Missing manga slug/id" });
    }

    const cacheKey = `truyenqq:detail:${slug}`;
    const cached = proxyCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return res.json(cached.data);
    }

    // 1. Primary: Try TruyenQQ Scraper
    try {
      const data = await scrapeTruyenqqDetail(slug);
      if (data && data.title && data.chapters && data.chapters.length > 0) {
        proxyCache.set(cacheKey, { data, timestamp: Date.now() });
        return res.json(data);
      }
    } catch (err: any) {
      console.warn("TruyenQQ detail scraper warning:", err.message);
    }

    // Clean slug for fallback lookup (e.g., 'hay-khoc-va-cau-nguyen-di-15780' -> 'hay-khoc-va-cau-nguyen-di')
    const cleanSlug = slug.replace(/-\d+$/, "").replace(/^https?:\/\/[^/]+\/truyen-tranh\//i, "").replace(/^\/|\/$/g, "");
    const slugsToTry = Array.from(new Set([slug, cleanSlug]));

    // 2. Secondary: Try OTruyen direct slug lookup
    for (const s of slugsToTry) {
      try {
        const otRes = await fetch(`https://otruyenapi.com/v1/api/truyen-tranh/${encodeURIComponent(s)}`, {
          headers: { "User-Agent": "Mozilla/5.0" }
        });
        if (otRes.ok) {
          const otData = await otRes.json();
          const item = otData.data?.item;
          if (item) {
            const domainCdn = otData.data?.domain_cdn || "https://otruyenapi.com/uploads/comics";
            const coverUrl = item.thumb_url ? (item.thumb_url.startsWith("http") ? item.thumb_url : `${domainCdn}/${item.thumb_url}`) : "";
            const rawChapters = item.chapters?.[0]?.server_data || [];
            const chapters = rawChapters.map((ch: any) => ({
              id: ch.chapter_api_data || ch.chapter_name,
              chapterNumber: ch.chapter_name,
              title: `Chapter ${ch.chapter_name}${ch.chapter_title ? `: ${ch.chapter_title}` : ''}`,
              source: "truyenqq",
              chapterApiUrl: ch.chapter_api_data
            }));
            if (chapters.length > 0) {
              const payload = {
                id: slug,
                slug,
                title: item.name,
                altTitles: item.origin_name ? [item.origin_name] : [],
                coverUrl,
                description: item.content,
                status: item.status,
                authors: item.author || [],
                genres: item.category?.map((c: any) => c.name) || [],
                chapters,
                source: "truyenqq"
              };
              proxyCache.set(cacheKey, { data: payload, timestamp: Date.now() });
              return res.json(payload);
            }
          }
        }
      } catch (e) {}
    }

    // 3. Tertiary: Search OTruyen by title keyword
    try {
      const keyword = cleanSlug.replace(/-/g, " ");
      const searchRes = await fetch(`https://otruyenapi.com/v1/api/tim-kiem?keyword=${encodeURIComponent(keyword)}&page=1`, {
        headers: { "User-Agent": "Mozilla/5.0" }
      });
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const matchedItem = searchData.data?.items?.[0];
        if (matchedItem && matchedItem.slug) {
          const otRes = await fetch(`https://otruyenapi.com/v1/api/truyen-tranh/${encodeURIComponent(matchedItem.slug)}`, {
            headers: { "User-Agent": "Mozilla/5.0" }
          });
          if (otRes.ok) {
            const otData = await otRes.json();
            const item = otData.data?.item;
            if (item) {
              const domainCdn = otData.data?.domain_cdn || "https://otruyenapi.com/uploads/comics";
              const coverUrl = item.thumb_url ? (item.thumb_url.startsWith("http") ? item.thumb_url : `${domainCdn}/${item.thumb_url}`) : "";
              const rawChapters = item.chapters?.[0]?.server_data || [];
              const chapters = rawChapters.map((ch: any) => ({
                id: ch.chapter_api_data || ch.chapter_name,
                chapterNumber: ch.chapter_name,
                title: `Chapter ${ch.chapter_name}${ch.chapter_title ? `: ${ch.chapter_title}` : ''}`,
                source: "truyenqq",
                chapterApiUrl: ch.chapter_api_data
              }));
              if (chapters.length > 0) {
                const payload = {
                  id: slug,
                  slug,
                  title: item.name || matchedItem.name,
                  altTitles: item.origin_name ? [item.origin_name] : [],
                  coverUrl,
                  description: item.content,
                  status: item.status,
                  authors: item.author || [],
                  genres: item.category?.map((c: any) => c.name) || [],
                  chapters,
                  source: "truyenqq"
                };
                proxyCache.set(cacheKey, { data: payload, timestamp: Date.now() });
                return res.json(payload);
              }
            }
          }
        }
      }
    } catch (e) {}

    // 4. Quaternary: Search CuuTruyen by title keyword
    try {
      const keyword = cleanSlug.replace(/-/g, " ");
      const ctSearchRes = await fetch(`https://cuutruyen.net/api/v2/mangas/recently_updated?query=${encodeURIComponent(keyword)}`, {
        headers: { "User-Agent": "Mozilla/5.0" }
      });
      if (ctSearchRes.ok) {
        const ctSearchData = await ctSearchRes.json();
        const rawManga = ctSearchData.data?.[0];
        if (rawManga && rawManga.id) {
          const chapRes = await fetch(`https://cuutruyen.net/api/v2/mangas/${rawManga.id}/chapters`, {
            headers: { "User-Agent": "Mozilla/5.0" }
          });
          if (chapRes.ok) {
            const chapData = await chapRes.json();
            const rawChaps = chapData.data || [];
            const chapters = rawChaps.map((ch: any) => ({
              id: String(ch.id),
              chapterNumber: String(ch.number || ch.name || "1"),
              title: ch.name ? `Chapter ${ch.number || ch.name}: ${ch.name}` : `Chapter ${ch.number || "1"}`,
              source: "cuutruyen"
            }));
            if (chapters.length > 0) {
              const payload = {
                id: slug,
                slug,
                title: rawManga.name,
                altTitles: [],
                coverUrl: rawManga.cover_url || rawManga.cover_mobile_url || "",
                description: rawManga.description || "",
                status: rawManga.status || "Đang cập nhật",
                authors: [],
                genres: [],
                chapters,
                source: "truyenqq"
              };
              proxyCache.set(cacheKey, { data: payload, timestamp: Date.now() });
              return res.json(payload);
            }
          }
        }
      }
    } catch (e) {}

    if (cached) return res.json(cached.data);
    return res.status(404).json({ error: "Manga detail not found" });
  });

  app.get("/api/proxy/truyenqq/chapter", requireAuth, requireActiveSlot, async (req, res) => {
    const slug = String(req.query.slug || req.query.url || req.query.id || "").trim();
    if (!slug) {
      return res.status(400).json({ error: "Missing chapter slug/url" });
    }

    const cacheKey = `truyenqq:chapter:${slug}`;
    const cached = proxyCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return res.json(cached.data);
    }

    try {
      const pages = await scrapeTruyenqqChapter(slug);
      if (pages.length > 0) {
        const data = { pages };
        proxyCache.set(cacheKey, { data, timestamp: Date.now() });
        return res.json(data);
      }
    } catch (err: any) {
      console.warn("TruyenQQ chapter error:", err.message);
    }

    // Chapter pages fallback to OTruyen API if slug is an OTruyen chapter API URL
    if (slug.includes("otruyenapi.com") || slug.startsWith("http")) {
      try {
        const otRes = await fetch(slug, { headers: { "User-Agent": "Mozilla/5.0" } });
        if (otRes.ok) {
          const otData = await otRes.json();
          if (otData.status === "success" && otData.data?.item) {
            const domainCdn = otData.data.domain_cdn || "https://otruyenapi.com/uploads/comics";
            const chapterPath = otData.data.item.chapter_path;
            const images = otData.data.item.chapter_image || [];
            const pages = images.map((img: any) => `/api/proxy/image?url=${encodeURIComponent(`${domainCdn}/${chapterPath}/${img.image_file}`)}`);
            const payload = { pages };
            proxyCache.set(cacheKey, { data: payload, timestamp: Date.now() });
            return res.json(payload);
          }
        }
      } catch (e) {}
    }

    if (cached) return res.json(cached.data);
    return res.json({ pages: [] });
  });

  // MangaDex Proxy Endpoint (Bypasses CORS and rate limits with backend caching)
  app.get("/api/proxy/mangadex/*", requireAuth, requireActiveSlot, async (req, res) => {
    const rawEndpoint = req.params[0] || "";
    const cleanEndpoint = rawEndpoint.split("?")[0];
    const rawQuery = req.url.includes("?") ? req.url.substring(req.url.indexOf("?") + 1) : "";
    const targetUrl = `https://api.mangadex.org/${cleanEndpoint}${rawQuery ? `?${rawQuery}` : ""}`;
    const cacheKey = `mangadex:${cleanEndpoint}?${rawQuery}`;

    const cached = proxyCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return res.json(cached.data);
    }

    try {
      const data = await fetchWithTimeout(targetUrl, 15000);
      proxyCache.set(cacheKey, { data, timestamp: Date.now() });
      return res.json(data);
    } catch (err: any) {
      console.warn(`[MangaDex Proxy Warning] ${targetUrl}:`, err.message);
      if (cached) return res.json(cached.data);
      return res.status(502).json({ error: err.message });
    }
  });

  // OTruyen Proxy Endpoint
  app.get("/api/proxy/otruyen/*", requireAuth, requireActiveSlot, async (req, res) => {
    const rawEndpoint = req.params[0] || "";
    const cleanEndpoint = rawEndpoint.split("?")[0];
    const rawQuery = req.url.includes("?") ? req.url.substring(req.url.indexOf("?") + 1) : "";
    const targetUrl = `https://otruyenapi.com/v1/api/${cleanEndpoint}${rawQuery ? `?${rawQuery}` : ""}`;
    const cacheKey = `otruyen:${cleanEndpoint}?${rawQuery}`;

    const cached = proxyCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return res.json(cached.data);
    }

    try {
      const data = await fetchWithTimeout(targetUrl, 10000);
      proxyCache.set(cacheKey, { data, timestamp: Date.now() });
      return res.json(data);
    } catch (err: any) {
      console.warn(`[OTruyen Proxy Warning] ${targetUrl}:`, err.message);
      if (cached) return res.json(cached.data);
      return res.status(502).json({ error: err.message });
    }
  });

  // CuuTruyen Proxy Endpoint (v2)
  app.get("/api/proxy/cuutruyen/*", requireAuth, requireActiveSlot, async (req, res) => {
    let rawEndpoint = req.params[0] || "";
    let cleanEndpoint = rawEndpoint.split("?")[0];
    if (cleanEndpoint === "mangas" || cleanEndpoint === "mangas/") {
      cleanEndpoint = "mangas/recently_updated";
    }
    const rawQuery = req.url.includes("?") ? req.url.substring(req.url.indexOf("?") + 1) : "";
    const targetUrl = `https://cuutruyen.net/api/v2/${cleanEndpoint}${rawQuery ? `?${rawQuery}` : ""}`;
    const cacheKey = `cuutruyen:${cleanEndpoint}?${rawQuery}`;

    const cached = proxyCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return res.json(cached.data);
    }

    try {
      const data = await fetchWithTimeout(targetUrl, 10000);
      proxyCache.set(cacheKey, { data, timestamp: Date.now() });
      return res.json(data);
    } catch (err: any) {
      console.warn(`[CuuTruyen Proxy Warning] ${targetUrl}:`, err.message);
      if (cached) return res.json(cached.data);
      return res.status(502).json({ error: err.message });
    }
  });

  // 6. Default General Proxy with resilient multi-source failover and caching
  app.get("/api/proxy/movie/*", requireAuth, requireActiveSlot, async (req, res) => {
    const endpoint = req.params[0];
    const query = new URLSearchParams(req.query as Record<string, string>).toString();
    const cacheKey = `movie:${endpoint}?${query}`;

    // 1. Check in-memory cache
    const cached = proxyCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return res.json(cached.data);
    }

    // List of mirror providers to attempt in order
    const upstreamUrls: string[] = [
      `https://ophim1.com/${endpoint}${query ? `?${query}` : ""}`,
      `https://phimapi.com/${endpoint}${query ? `?${query}` : ""}`,
      `https://ophim17.cc/${endpoint}${query ? `?${query}` : ""}`,
    ];

    // Special handler for film detail if endpoint is phim/:slug
    if (endpoint.startsWith("phim/")) {
      const slug = endpoint.replace(/^phim\//, "").split("?")[0];
      upstreamUrls.push(`https://ophim1.com/v1/api/phim/${slug}`);
      upstreamUrls.push(`https://phim.nguonc.com/api/film/${slug}`);
    }

    // Special handler for search query if keyword provided
    if (endpoint.includes("tim-kiem") && req.query.keyword) {
      const keyword = encodeURIComponent(String(req.query.keyword));
      upstreamUrls.push(`https://phim.nguonc.com/api/films/search?keyword=${keyword}`);
    }

    let lastError: any = null;

    for (const targetUrl of upstreamUrls) {
      try {
        const data = await fetchWithTimeout(targetUrl, 3500);
        if (data && (data.status === true || data.status === "success" || data.items || data.data?.items || data.movie)) {
          // Store successful response in cache
          proxyCache.set(cacheKey, { data, timestamp: Date.now() });
          return res.json(data);
        }
      } catch (err: any) {
        lastError = err;
        // Continue to next mirror
      }
    }

    // If all upstreams failed, return cached data if exists (even expired), or a safe fallback structure
    if (cached) {
      return res.json(cached.data);
    }

    console.warn(`[Proxy Warning] All upstreams failed for: ${endpoint}`, lastError?.message);

    // Return a safe 200 payload with empty items so the client UI renders gracefully without crashing
    if (endpoint.includes("phim/")) {
      return res.status(404).json({ status: false, msg: "Không tìm thấy phim", movie: null, episodes: [] });
    }

    return res.json({
      status: true,
      items: [],
      data: { items: [], params: { pagination: { totalItems: 0, totalItemsPerPage: 24, currentPage: 1, totalPages: 1 } } },
    });
  });

  // Direct InnerTube POST Client for Node.js backend
  async function fetchYouTubeInnerTubeBackend(
    query: string,
    token?: string | null
  ): Promise<{ channels: any[]; items: any[]; nextToken: string | null }> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 7000);
      const body: any = {
        context: {
          client: {
            clientName: "WEB",
            clientVersion: "2.20240801.00.00",
            hl: "vi",
            gl: "VN",
          },
        },
      };
      if (token) {
        body.continuation = token;
      } else {
        body.query = query;
      }

      const res = await fetch("https://www.youtube.com/youtubei/v1/search?prettyPrint=false", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8",
          "Origin": "https://www.youtube.com",
          "Referer": "https://www.youtube.com/",
          "X-YouTube-Client-Name": "1",
          "X-YouTube-Client-Version": "2.20240801.00.00",
        },
        body: JSON.stringify(body),
      }).finally(() => clearTimeout(timer));

      if (!res.ok) return { channels: [], items: [], nextToken: null };
      const data = await res.json();
      if (!data) return { channels: [], items: [], nextToken: null };

      const items: any[] = extractAllVideos(data);
      const channels: any[] = [];
      const walkChannels = (obj: any) => {
        if (!obj || typeof obj !== "object") return;
        const c = (obj as any).channelRenderer;
        if (c && c.channelId && !channels.some((x) => x.id === c.channelId)) {
          const title = c.title?.simpleText || c.title?.runs?.[0]?.text || "Kênh YouTube";
          const subscribers = c.subscriberCountText?.simpleText || c.subscriberCountText?.runs?.[0]?.text || "";
          let avatarUrl = c.thumbnail?.thumbnails?.[c.thumbnail.thumbnails.length - 1]?.url || "";
          if (avatarUrl && avatarUrl.startsWith("//")) avatarUrl = "https:" + avatarUrl;
          if (avatarUrl && c.channelId) {
            channelAvatarCache.set(c.channelId, avatarUrl);
          }
          channels.push({
            id: c.channelId,
            title,
            subscribers,
            avatarUrl,
            description: c.descriptionSnippet?.runs?.[0]?.text || "",
          });
        }
        for (const k of Object.keys(obj)) {
          if (obj[k] && typeof obj[k] === "object") walkChannels(obj[k]);
        }
      };
      walkChannels(data);

      return { channels, items, nextToken: findNextContinuationToken(data) };
    } catch (e) {
      console.error("InnerTube backend search error:", e);
      return { channels: [], items: [], nextToken: null };
    }
  }

  // Helper function to scrape real-time live search results directly from YouTube
  async function scrapeYouTubeSearch(
    query: string,
    opts?: { liveOnly?: boolean }
  ): Promise<{ channels: any[]; items: any[]; nextToken: string | null }> {
    // 1. Try Direct InnerTube API first
    if (!opts?.liveOnly) {
      const innerRes = await fetchYouTubeInnerTubeBackend(query);
      if (innerRes.items.length > 0 || innerRes.channels.length > 0) {
        return innerRes;
      }
    }

    try {
      // sp=EgJAAQ%3D%3D là filter "Trực tiếp" của YouTube Search
      const url =
        "https://www.youtube.com/results?search_query=" +
        encodeURIComponent(query) +
        (opts?.liveOnly ? "&sp=EgJAAQ%3D%3D" : "") +
        "&persist_gl=1&gl=VN&hl=vi";
      const { data, apiKey, clientVersion } = await fetchYouTubePageDataFull(url);
      cachedInnertubeKey = apiKey || cachedInnertubeKey;
      cachedInnertubeVer = clientVersion || cachedInnertubeVer;
      if (!data) return { channels: [], items: [], nextToken: null };

      // Walk the ENTIRE payload recursively
      const items: any[] = extractAllVideos(data);

      const channels: any[] = [];
      const walkChannels = (obj: any) => {
        if (!obj || typeof obj !== 'object') return;
        const c = (obj as any).channelRenderer;
        if (c && c.channelId && !channels.some((x) => x.id === c.channelId)) {
          const channelId = c.channelId;
          const title = c.title?.simpleText || c.title?.runs?.[0]?.text || "Kênh YouTube";
          const subscribers = c.subscriberCountText?.simpleText || c.subscriberCountText?.runs?.[0]?.text || "";
          const videoCount = c.videoCountText?.simpleText || c.videoCountText?.runs?.[0]?.text || "";
          const description = c.descriptionSnippet?.runs?.[0]?.text || "";
          let avatarUrl = c.thumbnail?.thumbnails?.[c.thumbnail.thumbnails.length - 1]?.url || "";
          if (avatarUrl && avatarUrl.startsWith("//")) avatarUrl = "https:" + avatarUrl;
          if (avatarUrl && channelId) {
            channelAvatarCache.set(channelId, avatarUrl);
          }

          channels.push({
            id: channelId,
            title,
            handle: subscribers,
            subscribers,
            videoCount,
            description,
            avatarUrl
          });
        }
        for (const key of Object.keys(obj)) {
          const val = (obj as any)[key];
          if (val && typeof val === 'object') walkChannels(val);
        }
      };
      walkChannels(data);

      return { channels, items, nextToken: findNextContinuationToken(data) };
    } catch (err) {
      console.error("Scrape YouTube Search error:", err);
      return { channels: [], items: [], nextToken: null };
    }
  }

  // Normalize channel names for strict identity matching
  const normChannelKey = (s: string) =>
    (s || "").toLowerCase().replace(/\s+/g, "");

  // Fetch a YouTube page: ytInitialData JSON + innertube config for continuations
  async function fetchYouTubePageDataFull(url: string): Promise<{ data: any | null; apiKey?: string; clientVersion?: string }> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, {
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Cookie": "CONSENT=YES+cb.20210328-04-p0.en+FX+900; SOCS=CAI",
        },
      }).finally(() => clearTimeout(timer));

      if (!res.ok) return { data: null };
      const html = await res.text();
      const match =
        html.match(/window\["ytInitialData"\]\s*=\s*({.*?});/s) ||
        html.match(/var ytInitialData\s*=\s*({.*?});/s) ||
        html.match(/ytInitialData\s*=\s*({.*?});/s) ||
        html.match(/ytInitialData\s*=\s*({[\s\S]*?});<\/script>/);
      if (!match) return { data: null };
      return {
        data: JSON.parse(match[1]),
        apiKey: html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1],
        clientVersion: html.match(/"INNERTUBE_CONTEXT_CLIENT_VERSION":"([^"]+)"/)?.[1]
          || html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1],
      };
    } catch {
      return { data: null };
    }
  }

  // Fetch a YouTube page and extract ytInitialData JSON
  async function fetchYouTubePageData(url: string): Promise<any | null> {
    const { data } = await fetchYouTubePageDataFull(url);
    return data;
  }

  // Find the next-page continuation token inside any ytInitialData / innertube payload
  function findNextContinuationToken(obj: any): string | null {
    let token: string | null = null;
    const walk = (node: any) => {
      if (!node || typeof node !== "object" || token) return;
      const cir = (node as any).continuationItemRenderer;
      const t = cir?.continuationEndpoint?.continuationCommand?.token
        || cir?.button?.buttonRenderer?.command?.continuationCommand?.token;
      if (typeof t === "string" && t.length > 10) {
        token = t;
        return;
      }
      for (const key of Object.keys(node)) {
        walk((node as any)[key]);
      }
    };
    walk(obj);
    return token;
  }

  // Fetch the next page of results via the innertube browse/search endpoints
  async function fetchInnertubeContinuation(
    token: string,
    apiKey: string | undefined,
    clientVersion: string | undefined,
    kind: "browse" | "search"
  ): Promise<any | null> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const keyQuery = apiKey ? `?key=${encodeURIComponent(apiKey)}&prettyPrint=false` : "?prettyPrint=false";
      const res = await fetch(`https://www.youtube.com/youtubei/v1/${kind}${keyQuery}`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8",
          "Origin": "https://www.youtube.com",
          "Referer": "https://www.youtube.com/",
          "X-YouTube-Client-Name": "1",
          "X-YouTube-Client-Version": clientVersion || "2.20240801.00.00",
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: "WEB",
              clientVersion: clientVersion || "2.20240801.00.00",
              hl: "vi",
              gl: "VN",
            },
          },
          continuation: token,
        }),
      }).finally(() => clearTimeout(timer));

      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  // Recursively collect videoRenderer / gridVideoRenderer nodes from ytInitialData
  function extractVideoRenderers(obj: any, out: any[] = []): any[] {
    if (!obj || typeof obj !== "object") return out;
    const raw = (obj as any).videoRenderer || (obj as any).gridVideoRenderer;
    if (raw && raw.videoId && !out.some((x) => x.videoId === raw.videoId)) {
      out.push(raw);
    }
    for (const key of Object.keys(obj)) {
      const val = (obj as any)[key];
      if (val && typeof val === "object") extractVideoRenderers(val, out);
    }
    return out;
  }

  // Recursively collect lockupViewModel nodes (YouTube's NEW layout for search & channel tabs)
  function collectLockupViewModels(obj: any, out: any[] = []): any[] {
    if (!obj || typeof obj !== "object") return out;
    const lv = (obj as any).lockupViewModel;
    if (lv && lv.contentId && !out.includes(lv)) out.push(lv);
    for (const key of Object.keys(obj)) {
      const val = (obj as any)[key];
      if (val && typeof val === "object") collectLockupViewModels(val, out);
    }
    return out;
  }

  // Map a lockupViewModel node into our normalized YouTubeVideo shape
  function mapLockupVideo(lockup: any) {
    if (!lockup || typeof lockup !== "object") return null;

    const contentType = String(lockup.contentType || "");
    // Only accept video lockups (skip shorts/playlists/etc.)
    if (contentType && !/VIDEO|LIVE/i.test(contentType)) return null;

    const vid = lockup.contentId
      || lockup.rendererContext?.commandContext?.onTap?.innertubeCommand?.watchEndpoint?.videoId;
    if (!vid) return null;

    const metaVm = lockup.metadata?.lockupMetadataViewModel;
    const title = metaVm?.title?.content || "Video YouTube";

    const sources = lockup.contentImage?.thumbnailViewModel?.image?.sources || [];
    const thumbnailUrl = sources[sources.length - 1]?.url || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;

    // Duration & LIVE badge live inside thumbnail overlays
    let duration = "";
    let isLive = false;
    const overlays = lockup.contentImage?.thumbnailViewModel?.overlays || [];
    for (const ov of overlays) {
      const badges = ov?.thumbnailBottomOverlayViewModel?.badges || [];
      for (const b of badges) {
        const t = b?.thumbnailBadgeViewModel?.text || "";
        if (!t) continue;
        if (/live|trực tiếp/i.test(t)) {
          isLive = true;
          duration = "LIVE";
        } else if (!duration && /\d/.test(t)) {
          duration = t;
        }
      }
    }

    // Channel name / avatar / views / published date from metadata rows
    let channelTitle = "";
    let channelId = "";
    let channelAvatar = "";
    let viewCount = "";
    let publishedAt = "";

    const avSrcs = metaVm?.image?.avatarViewModel?.avatar?.image?.sources || [];
    if (avSrcs.length > 0) channelAvatar = avSrcs[avSrcs.length - 1]?.url || "";
    if (channelAvatar && channelAvatar.startsWith("//")) {
      channelAvatar = "https:" + channelAvatar;
    }

    // Try multiple possible paths to extract channel title & ID
    const possibleChannelTitles = [
      metaVm?.ownerText?.runs?.[0]?.text,
      metaVm?.ownerText?.simpleText,
      lockup.shortBylineText?.runs?.[0]?.text,
      lockup.longBylineText?.runs?.[0]?.text,
      metaVm?.image?.avatarViewModel?.avatar?.image?.accessibility?.accessibilityData?.label,
    ];
    for (const titleCandidate of possibleChannelTitles) {
      if (titleCandidate && typeof titleCandidate === "string" && titleCandidate.trim().length > 0) {
        let cleanName = titleCandidate.trim();
        // Clean potential prefix like "Ảnh đại diện cho " or "Avatar for "
        if (cleanName.startsWith("Ảnh đại diện cho ")) {
          cleanName = cleanName.replace("Ảnh đại diện cho ", "");
        } else if (cleanName.startsWith("Avatar for ")) {
          cleanName = cleanName.replace("Avatar for ", "");
        }
        if (cleanName) {
          channelTitle = cleanName;
          break;
        }
      }
    }

    const possibleChannelIds = [
      metaVm?.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId,
      metaVm?.image?.avatarViewModel?.onTap?.innertubeCommand?.browseEndpoint?.browseId,
      lockup.shortBylineText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId,
      lockup.longBylineText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId,
      lockup.rendererContext?.commandContext?.onTap?.innertubeCommand?.watchEndpoint?.ownerChannelId,
    ];
    for (const idCandidate of possibleChannelIds) {
      if (idCandidate && typeof idCandidate === "string" && idCandidate.startsWith("UC")) {
        channelId = idCandidate;
        break;
      }
    }

    const rows = metaVm?.metadata?.contentMetadataViewModel?.metadataRows || [];
    for (const row of rows) {
      for (const part of row?.metadataParts || []) {
        const t = part?.text?.content || "";
        if (!t) continue;
        if (/lượt xem|views|đang xem|watching/i.test(t)) {
          if (!viewCount) viewCount = t;
          if (/đang xem|watching/i.test(t)) isLive = true;
        } else if (/(trước|ago|hôm nay|giờ trước|phút trước)/i.test(t)) {
          if (!publishedAt) publishedAt = t;
        } else if (!channelTitle) {
          channelTitle = t;
        }
      }
    }

    if (!channelAvatar && channelId && channelAvatarCache.has(channelId)) {
      channelAvatar = channelAvatarCache.get(channelId) || "";
    }

    return {
      id: vid,
      title,
      channelTitle: channelTitle || "Kênh YouTube",
      channelId: channelId || "",
      channelAvatar,
      publishedAt: publishedAt || "Mới đây",
      viewCount,
      duration: isLive ? "LIVE" : duration,
      thumbnailUrl,
      description: "",
      category: isLive ? "live" : "trending",
    };
  }

  // Unified extractor: handles BOTH the legacy renderers and the new lockup layout
  function extractAllVideos(obj: any): any[] {
    const items: any[] = extractVideoRenderers(obj)
      .map((v) => mapChannelVideoRenderer(v, v.ownerText?.runs?.[0]?.text || "Kênh YouTube"))
      .filter(Boolean);

    const seen = new Set(items.map((i: any) => i.id));
    const lockItems = collectLockupViewModels(obj)
      .map(mapLockupVideo)
      .filter(Boolean);
    for (const li of lockItems) {
      if (!seen.has(li.id)) {
        seen.add(li.id);
        items.push(li);
      }
    }

    return items;
  }

  // Fallback via Piped public API when direct scraping fails (bot-gating / rate limits)
  const PIPED_INSTANCES = [
    "https://pipedapi.kavin.rocks",
    "https://api.piped.privacydev.net",
    "https://pipedapi.adminforge.de",
  ];

  async function fetchPipedChannel(ucId: string): Promise<{ channel: any; items: any[] } | null> {
    for (const base of PIPED_INSTANCES) {
      try {
        const data = await fetchWithTimeout(`${base}/channels/${ucId}`, 6000);
        if (!data?.relatedStreams) continue;

        const items = data.relatedStreams
          .map((s: any) => mapPipedStreamItem(s, data.name || "Kênh YouTube", ucId))
          .filter(Boolean);

        const subsText =
          typeof data.subscriberCount === "number" && data.subscriberCount > 0
            ? `${data.subscriberCount.toLocaleString("vi-VN")} người đăng ký`
            : "";

        return {
          channel: {
            id: ucId,
            title: data.name || "Kênh YouTube",
            subscribers: subsText,
            description: data.description || "",
            avatarUrl: data.avatarUrl || "",
            bannerUrl: data.bannerUrl || "",
          },
          items,
        };
      } catch {
        // try next instance
      }
    }
    return null;
  }

  // Format seconds as h:mm:ss / m:ss
  function formatPipedDuration(sec: number): string {
    if (!sec || sec <= 0) return "";
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${m}:${String(s).padStart(2, "0")}`;
  }

  // Map a Piped stream item into our normalized YouTubeVideo shape
  function mapPipedStreamItem(s: any, fallbackChannelTitle: string, channelId?: string): any | null {
    const vid = String(s?.url || "").replace("/watch?v=", "").replace("/shorts/", "");
    if (!vid) return null;
    const isLive = Boolean(s?.livestream) || s?.duration === -1;
    return {
      id: vid,
      title: s.title || "Video YouTube",
      channelTitle: s.uploaderName || fallbackChannelTitle,
      channelId: s.uploaderUrl ? String(s.uploaderUrl).replace("/channel/", "") : channelId || "",
      channelAvatar: s.uploaderAvatar || "",
      publishedAt: s.uploadedDate || "Mới đây",
      viewCount: typeof s.views === "number" && s.views > 0 ? `${s.views.toLocaleString("vi-VN")} lượt xem` : "",
      duration: isLive ? "LIVE" : formatPipedDuration(s.duration),
      thumbnailUrl: s.thumbnail || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
      description: s.shortDescription || "",
      category: isLive ? "live" : "trending",
    };
  }

  // Innertube config cache (captured from scraped pages, reused for continuations)
  const channelAvatarCache = new Map<string, string>();
  let cachedInnertubeKey: string | undefined;
  let cachedInnertubeVer: string | undefined;

  // Vietnam-specific prioritized queries per category
  const VIETNAM_CATEGORY_QUERIES: Record<string, string[]> = {
    all: [
      "video hot trend việt nam hôm nay",
      "thịnh hành việt nam mới nhất",
      "tin tức giải trí việt nam hot nhất",
      "top trending youtube vietnam",
    ],
    trending: [
      "thịnh hành youtube việt nam hôm nay",
      "video triệu view việt nam mới nhất",
      "những video hot nhất việt nam tuần này",
      "xu hướng việt nam hôm nay",
    ],
    music_vn: [
      "nhạc việt nam mới nhất thịnh hành vpop",
      "top bxh nhạc việt hay nhất hôm nay",
      "mv ca nhạc việt nam triệu view mới",
      "nhạc trẻ acoustic chill việt nam hay nhất",
      "nhạc remix tiktok việt nam hot trend",
    ],
    music: [
      "nhạc việt nam mới nhất thịnh hành vpop",
      "top bài hát việt nam hay nhất",
      "ca khúc việt nam triệu view mới ra mắt",
      "nhạc lofi việt nam chill thư giãn",
    ],
    news_vn: [
      "tin tức thời sự việt nam 24h mới nhất hôm nay",
      "tin nóng việt nam vtv chuyển động 24h",
      "tin tức việt nam trong ngày hôm nay",
      "bản tin thời sự việt nam trực tiếp",
    ],
    news: [
      "tin tức thời sự việt nam mới nhất",
      "tin nóng 24h việt nam hôm nay",
      "thời sự vtv24 tin tức việt nam",
    ],
    comedy_vn: [
      "hài hước giải trí việt nam triệu view",
      "tiểu phẩm hài việt nam cười bể bụng",
      "táo quân hài kịch việt nam chọn lọc",
      "sitcom hài việt nam vui nhộn",
    ],
    entertainment: [
      "gameshow việt nam triệu view hot nhất",
      "chương trình giải trí việt nam hay nhất",
      "talkshow hài hước việt nam",
      "show truyền hình thực tế việt nam",
    ],
    gaming_vn: [
      "streamer việt nam highlights vui nhộn",
      "gaming việt nam liên quân tốc chiến free fire pubg",
      "highlight liên minh huyền thoại việt nam",
      "top game thủ việt nam stream hay",
    ],
    gaming: [
      "streamer việt nam gaming highlight",
      "liên minh huyền thoại lmht việt nam",
      "game mobile việt nam hot nhất",
    ],
    review_phim: [
      "review phim hay việt nam tóm tắt phim chiếu rạp",
      "tóm tắt phim bom tấn việt nam thuyết minh",
      "review phim điện ảnh việt nam mới",
      "phim ngắn việt nam cảm động hay nhất",
    ],
    podcast_vn: [
      "podcast việt nam chữa lành tâm sự talkshow",
      "vietcetera have a sip podcast việt nam",
      "trò chuyện podcast việt nam ý nghĩa cuộc sống",
      "radio tâm sự đêm khuya việt nam",
    ],
    food_vn: [
      "ẩm thực đường phố việt nam street food món ngon",
      "khám phá du lịch ẩm thực việt nam",
      "review ẩm thực việt nam ăn sập hà nội sài gòn",
      "nấu ăn món ngon việt nam chuẩn vị",
    ],
    tech_vn: [
      "đánh giá công nghệ điện thoại việt nam review",
      "vật vờ studio schannel công nghệ việt nam",
      "mở hộp trên tay điện thoại máy tính mới nhất việt nam",
    ],
    tech: [
      "công nghệ việt nam review đánh giá mới",
      "smartphone laptop công nghệ việt nam",
    ],
    kids_vn: [
      "hoạt hình thiếu nhi thuyết minh tiếng việt",
      "nhạc thiếu nhi việt nam vui nhộn bé xem",
      "mèo ú doraemon tiếng việt tập mới",
      "cổ tích việt nam hoạt hình giáo dục bé",
    ],
    kids: [
      "hoạt hình tiếng việt cho bé thiếu nhi",
      "nhạc thiếu nhi việt nam vui nhộn",
    ],
    live_vn: [
      "trực tiếp việt nam livestream hot hôm nay",
      "live stream việt nam phát sóng trực tiếp",
    ],
    shorts: [
      "shorts việt nam hài hước triệu view",
      "tiktok shorts việt nam hot trend",
    ],
  };

  const TRENDING_FALLBACK_QUERIES = VIETNAM_CATEGORY_QUERIES.all;

  const buildTrendingFallbackToken = (pageIndex: number, category: string): string =>
    `trendsearch:${pageIndex}:${encodeURIComponent(category || "all")}`;

  // Direct InnerTube Browse Client for Trending
  async function fetchYouTubeInnerTubeTrendingBackend(region = "VN"): Promise<{ items: any[]; nextToken: string | null }> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 7000);
      const body = {
        context: {
          client: {
            clientName: "WEB",
            clientVersion: "2.20240801.00.00",
            hl: "vi",
            gl: region,
          },
        },
        browseId: "FEtrending",
      };

      const res = await fetch("https://www.youtube.com/youtubei/v1/browse?prettyPrint=false", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8",
          "Origin": "https://www.youtube.com",
          "Referer": "https://www.youtube.com/",
          "X-YouTube-Client-Name": "1",
          "X-YouTube-Client-Version": "2.20240801.00.00",
        },
        body: JSON.stringify(body),
      }).finally(() => clearTimeout(timer));

      if (!res.ok) return { items: [], nextToken: null };
      const data = await res.json();
      if (!data) return { items: [], nextToken: null };

      const seen = new Set<string>();
      const items = extractAllVideos(data).filter((v: any) => {
        if (!v?.id || seen.has(v.id)) return false;
        seen.add(v.id);
        return true;
      });

      return { items, nextToken: findNextContinuationToken(data) };
    } catch (e) {
      console.error("InnerTube backend trending error:", e);
      return { items: [], nextToken: null };
    }
  }

  // Scrape YouTube's REAL Trending feed (https://www.youtube.com/feed/trending?gl=VN)
  async function scrapeYouTubeTrending(region = "VN"): Promise<{ items: any[]; nextToken: string | null }> {
    const innerRes = await fetchYouTubeInnerTubeTrendingBackend(region);
    if (innerRes.items.length > 0) {
      return innerRes;
    }

    const { data, apiKey, clientVersion } = await fetchYouTubePageDataFull(
      `https://www.youtube.com/feed/trending?gl=${encodeURIComponent(region)}&hl=vi`
    );
    if (!data) return { items: [], nextToken: null };

    cachedInnertubeKey = apiKey || cachedInnertubeKey;
    cachedInnertubeVer = clientVersion || cachedInnertubeVer;

    const seen = new Set<string>();
    const items = extractAllVideos(data).filter((v: any) => {
      if (!v?.id || seen.has(v.id)) return false;
      seen.add(v.id);
      return true;
    });

    return { items, nextToken: findNextContinuationToken(data) };
  }

  function mapChannelVideoRenderer(video: any, fallbackChannelTitle: string) {
    const videoId = video?.videoId;
    if (!videoId) return null;

    const title = video.title?.runs?.[0]?.text || video.title?.simpleText || "Video YouTube";
    const channelTitle = video.ownerText?.runs?.[0]?.text
      || video.shortBylineText?.runs?.[0]?.text
      || video.longBylineText?.runs?.[0]?.text
      || fallbackChannelTitle;
    const channelId = video.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId
      || video.shortBylineText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId
      || video.longBylineText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId
      || "";
    let channelAvatar = video.channelThumbnailSupportedRenderers?.channelThumbnailWithRippleRenderer?.thumbnail?.thumbnails?.[0]?.url
      || video.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.thumbnail?.thumbnails?.[0]?.url
      || video.channelThumbnailSupportedRenderers?.channelThumbnailRenderer?.thumbnail?.thumbnails?.[0]?.url
      || video.channelThumbnail?.thumbnails?.[0]?.url
      || video.channelThumbnail?.thumbnail?.thumbnails?.[0]?.url
      || video.channelThumbnailWithRippleRenderer?.thumbnail?.thumbnails?.[0]?.url
      || video.channelThumbnailWithLinkRenderer?.thumbnail?.thumbnails?.[0]?.url
      || "";

    if (!channelAvatar && channelId && channelAvatarCache.has(channelId)) {
      channelAvatar = channelAvatarCache.get(channelId) || "";
    }

    if (channelAvatar && channelAvatar.startsWith("//")) channelAvatar = "https:" + channelAvatar;

    const publishedAt = video.publishedTimeText?.simpleText || video.publishedTimeText?.runs?.map((r: any) => r.text).join("") || "Mới đây";
    const viewCount = video.viewCountText?.simpleText || video.viewCountText?.runs?.map((r: any) => r.text).join("") || "";
    let lengthText = video.lengthText?.simpleText || video.lengthText?.runs?.map((r: any) => r.text).join("") || "";

    const badges = video.badges || [];
    const isLive = badges.some((b: any) => {
      const label = b.metadataBadgeRenderer?.label?.toLowerCase() || '';
      return label.includes('live') || label.includes('trực tiếp');
    }) || (lengthText === "" && (viewCount.includes('đang xem') || viewCount.includes('watching') || video.upcomingEventData));
    if (isLive) lengthText = 'LIVE';

    const thumbnail = video.thumbnail?.thumbnails?.[video.thumbnail.thumbnails.length - 1]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    const description = video.descriptionSnippet?.runs?.map((r: any) => r.text).join("")
      || video.detailedMetadataSnippets?.[0]?.snippetText?.runs?.map((r: any) => r.text).join("")
      || "";

    return {
      id: videoId,
      title,
      channelTitle,
      channelId,
      channelAvatar,
      publishedAt,
      viewCount,
      duration: lengthText,
      thumbnailUrl: thumbnail,
      description,
      category: isLive ? 'live' : 'trending',
    };
  }

  // Resolve a canonical UC channel id by searching YouTube with the Channel-type filter (sp=EgIQAg%3D%3D)
  async function resolveChannelIdByTitle(title: string): Promise<string | null> {
    if (!title) return null;
    const searchData = await fetchYouTubePageData(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(title)}&sp=EgIQAg%3D%3D`
    );
    if (!searchData) return null;

    const found: any[] = [];
    const walk = (obj: any) => {
      if (!obj || typeof obj !== "object") return;
      const ch = (obj as any).channelRenderer;
      if (ch && ch.channelId) found.push(ch);
      for (const key of Object.keys(obj)) {
        const val = (obj as any)[key];
        if (val && typeof val === "object") walk(val);
      }
    };
    walk(searchData);

    if (found.length === 0) return null;

    const targetKey = normChannelKey(title);
    const exact = found.find((c) => normChannelKey(c.title?.simpleText) === targetKey);
    const partial = found.find((c) => {
      const k = normChannelKey(c.title?.simpleText);
      return targetKey.length >= 3 && k && (k.includes(targetKey) || targetKey.includes(k));
    });
    return (exact || partial || found[0])?.channelId || null;
  }

  // Scrape the actual VIDEOS tab of a channel so results are 100% that channel's uploads
  async function scrapeYouTubeChannelVideos(channelId: string, channelName: string) {
    const idTrim = (channelId || "").trim();
    const nameTrim = (channelName || "").trim();

    const fallbackChannel: any = {
      id: idTrim || "channel_custom",
      title: nameTrim || "Kênh YouTube",
      subscribers: "",
      description: "",
      avatarUrl: "",
      bannerUrl: "",
    };

    const parseChannelPage = (data: any) => {
      const meta = { ...fallbackChannel };
      const metadata = data?.metadata?.channelMetadataRenderer;
      if (metadata) {
        meta.id = metadata.externalId || meta.id;
        meta.title = metadata.title || meta.title;
        meta.description = metadata.description || "";
        meta.avatarUrl = metadata.avatar?.thumbnails?.[0]?.url || meta.avatarUrl;
      }
      const header = data?.header?.c4TabbedHeaderRenderer
        || data?.header?.interactiveTabbedHeaderRenderer
        || data?.header?.pageHeaderRenderer;
      if (header) {
        if (header.subscriberCountText) {
          meta.subscribers = header.subscriberCountText.simpleText || header.subscriberCountText.runs?.[0]?.text || meta.subscribers;
        }
        const banner = header.banner?.thumbnails
          || header.imageBannerViewModel?.image?.sources;
        if (banner && banner.length > 0) {
          meta.bannerUrl = banner[banner.length - 1].url;
        }
        if (!meta.avatarUrl && header.avatar?.thumbnails?.length > 0) {
          meta.avatarUrl = header.avatar.thumbnails[header.avatar.thumbnails.length - 1].url;
        }
      }

      if (meta.id && meta.avatarUrl) {
        channelAvatarCache.set(meta.id, meta.avatarUrl);
      }

      let videos = extractAllVideos(data);

      // Sort so LIVE appears first
      videos.sort((a: any, b: any) => {
        if (a.duration === 'LIVE' && b.duration !== 'LIVE') return -1;
        if (a.duration !== 'LIVE' && b.duration === 'LIVE') return 1;
        return 0;
      });

      return { channel: meta, items: videos };
    };

    // 1. Direct channel URL when we have a UC id or @handle
    const candidates: string[] = [];
    if (/^UC[\w-]{22}$/.test(idTrim)) {
      candidates.push(`https://www.youtube.com/channel/${idTrim}`);
    } else if (idTrim.startsWith("@")) {
      candidates.push(`https://www.youtube.com/${encodeURIComponent(idTrim)}`);
    }

    let usedBase = "";
    let pageData: any = null;
    for (const base of candidates) {
      pageData = await fetchYouTubePageData(`${base}/videos`);
      // Accept the page when it has videos OR valid channel metadata
      if (pageData && (extractAllVideos(pageData).length > 0 || pageData.metadata?.channelMetadataRenderer)) {
        usedBase = base;
        break;
      }
      pageData = null;
    }

    // 2. Resolve canonical channel id via Channel-filtered search, then load its tabs
    if (!pageData) {
      const query = nameTrim || idTrim.replace(/^@/, "");
      const resolvedId = await resolveChannelIdByTitle(query);
      if (resolvedId) {
        usedBase = `https://www.youtube.com/channel/${resolvedId}`;
        pageData = await fetchYouTubePageData(`${usedBase}/videos`);
      }
    }

    if (!pageData) {
      return { channel: fallbackChannel, items: [] };
    }

    const parsed = parseChannelPage(pageData);

    // 3. Merge the /streams tab so currently-live broadcasts appear on the channel page too
    try {
      const streamsData = await fetchYouTubePageData(`${usedBase}/streams`);
      if (streamsData) {
        const streamItems = extractAllVideos(streamsData);
        const seen = new Set(parsed.items.map((i: any) => i.id));
        for (const s of streamItems) {
          if (!seen.has(s.id)) {
            seen.add(s.id);
            parsed.items.push(s);
          }
        }
        // Sort so LIVE appears first
        parsed.items.sort((a: any, b: any) => {
          if (a.duration === 'LIVE' && b.duration !== 'LIVE') return -1;
          if (a.duration !== 'LIVE' && b.duration === 'LIVE') return 1;
          return 0;
        });
      }
    } catch {
      // streams tab is optional
    }

    // 4. Piped API fallback when direct scraping returned nothing (bot-gating / rate limits)
    if (parsed.items.length === 0) {
      const ucId = /^UC[\w-]{22}$/.test(parsed.channel.id || "") ? parsed.channel.id : "";
      if (ucId) {
        const piped = await fetchPipedChannel(ucId);
        if (piped && piped.items.length > 0) {
          parsed.channel = { ...parsed.channel, ...piped.channel };
          parsed.items = piped.items;
        }
      }
    }

    // 5. Last-resort strict search fallback: only keep results authored by this exact channel
    if (parsed.items.length === 0 && nameTrim) {
      const s = await scrapeYouTubeSearch(nameTrim);
      const tKey = normChannelKey(parsed.channel.title || nameTrim);
      parsed.items = s.items.filter((it: any) => {
        const iKey = normChannelKey(it.channelTitle || "");
        return iKey && (iKey === tKey || iKey.includes(tKey) || tKey.includes(iKey));
      });
    }

    return parsed;
  }

  // Search specifically within a YouTube channel (querying /search tab or channel-scoped search)
  async function scrapeYouTubeChannelSearch(channelId: string, channelName: string, query: string) {
    const idTrim = (channelId || "").trim();
    const nameTrim = (channelName || "").trim();
    const qTrim = (query || "").trim();

    const fallbackChannel: any = {
      id: idTrim || "channel_custom",
      title: nameTrim || "Kênh YouTube",
      subscribers: "",
      description: "",
      avatarUrl: "",
      bannerUrl: "",
    };

    if (!qTrim) {
      return scrapeYouTubeChannelVideos(channelId, channelName);
    }

    // 1. Direct channel search URL on YouTube
    const candidates: string[] = [];
    if (/^UC[\w-]{22}$/.test(idTrim)) {
      candidates.push(`https://www.youtube.com/channel/${idTrim}`);
    } else if (idTrim.startsWith("@")) {
      candidates.push(`https://www.youtube.com/${encodeURIComponent(idTrim)}`);
    }

    let items: any[] = [];

    for (const base of candidates) {
      const searchPageData = await fetchYouTubePageData(`${base}/search?query=${encodeURIComponent(qTrim)}`);
      if (searchPageData) {
        const vids = extractAllVideos(searchPageData);
        if (vids.length > 0) {
          items = vids;
          break;
        }
      }
    }

    // 2. Resolve canonical channel id and query /search tab
    if (items.length === 0 && nameTrim) {
      const resolvedId = await resolveChannelIdByTitle(nameTrim);
      if (resolvedId) {
        const searchPageData = await fetchYouTubePageData(`https://www.youtube.com/channel/${resolvedId}/search?query=${encodeURIComponent(qTrim)}`);
        if (searchPageData) {
          const vids = extractAllVideos(searchPageData);
          if (vids.length > 0) {
            items = vids;
          }
        }
      }
    }

    // 3. Fallback: Search YouTube with channel name + query keywords
    if (items.length === 0) {
      const searchString = nameTrim ? `"${nameTrim}" ${qTrim}` : `${idTrim} ${qTrim}`;
      const s1 = await scrapeYouTubeSearch(searchString);
      const tKey = normChannelKey(nameTrim || idTrim);

      // Filter and prioritize videos by channel
      const channelMatches = s1.items.filter((it: any) => {
        const iKey = normChannelKey(it.channelTitle || "");
        return tKey.length >= 2 && iKey && (iKey === tKey || iKey.includes(tKey) || tKey.includes(iKey));
      });

      if (channelMatches.length > 0) {
        items = channelMatches;
      } else if (s1.items.length > 0) {
        items = s1.items;
      } else {
        // Try relaxed search
        const s2 = await scrapeYouTubeSearch(`${nameTrim} ${qTrim}`);
        items = s2.items;
      }
    }

    return { channel: fallbackChannel, items };
  }

  // 7. YouTube Real Search API Endpoint (Direct YouTube Live Extraction)
  app.get("/api/youtube/search", requireAuth, requireActiveSlot, async (req, res) => {
    // Continuation page request (infinite scroll)
    const contToken = String(req.query.token || "").trim();
    if (contToken) {
      const data = await fetchInnertubeContinuation(contToken, cachedInnertubeKey, cachedInnertubeVer, "search");
      const items = data ? extractAllVideos(data) : [];
      return res.json({ channels: [], items, nextToken: data ? findNextContinuationToken(data) : null });
    }

    const query = String(req.query.q || "").trim();
    if (!query) {
      return res.json({ channels: [], items: [], nextToken: null });
    }

    // Direct YouTube Search Scraper (+ song song một pass riêng cho các luồng LIVE)
    const [baseResult, livePass] = await Promise.all([
      scrapeYouTubeSearch(query),
      scrapeYouTubeSearch(query, { liveOnly: true }).catch(() => ({ channels: [], items: [], nextToken: null })),
    ]);
    let liveData = baseResult;

    // If exact query yields no results and query contains pipes or special tokens, try fallback with core keywords
    if (liveData.items.length === 0 && (query.includes('|') || query.includes('-') || query.split(' ').length > 4)) {
      const coreKeywords = query.split(/\||\-/)[0].trim().split(' ').slice(0, 4).join(' ');
      if (coreKeywords && coreKeywords !== query) {
        const fallbackData = await scrapeYouTubeSearch(coreKeywords);
        if (fallbackData.items.length > 0 || fallbackData.channels.length > 0) {
          liveData = fallbackData;
        }
      }
    }

    // Đưa các luồng đang phát trực tiếp lên đầu kết quả (mặc định YouTube hay chôn chúng dưới video thường)
    const mergedItems = [...liveData.items];
    if (livePass.items.length > 0) {
      const seenIds = new Set(mergedItems.map((i: any) => i.id));
      const freshLives = livePass.items
        .filter((i: any) => i?.id && !seenIds.has(i.id))
        .slice(0, 8);
      mergedItems.unshift(...freshLives);
    }

    // Nếu kết quả tìm kiếm có kênh liên quan phù hợp (ví dụ: ttg, levi, mixigaming, vtv...)
    // tự động lấy các video mới nhất của kênh đó đưa lên đầu kết quả
    const normQ = normChannelKey(query);
    const isShortQuery = normQ.length <= 6;
    let matchedChanId: string | null = null;

    if (liveData.channels && liveData.channels.length > 0) {
      const matchedChan = liveData.channels.find((c: any) => {
        const cKey = normChannelKey(c.title || "");
        if (isShortQuery) {
          // Khớp chính xác từ nguyên bản hoặc cụm từ đầu kênh (ví dụ "TTG", "TTG Esports", "Levi", "GAM Levi")
          const words = (c.title || "").toLowerCase().split(/\s+/);
          return words.includes(query.toLowerCase()) || cKey === normQ || cKey.startsWith(normQ);
        }
        return normQ.length >= 2 && (cKey.includes(normQ) || normQ.includes(cKey));
      }) || liveData.channels[0];

      if (matchedChan && matchedChan.id) {
        matchedChanId = matchedChan.id;
        try {
          const chanData = await scrapeYouTubeChannelVideos(matchedChan.id, matchedChan.title);
          if (chanData && chanData.items && chanData.items.length > 0) {
            const seenIds = new Set(mergedItems.map((i: any) => i.id));
            const chanVideos = chanData.items.filter((i: any) => i?.id && !seenIds.has(i.id));
            mergedItems.unshift(...chanVideos);
          }
        } catch (e) {
          console.warn("Channel video fetch error for search:", e);
        }
      }
    }

    // Đối với các từ khóa tìm kiếm ngắn (như 'ttg', 'levi', 'mixi'), chủ động tìm kiếm thêm ngữ cảnh Việt Nam
    if (isShortQuery) {
      try {
        const vnQueryRes = await scrapeYouTubeSearch(`${query} việt nam`);
        if (vnQueryRes.items && vnQueryRes.items.length > 0) {
          const seenIds = new Set(mergedItems.map((i: any) => i.id));
          const freshVn = vnQueryRes.items.filter((i: any) => i?.id && !seenIds.has(i.id));
          // Đưa các video chuẩn Việt Nam lên đầu
          mergedItems.unshift(...freshVn.slice(0, 10));
          if (liveData.channels.length === 0 && vnQueryRes.channels.length > 0) {
            liveData.channels = vnQueryRes.channels;
          }
        }
      } catch (e) {}
    }

    // Loại bỏ bớt các video hoạt hình/phim quốc tế không liên quan (như Teen Titans Go khi gõ ttg)
    // nếu kênh chính thức của Việt Nam đã được xác định
    let filteredItems = mergedItems;
    if (normQ === "ttg") {
      filteredItems = mergedItems.filter((item: any) => {
        const titleLower = (item.title || "").toLowerCase();
        // Giữ lại video Việt Nam hoặc từ kênh chính chủ TTG, lọc bỏ Teen Titans Go
        return !titleLower.includes("teen titans") && !titleLower.includes("titan go");
      });
    } else if (normQ === "levi") {
      filteredItems = mergedItems.filter((item: any) => {
        const titleLower = (item.title || "").toLowerCase();
        // Giữ lại video GAM Levi / LOL Levi / Vlogs, lọc bỏ phim Levi's quảng cáo quần jeans hoặc Attack on Titan Levi
        return !titleLower.includes("jeans") && !titleLower.includes("attack on titan") && !titleLower.includes("ackerman");
      });
    }

    // Sắp xếp ưu tiên:
    // 1. Video từ kênh chính khớp từ khóa
    // 2. Video có tiêu đề chứa từ khóa chính chủ
    filteredItems.sort((a: any, b: any) => {
      const aChanMatch = normChannelKey(a.channelTitle || "").includes(normQ);
      const bChanMatch = normChannelKey(b.channelTitle || "").includes(normQ);
      if (aChanMatch && !bChanMatch) return -1;
      if (!aChanMatch && bChanMatch) return 1;

      const aTitleMatch = (a.title || "").toLowerCase().includes(query.toLowerCase());
      const bTitleMatch = (b.title || "").toLowerCase().includes(query.toLowerCase());
      if (aTitleMatch && !bTitleMatch) return -1;
      if (!aTitleMatch && bTitleMatch) return 1;

      return 0;
    });

    if (filteredItems.length > 0 || liveData.channels.length > 0) {
      return res.json({
        channels: liveData.channels,
        items: filteredItems,
        nextToken: liveData.nextToken,
      });
    }

    // Piped API fallback
    const pipedInstances = [
      "https://pipedapi.kavin.rocks",
      "https://api.piped.privacydev.net",
      "https://pipedapi.tokhmi.xyz",
    ];

    for (const pipedBase of pipedInstances) {
      try {
        const pipedUrl = `${pipedBase}/search?q=${encodeURIComponent(query)}&filter=all`;
        const data = await fetchWithTimeout(pipedUrl, 4000);
        if (data?.items && Array.isArray(data.items) && data.items.length > 0) {
          const items = data.items
            .filter((item: any) => item.type === 'stream' && item.url)
            .map((item: any) => {
              const vid = item.url.replace('/watch?v=', '').replace('/shorts/', '');
              return {
                id: vid,
                title: item.title,
                channelTitle: item.uploaderName || 'YouTube Channel',
                publishedAt: item.uploadedDate || 'Mới đây',
                thumbnailUrl: item.thumbnail || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
                duration: item.duration > 0 ? `${Math.floor(item.duration / 60).toString().padStart(2, '0')}:${(item.duration % 60).toString().padStart(2, '0')}` : undefined,
                viewCount: item.views,
                category: 'trending',
              };
            }).filter((item: any) => item.id && item.title);

          if (items.length > 0) {
            return res.json({ channels: [], items });
          }
        }
      } catch {
        // try next
      }
    }

    return res.json({ channels: [], items: [] });
  });

  // 8. YouTube Channel Details & Channel Search Endpoint
  app.get("/api/youtube/channel", requireAuth, requireActiveSlot, async (req, res) => {
    const channelId = String(req.query.id || "").trim();
    const channelName = String(req.query.name || "").trim();
    const query = String(req.query.q || req.query.query || "").trim();

    if (!channelId && !channelName) {
      return res.json({ channel: null, items: [] });
    }

    try {
      if (query) {
        const searchResult = await scrapeYouTubeChannelSearch(channelId, channelName, query);
        return res.json(searchResult);
      }
      const result = await scrapeYouTubeChannelVideos(channelId, channelName);
      return res.json(result);
    } catch (err: any) {
      console.error("Fetch channel error:", err);
      return res.json({
        channel: { id: channelId || "channel_custom", title: channelName || "Kênh YouTube" },
        items: [],
      });
    }
  });

  app.get("/api/youtube/trending", requireAuth, requireActiveSlot, async (req, res) => {
    // Continuation page request (infinite scroll)
    const token = String(req.query.token || "").trim();
    const category = String(req.query.category || "all").trim();

    const categoryQueries = VIETNAM_CATEGORY_QUERIES[category] || [
      `${category} thịnh hành việt nam hôm nay`,
      ...TRENDING_FALLBACK_QUERIES,
    ];

    // Synthesized search-rotation page for feeds without native continuations
    if (token.startsWith("trendsearch:")) {
      const [, pageRaw, catRaw] = token.split(":");
      const pageIndex = parseInt(pageRaw, 10) || 0;
      const cat = decodeURIComponent(catRaw || "all") || "all";
      const activeQueries = VIETNAM_CATEGORY_QUERIES[cat] || [
        `${cat} thịnh hành việt nam hôm nay`,
        ...TRENDING_FALLBACK_QUERIES,
      ];

      if (pageIndex >= activeQueries.length) {
        return res.json({ items: [], nextToken: null });
      }
      try {
        const data = await scrapeYouTubeSearch(activeQueries[pageIndex]);
        return res.json({
          items: data.items,
          nextToken: pageIndex + 1 < activeQueries.length ? buildTrendingFallbackToken(pageIndex + 1, cat) : null,
        });
      } catch {
        return res.json({ items: [], nextToken: null });
      }
    }

    if (token) {
      const data = await fetchInnertubeContinuation(token, cachedInnertubeKey, cachedInnertubeVer, "browse");
      const items = data ? extractAllVideos(data) : [];
      return res.json({ items, nextToken: data ? findNextContinuationToken(data) : null });
    }

    // If specific Vietnam category requested (not 'all'), scrape tailored category query directly
    if (category !== "all" && category !== "trending") {
      const firstCatQuery = categoryQueries[0] || `${category} việt nam`;
      const catData = await scrapeYouTubeSearch(firstCatQuery);
      if (catData.items.length > 0) {
        return res.json({
          items: catData.items,
          nextToken: categoryQueries.length > 1 ? buildTrendingFallbackToken(1, category) : null,
        });
      }
    }

    // 1. Real YouTube Trending feed for Vietnam
    try {
      const { items, nextToken } = await scrapeYouTubeTrending("VN");
      if (items.length > 0) {
        return res.json({ items, nextToken: nextToken || buildTrendingFallbackToken(0, category) });
      }
    } catch (e) {
      console.warn("Trending feed scrape failed:", e);
    }

    // 2. Piped trending fallback
    for (const pipedBase of PIPED_INSTANCES) {
      try {
        const data = await fetchWithTimeout(`${pipedBase}/trending?region=VN`, 5000);
        if (Array.isArray(data) && data.length > 0) {
          const items = data.map((s: any) => mapPipedStreamItem(s, "Thịnh hành")).filter(Boolean);
          if (items.length > 0) {
            return res.json({ items, nextToken: buildTrendingFallbackToken(0, category) });
          }
        }
      } catch {
        // try next instance
      }
    }

    // 3. Legacy keyword-search fallback for Vietnam
    const liveData = await scrapeYouTubeSearch(categoryQueries[0] || "video hot trend việt nam hôm nay");
    return res.json({
      items: liveData.items,
      nextToken: liveData.items.length > 0 ? buildTrendingFallbackToken(1, category) : null,
    });
  });

  // Autocomplete suggestions for YouTube search
  app.get("/api/youtube/suggest", requireAuth, requireActiveSlot, async (req, res) => {
    try {
      const query = String(req.query.q || "").trim();
      if (!query) {
        return res.json([]);
      }
      const response = await fetch(
        `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(query)}`
      );
      if (response.ok) {
        const data = await response.json();
        return res.json(data[1] || []);
      }
      return res.json([]);
    } catch (err: any) {
      console.error("Suggestions fetch error:", err);
      return res.json([]);
    }
  });

  // Vite middleware for development or fallback to production static files
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const candidatePaths = [
      path.join(process.cwd(), "dist"),
      path.resolve("dist"),
      process.cwd(),
    ];
    let distPath = candidatePaths[0];
    for (const p of candidatePaths) {
      if (fs.existsSync(path.join(p, "index.html"))) {
        distPath = p;
        break;
      }
    }
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`🎬 Gấu Cinema HD Web server running on http://0.0.0.0:${PORT}`);
  });

  // If running on a cloud port (e.g. 8080), also open port 3000 if available
  if (PORT !== 3000) {
    try {
      const secondary = app.listen(3000, "0.0.0.0", () => {
        console.log(`🎬 Gấu Cinema HD secondary listener on http://0.0.0.0:3000`);
      });
      secondary.on("error", (err: any) => {
        console.log("Port 3000 secondary listener skipped:", err?.message);
      });
    } catch {
      // Ignore
    }
  }
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
