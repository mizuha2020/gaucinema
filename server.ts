import express from "express";
import path from "path";
import dns from "node:dns";
import cors from "cors";
import fs from "fs";
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

async function fetchWithTimeout(url: string, timeoutMs = 4000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
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

async function startServer() {
  const app = express();
  const PORT = 3000;

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
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
    credentials: true
  }));

  app.use(express.json());

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "Gấu Cinema API Server is healthy", timestamp: Date.now() });
  });

  // Comprehensive System API Health Check & Ping Tester (Backend-based to prevent CORS & accurately measure latency)
  app.post("/api/system/apis/ping", async (req, res) => {
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

  // 1. KKPhim Dedicated Proxy (https://phimapi.com)
  app.get("/api/proxy/kkphim/*", async (req, res) => {
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
      proxyCache.set(cacheKey, { data, timestamp: Date.now() });
      return res.json(data);
    } catch (err: any) {
      if (cached) return res.json(cached.data);
      return res.status(502).json({ status: false, msg: `KKPhim error: ${err.message}` });
    }
  });

  // 2. OPhim Dedicated Proxy (https://ophim1.com)
  app.get("/api/proxy/ophim/*", async (req, res) => {
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
          proxyCache.set(cacheKey, { data, timestamp: Date.now() });
          return res.json(data);
        }
      } catch {
        // try next mirror
      }
    }

    if (cached) return res.json(cached.data);
    return res.status(502).json({ status: false, msg: "OPhim upstreams unavailable" });
  });

  // 3. NguonC Dedicated Proxy (https://phim.nguonc.com)
  app.get("/api/proxy/nguonc/*", async (req, res) => {
    const endpoint = req.params[0];
    const query = new URLSearchParams(req.query as Record<string, string>).toString();
    const cacheKey = `nguonc:${endpoint}?${query}`;

    const cached = proxyCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return res.json(cached.data);
    }

    try {
      // Endpoint may be api/films/... or api/film/... or films/...
      const normalizedEndpoint = endpoint.startsWith("api/") ? endpoint : `api/${endpoint}`;
      const url = `https://phim.nguonc.com/${normalizedEndpoint}${query ? `?${query}` : ""}`;
      const data = await fetchWithTimeout(url, 5000);
      proxyCache.set(cacheKey, { data, timestamp: Date.now() });
      return res.json(data);
    } catch (err: any) {
      if (cached) return res.json(cached.data);
      return res.status(502).json({ status: false, msg: `NguonC error: ${err.message}` });
    }
  });

  // 4. Multi-Source Search Aggregator
  app.get("/api/proxy/search-all", async (req, res) => {
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
      fetchWithTimeout(`https://phimapi.com/v1/api/tim-kiem?keyword=${encoded}&limit=16`, 4000)
        .then((d) => ({ source: 'kkphim', data: d }))
        .catch(() => null),
      fetchWithTimeout(`https://ophim1.com/v1/api/tim-kiem?keyword=${encoded}&limit=16`, 4000)
        .then((d) => ({ source: 'ophim', data: d }))
        .catch(() => null),
      fetchWithTimeout(`https://phim.nguonc.com/api/films/search?keyword=${encoded}`, 4500)
        .then((d) => ({ source: 'nguonc', data: d }))
        .catch(() => null),
    ];

    const results = await Promise.all(tasks);
    const combinedMap = new Map<string, any>();

    for (const r of results) {
      if (!r || !r.data) continue;
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
    };

    proxyCache.set(cacheKey, { data: payload, timestamp: Date.now() });
    return res.json(payload);
  });

  // 5. Generic proxy for CORS issues (e.g. Manga Chapter APIs)
  app.get("/api/proxy/generic", async (req, res) => {
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
      const data = await fetchWithTimeout(url, 60000);
      proxyCache.set(cacheKey, { data, timestamp: Date.now() });
      return res.json(data);
    } catch (err: any) {
      if (err.message && err.message.includes('404')) {
        console.warn(`[Proxy 404] Upstream not found for ${url}`);
        return res.status(404).json({ error: "Upstream not found", status: 404 });
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

    // Image cache storage in memory
    const candidateUrls: string[] = [];

    // Check if this is a MangaDex page URL (from a @home node or uploads)
    const mdMatch = imageUrl.match(/(?:mangadex\.network|uploads\.mangadex\.org)\/(data|data-saver)\/([a-f0-9]+)\/([^?#]+)/i);
    if (mdMatch) {
      const [, type, hash, file] = mdMatch;
      const officialUploads = `https://uploads.mangadex.org/${type}/${hash}/${file}`;
      // Prioritize official Cloudflare-backed uploads CDN FIRST for 20x faster response
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

    // Check if this is a MangaDex cover URL
    const mdCoverMatch = imageUrl.match(/uploads\.mangadex\.org\/covers\/([a-f0-9-]+)\/([^?#]+)/i);
    if (mdCoverMatch) {
      const [, mangaId, fileName] = mdCoverMatch;
      // If fileName ends with .256.jpg or .512.jpg, add the original as fallback
      if (fileName.endsWith('.256.jpg') || fileName.endsWith('.512.jpg')) {
        const rawFileName = fileName.replace(/\.(256|512)\.jpg$/, '');
        candidateUrls.push(`https://uploads.mangadex.org/covers/${mangaId}/${rawFileName}`);
      }
    }

    // Check in-memory image cache first
    const cached = imageMemoryCache.get(imageUrl);
    if (cached) {
      res.setHeader("Content-Type", cached.contentType);
      res.setHeader("Cache-Control", "public, max-age=2592000, immutable");
      res.setHeader("X-Cache", "HIT");
      return res.send(cached.buffer);
    }

    for (const urlToFetch of candidateUrls) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const upstream = await fetch(urlToFetch, {
          signal: controller.signal,
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            "Referer": "https://mangadex.org/",
          },
        });
        clearTimeout(timer);

        if (upstream.ok) {
          const contentType = upstream.headers.get("content-type") || "image/jpeg";
          const arrayBuffer = await upstream.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);

          // Save to in-memory cache
          imageMemoryCache.set(imageUrl, { buffer, contentType });

          res.setHeader("Content-Type", contentType);
          res.setHeader("Cache-Control", "public, max-age=2592000, immutable");
          res.setHeader("X-Cache", "MISS");
          return res.send(buffer);
        }
      } catch (err: any) {
        // Continue to next candidate URL
      }
    }

    return res.status(502).send("Failed to fetch image upstream across all fallback sources");
  });

  // 6. Default General Proxy with resilient multi-source failover and caching
  app.get("/api/proxy/movie/*", async (req, res) => {
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

  // 3. TV & Sports M3U Playlist Parser Endpoint & Stream Proxy
  app.get("/api/tv/channels", async (req, res) => {
    try {
      const requestedUrl = req.query.url as string;
      const candidateUrls: string[] = [];
      if (requestedUrl) {
        candidateUrls.push(requestedUrl);
        if (requestedUrl.includes("vmttv.duckdns.org") || requestedUrl.includes("vmttv")) {
          candidateUrls.push(
            "https://raw.githubusercontent.com/vuminhthanh12/vuminhthanh12/main/vmttv",
            "https://raw.githubusercontent.com/vuminhthanh12/vuminhthanh12/main/tv.m3u"
          );
        }
      } else {
        candidateUrls.push(
          "https://raw.githubusercontent.com/vuminhthanh12/vuminhthanh12/main/vmttv",
          "https://tinyurl.com/HQClick",
          "https://tinyurl.com/kenhtv5",
          "https://quidniptv.blogspot.com/p/iptv.html",
          "https://iptv-org.github.io/iptv/countries/vn.m3u"
        );
      }

      const allChannels: Array<{
        name: string;
        logo: string;
        group: string;
        url: string;
        drmKey?: string;
        licenseType?: string;
        userAgent?: string;
      }> = [];

      // Helper to parse JSON format (e.g. HQClick mon.json)
      const parseJsonChannels = (data: any) => {
        const list: typeof allChannels = [];
        if (!data) return list;

        // Case 1: Simple array data.channels
        if (data.channels && Array.isArray(data.channels)) {
          for (const ch of data.channels) {
            if (ch.url) {
              list.push({
                name: ch.name || "Kênh TV",
                logo: ch.logo || ch.image?.url || "",
                group: ch.group || "Truyền Hình",
                url: ch.url,
                drmKey: ch.drmKey,
                licenseType: ch.licenseType,
                userAgent: ch.userAgent || ch.http_user_agent,
              });
            }
          }
        }

        // Case 2: Grouped channels like HQClick (data.groups -> channels -> sources/streams)
        if (data.groups && Array.isArray(data.groups)) {
          for (const grp of data.groups) {
            const groupName = grp.name || "Kênh TV";
            if (grp.channels && Array.isArray(grp.channels)) {
              for (const ch of grp.channels) {
                const chName = ch.name || "Kênh TV";
                const logo = ch.image?.url || ch.logo || "";
                const chUA = ch.userAgent || ch.http_user_agent || ch.headers?.['User-Agent'];

                // Find stream links recursively
                const findStreamUrls = (obj: any): string[] => {
                  let found: string[] = [];
                  if (!obj) return found;
                  if (typeof obj === "string" && (obj.startsWith("http://") || obj.startsWith("https://"))) {
                    return [obj];
                  }
                  if (Array.isArray(obj)) {
                    for (const item of obj) found = found.concat(findStreamUrls(item));
                    return found;
                  }
                  if (typeof obj === "object") {
                    if (obj.url && typeof obj.url === "string" && (obj.url.startsWith("http://") || obj.url.startsWith("https://"))) {
                      found.push(obj.url);
                    }
                    if (obj.stream_links && Array.isArray(obj.stream_links)) {
                      for (const sl of obj.stream_links) {
                        if (sl.url) found.push(sl.url);
                      }
                    }
                    for (const k of Object.keys(obj)) {
                      if (k !== "url" && k !== "image") {
                        found = found.concat(findStreamUrls(obj[k]));
                      }
                    }
                  }
                  return Array.from(new Set(found));
                };

                const streamUrls = findStreamUrls(ch.sources || ch);
                for (const streamUrl of streamUrls) {
                  if (streamUrl) {
                    list.push({
                      name: chName,
                      logo: logo || "https://images.unsplash.com/photo-1593784991095-a205069470b6?w=100&auto=format&fit=crop&q=60",
                      group: groupName,
                      url: streamUrl,
                      drmKey: ch.drmKey || ch.license_key,
                      licenseType: ch.licenseType || ch.license_type,
                      userAgent: chUA,
                    });
                    break; // Take primary stream link
                  }
                }
              }
            }
          }
        }
        return list;
      };

      // Helper to parse HTML with embedded #EXTINF (e.g. Quidni blogspot)
      const parseHtmlExtinfChannels = (html: string) => {
        const cleanText = html
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<\/p>/gi, "\n")
          .replace(/<\/div>/gi, "\n")
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, "&");

        const list: typeof allChannels = [];
        const regex = /#EXTINF:([^\n\r]+)[\r\n\s]*([^\n\r<#]+)/gi;
        let match;
        while ((match = regex.exec(cleanText)) !== null) {
          const extinfLine = match[1];
          let streamUrl = match[2].trim();

          const urlMatch = streamUrl.match(/(https?:\/\/[^\s"'<>]+)/i);
          if (urlMatch) {
            streamUrl = urlMatch[1];
          } else {
            continue;
          }

          const groupMatch = extinfLine.match(/group-title="([^"]*)"/i);
          const group = groupMatch ? groupMatch[1] : "Truyền Hình";

          const logoMatch = extinfLine.match(/tvg-logo="([^"]*)"/i);
          const logo = logoMatch ? logoMatch[1] : "";

          const commaIndex = extinfLine.lastIndexOf(",");
          const name = commaIndex !== -1 ? extinfLine.substring(commaIndex + 1).trim() : "Kênh TV";

          list.push({
            name,
            logo: logo || "https://images.unsplash.com/photo-1593784991095-a205069470b6?w=100&auto=format&fit=crop&q=60",
            group,
            url: streamUrl,
          });
        }
        return list;
      };

      // Helper to parse standard M3U with Kodi DRM tags and VLC User-Agent tags
      const parseM3uChannels = (text: string) => {
        const list: typeof allChannels = [];
        const lines = text.split(/\r?\n/);
        let currentGroup = "Truyền Hình";
        let currentLogo = "";
        let currentName = "";
        let currentKey = "";
        let currentLicenseType = "";
        let currentUserAgent = "";

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line.startsWith("#EXTINF:")) {
            const groupMatch = line.match(/group-title="([^"]*)"/i);
            if (groupMatch) {
              currentGroup = groupMatch[1];
            }
            const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
            if (logoMatch) {
              currentLogo = logoMatch[1];
            }
            const uaMatch = line.match(/(?:http-)?user-agent="([^"]*)"/i);
            if (uaMatch) {
              currentUserAgent = uaMatch[1];
            }
            const commaIndex = line.lastIndexOf(",");
            if (commaIndex !== -1) {
              currentName = line.substring(commaIndex + 1).trim();
            }
          } else if (line.match(/(?:#KODIPROP:)?(?:inputstream\.adaptive\.)?license_key\s*=\s*(.+)/i)) {
            const keyMatch = line.match(/(?:#KODIPROP:)?(?:inputstream\.adaptive\.)?license_key\s*=\s*(.+)/i);
            if (keyMatch) {
              currentKey = keyMatch[1].trim();
            }
          } else if (line.match(/(?:#KODIPROP:)?(?:inputstream\.adaptive\.)?license_type\s*=\s*(.+)/i)) {
            const typeMatch = line.match(/(?:#KODIPROP:)?(?:inputstream\.adaptive\.)?license_type\s*=\s*(.+)/i);
            if (typeMatch) {
              currentLicenseType = typeMatch[1].trim();
            }
          } else if (line.match(/(?:#EXTVLCOPT:)?(?:http-user-agent|user-agent)\s*=\s*(.+)/i)) {
            const uaMatch = line.match(/(?:#EXTVLCOPT:)?(?:http-user-agent|user-agent)\s*=\s*(.+)/i);
            if (uaMatch) {
              currentUserAgent = uaMatch[1].trim();
            }
          } else if (line.startsWith("#EXTHTTP:")) {
            try {
              const obj = JSON.parse(line.replace("#EXTHTTP:", "").trim());
              if (obj["User-Agent"]) currentUserAgent = obj["User-Agent"];
            } catch {}
          } else if (line && !line.startsWith("#") && (line.startsWith("http://") || line.startsWith("https://") || line.startsWith("/"))) {
            if (currentName || line) {
              list.push({
                name: currentName || "Kênh LiveTV",
                logo: currentLogo || "https://images.unsplash.com/photo-1593784991095-a205069470b6?w=100&auto=format&fit=crop&q=60",
                group: currentGroup,
                url: line,
                drmKey: currentKey || undefined,
                licenseType: currentLicenseType || undefined,
                userAgent: currentUserAgent || undefined,
              });
            }
            currentName = "";
            currentLogo = "";
            currentKey = "";
            currentLicenseType = "";
            currentUserAgent = "";
          }
        }
        return list;
      };

      for (const url of candidateUrls) {
        try {
          const resp = await fetch(url, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
            redirect: "follow",
          });

          if (resp.ok) {
            const content = await resp.text();
            const trimmed = content.trim();

            let parsed: typeof allChannels = [];
            if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
              try {
                parsed = parseJsonChannels(JSON.parse(trimmed));
              } catch (e) {}
            }

            if (parsed.length === 0 && (content.includes("<!DOCTYPE") || content.includes("<html") || content.includes("<div"))) {
              parsed = parseHtmlExtinfChannels(content);
            }

            if (parsed.length === 0) {
              parsed = parseM3uChannels(content);
            }

            allChannels.push(...parsed);

            // If user specifically requested one URL, break early
            if (requestedUrl && parsed.length > 0) {
              break;
            }
          }
        } catch (e) {
          // Continue
        }
      }

      // Deduplicate channels by URL or name
      const uniqueChannels: typeof allChannels = [];
      const seen = new Set<string>();
      for (const ch of allChannels) {
        const key = `${ch.name}_${ch.url}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueChannels.push(ch);
        }
      }

      res.json({ success: true, count: uniqueChannels.length, channels: uniqueChannels });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Stream proxy endpoint to bypass CORS, Mixed Content, and enforce custom User-Agent (e.g. Dalvik/2.1.0)
  app.all("/api/tv/stream-proxy", async (req, res) => {
    // Handle CORS preflight
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Range, User-Agent, X-Custom-UA, Authorization, Accept");
    res.setHeader("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges, Content-Type");

    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }

    try {
      const targetUrl = req.query.url as string;
      const customUA =
        (req.query.ua as string) ||
        (req.headers["x-custom-ua"] as string) ||
        "Dalvik/2.1.0 (Linux; U; Android 10; Build/QP1A.190711.020)";

      if (!targetUrl || !targetUrl.startsWith("http")) {
        return res.status(400).send("Invalid stream URL");
      }

      const forwardHeaders: Record<string, string> = {
        "User-Agent": customUA,
        "Accept": "*/*",
      };

      if (req.headers.range) {
        forwardHeaders["Range"] = req.headers.range;
      }

      const upstreamRes = await fetch(targetUrl, {
        method: req.method === "HEAD" ? "HEAD" : "GET",
        headers: forwardHeaders,
        redirect: "follow",
      });

      if (!upstreamRes.ok && upstreamRes.status !== 206) {
        return res
          .status(upstreamRes.status)
          .send(`Upstream stream error (${upstreamRes.status})`);
      }

      let contentType = upstreamRes.headers.get("content-type") || "application/octet-stream";
      if (targetUrl.includes(".mpd") && !contentType.includes("xml")) {
        contentType = "application/dash+xml";
      } else if (targetUrl.includes(".m3u8") && !contentType.includes("mpegurl")) {
        contentType = "application/vnd.apple.mpegurl";
      }

      res.setHeader("Content-Type", contentType);

      if (upstreamRes.headers.get("accept-ranges")) {
        res.setHeader("Accept-Ranges", upstreamRes.headers.get("accept-ranges")!);
      }
      if (upstreamRes.headers.get("content-range")) {
        res.setHeader("Content-Range", upstreamRes.headers.get("content-range")!);
      }
      if (upstreamRes.headers.get("content-length")) {
        res.setHeader("Content-Length", upstreamRes.headers.get("content-length")!);
      }

      res.status(upstreamRes.status);

      // Handle M3U8 Playlist rewriting so nested segment URLs pass through proxy with custom UA
      if (contentType.includes("mpegurl") || targetUrl.includes(".m3u8")) {
        const playlistText = await upstreamRes.text();
        const baseUrl = new URL(targetUrl);
        const lines = playlistText.split(/\r?\n/);
        const rewritten = lines.map((line) => {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith("#")) {
            try {
              const absoluteSegmentUrl = new URL(trimmed, baseUrl.href).href;
              return `/api/tv/stream-proxy?url=${encodeURIComponent(absoluteSegmentUrl)}&ua=${encodeURIComponent(customUA)}`;
            } catch (e) {
              return line;
            }
          }
          return line;
        });

        return res.send(rewritten.join("\n"));
      }

      // Handle MPD XML manifest: inject <BaseURL> so DASH players properly resolve relative segment paths
      if (contentType.includes("dash+xml") || contentType.includes("xml") || targetUrl.includes(".mpd")) {
        const mpdText = await upstreamRes.text();
        if (mpdText.includes("<MPD") && !mpdText.includes("<BaseURL>http")) {
          const baseUrlStr = targetUrl.substring(0, targetUrl.lastIndexOf("/") + 1);
          const injectedMpd = mpdText.replace(
            /(<MPD[^>]*>)/i,
            `$1\n  <BaseURL>${baseUrlStr}</BaseURL>`
          );
          return res.send(injectedMpd);
        }
        return res.send(mpdText);
      }

      // Stream binary data for DASH MPD segments (m4s/mp4), TS, AAC
      const arrayBuffer = await upstreamRes.arrayBuffer();
      return res.send(Buffer.from(arrayBuffer));
    } catch (err: any) {
      return res.status(500).send(`Stream Proxy Error: ${err.message}`);
    }
  });

  // Helper function to scrape real-time live search results directly from YouTube
  async function scrapeYouTubeSearch(query: string) {
    try {
      const url = "https://www.youtube.com/results?search_query=" + encodeURIComponent(query) + "&persist_gl=1&gl=VN&hl=vi";
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(url, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
          "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Cookie": "CONSENT=YES+cb.20210328-04-p0.en+FX+900; SOCS=CAI"
        }
      }).finally(() => clearTimeout(timeout));

      if (res.status >= 300 && res.status < 400) {
        return { channels: [], items: [] };
      }
      const html = await res.text();
      const match = html.match(/var ytInitialData = ({.*?});<\/script>/s) || html.match(/ytInitialData = ({.*?});/s);
      if (!match) return { channels: [], items: [] };
      
      const data = JSON.parse(match[1]);
      const contents = data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
      if (!contents) return { channels: [], items: [] };
      
      const channels: any[] = [];
      const items: any[] = [];

      for (const section of contents) {
        const itemSection = section.itemSectionRenderer?.contents;
        if (!itemSection) continue;
        for (const item of itemSection) {
          // Channel Renderer
          if (item.channelRenderer) {
            const c = item.channelRenderer;
            const channelId = c.channelId || c.navigationEndpoint?.browseEndpoint?.browseId || "";
            const title = c.title?.simpleText || c.title?.runs?.[0]?.text || "Kênh YouTube";
            const handle = c.subscriberCountText?.simpleText || "";
            const subscribers = c.subscriberCountText?.simpleText || c.videoCountText?.simpleText || "";
            const videoCount = c.videoCountText?.runs?.[0]?.text || "";
            const description = c.descriptionSnippet?.runs?.[0]?.text || "";
            let avatarUrl = c.thumbnail?.thumbnails?.[c.thumbnail.thumbnails.length - 1]?.url || "";
            if (avatarUrl && avatarUrl.startsWith("//")) avatarUrl = "https:" + avatarUrl;

            channels.push({
              id: channelId,
              title,
              handle,
              subscribers,
              videoCount,
              description,
              avatarUrl
            });
          }

          // Video Renderer
          if (item.videoRenderer) {
            const video = item.videoRenderer;
            const videoId = video.videoId;
            if (!videoId) continue;
            
            const title = video.title?.runs?.[0]?.text || video.title?.simpleText || "Video YouTube";
            const channelTitle = video.ownerText?.runs?.[0]?.text || "Kênh YouTube";
            const channelId = video.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || "";
            let channelAvatar = video.channelThumbnailSupportedRenderers?.channelThumbnailWithRippleRenderer?.thumbnail?.thumbnails?.[0]?.url || "";
            if (channelAvatar && channelAvatar.startsWith("//")) channelAvatar = "https:" + channelAvatar;

            const publishedAt = video.publishedTimeText?.simpleText || "Mới đây";
            const viewCount = video.viewCountText?.simpleText || "";
            let lengthText = video.lengthText?.simpleText || "";
            
            // Check if live stream
            const badges = video.badges || [];
            const isLive = badges.some((b: any) => {
              const label = b.metadataBadgeRenderer?.label?.toLowerCase() || '';
              return label.includes('live') || label.includes('trực tiếp');
            }) || (lengthText === "" && (viewCount.includes('đang xem') || viewCount.includes('watching') || video.upcomingEventData));

            if (isLive) {
              lengthText = 'LIVE';
            }

            const thumbnail = video.thumbnail?.thumbnails?.[video.thumbnail.thumbnails.length - 1]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
            
            items.push({
              id: videoId,
              title,
              channelTitle,
              channelId,
              channelAvatar,
              publishedAt,
              viewCount,
              duration: lengthText,
              thumbnailUrl: thumbnail,
              category: isLive ? 'live' : 'trending'
            });
          }
        }
      }

      // Sort items so live streams appear first
      items.sort((a, b) => {
        if (a.duration === 'LIVE' && b.duration !== 'LIVE') return -1;
        if (a.duration !== 'LIVE' && b.duration === 'LIVE') return 1;
        return 0;
      });

      return { channels, items };
    } catch (err) {
      console.error("Scrape YouTube Search error:", err);
      return { channels: [], items: [] };
    }
  }

  // 7. YouTube Real Search API Endpoint (Direct YouTube Live Extraction)
  app.get("/api/youtube/search", async (req, res) => {
    const query = String(req.query.q || "").trim();
    if (!query) {
      return res.json({ channels: [], items: [] });
    }

    // Direct YouTube Search Scraper
    let liveData = await scrapeYouTubeSearch(query);
    
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

    if (liveData.items.length > 0 || liveData.channels.length > 0) {
      return res.json(liveData);
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

  // 8. YouTube Channel Details Endpoint
  app.get("/api/youtube/channel", async (req, res) => {
    const channelId = String(req.query.id || "").trim();
    const channelName = String(req.query.name || "").trim();

    if (!channelId && !channelName) {
      return res.json({ channel: null, items: [] });
    }

    try {
      let url = "";
      if (channelId && channelId.startsWith("UC")) {
        url = `https://www.youtube.com/channel/${channelId}/streams`;
      } else if (channelId) {
        url = `https://www.youtube.com/channel/${channelId}`;
      } else {
        url = `https://www.youtube.com/results?search_query=${encodeURIComponent(channelName + " live")}`;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      const fetchRes = await fetch(url, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Cookie": "CONSENT=YES+cb.20210328-04-p0.en+FX+900; SOCS=CAI"
        }
      }).finally(() => clearTimeout(timeout));

      if (fetchRes.status >= 300 && fetchRes.status < 400) {
        return res.json({ channel: { id: channelId, title: channelName }, items: [] });
      }

      const html = await fetchRes.text();
      const match = html.match(/var ytInitialData = ({.*?});<\/script>/s) || html.match(/ytInitialData = ({.*?});/s);

      let channelObj = {
        id: channelId || "channel_custom",
        title: channelName || "Kênh YouTube",
        subscribers: "Người dùng đăng ký",
        description: "",
        avatarUrl: "",
        bannerUrl: "",
      };

      let channelVideos: any[] = [];

      if (match) {
        try {
          const data = JSON.parse(match[1]);
          const metadata = data.metadata?.channelMetadataRenderer;
          if (metadata) {
            channelObj.title = metadata.title || channelObj.title;
            channelObj.description = metadata.description || "";
            channelObj.avatarUrl = metadata.avatar?.thumbnails?.[0]?.url || "";
          }

          const header = data.header?.c4TabbedHeaderRenderer || data.header?.pageHeaderRenderer;
          if (header) {
            if (header.subscriberCountText) {
              channelObj.subscribers = header.subscriberCountText.simpleText || header.subscriberCountText.runs?.[0]?.text || "";
            }
            if (header.banner?.thumbnails?.[0]?.url) {
              channelObj.bannerUrl = header.banner.thumbnails[0].url;
            }
          }

          const extractVideosFromTabs = (obj: any) => {
            if (!obj || typeof obj !== 'object') return;
            if (obj.videoRenderer) {
              const video = obj.videoRenderer;
              const videoId = video.videoId;
              if (videoId && !channelVideos.some(v => v.id === videoId)) {
                const title = video.title?.runs?.[0]?.text || video.title?.simpleText || "Video YouTube";
                const cTitle = video.ownerText?.runs?.[0]?.text || channelObj.title;
                const cId = video.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || channelObj.id;
                let cAvatar = video.channelThumbnailSupportedRenderers?.channelThumbnailWithRippleRenderer?.thumbnail?.thumbnails?.[0]?.url || channelObj.avatarUrl;
                if (cAvatar && cAvatar.startsWith("//")) cAvatar = "https:" + cAvatar;

                const publishedAt = video.publishedTimeText?.simpleText || "Mới đây";
                const viewCount = video.viewCountText?.simpleText || "";
                let lengthText = video.lengthText?.simpleText || "";

                const badges = video.badges || [];
                const isLive = badges.some((b: any) => {
                  const label = b.metadataBadgeRenderer?.label?.toLowerCase() || '';
                  return label.includes('live') || label.includes('trực tiếp');
                }) || (lengthText === "" && (viewCount.includes('đang xem') || viewCount.includes('watching') || video.upcomingEventData));

                if (isLive) {
                  lengthText = 'LIVE';
                }

                const thumbnail = video.thumbnail?.thumbnails?.[video.thumbnail.thumbnails.length - 1]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

                channelVideos.push({
                  id: videoId,
                  title,
                  channelTitle: cTitle,
                  channelId: cId,
                  channelAvatar: cAvatar,
                  publishedAt,
                  viewCount,
                  duration: lengthText,
                  thumbnailUrl: thumbnail,
                  category: isLive ? 'live' : 'trending'
                });
              }
            }
            for (const key of Object.keys(obj)) {
              if (typeof obj[key] === 'object' && obj[key] !== null) {
                extractVideosFromTabs(obj[key]);
              }
            }
          };

          extractVideosFromTabs(data);
        } catch (parseErr) {
          console.error("Channel ytInitialData parse error:", parseErr);
        }
      }

      // If no videos found from direct channel page, fallback to search with strict channel name filtering
      if (channelVideos.length === 0) {
        const searchQuery = `${channelObj.title} live`;
        const searchData = await scrapeYouTubeSearch(searchQuery);
        const targetTitleNorm = channelObj.title.toLowerCase().replace(/\s+/g, '');
        const filtered = searchData.items.filter(item => {
          const itemChanNorm = (item.channelTitle || '').toLowerCase().replace(/\s+/g, '');
          return itemChanNorm.includes(targetTitleNorm) || targetTitleNorm.includes(itemChanNorm);
        });

        channelVideos = filtered.length > 0 ? filtered : searchData.items.slice(0, 10);
      }

      // Sort so LIVE appears first
      channelVideos.sort((a, b) => {
        if (a.duration === 'LIVE' && b.duration !== 'LIVE') return -1;
        if (a.duration !== 'LIVE' && b.duration === 'LIVE') return 1;
        return 0;
      });

      return res.json({
        channel: channelObj,
        items: channelVideos,
      });
    } catch (err: any) {
      console.error("Fetch channel error:", err);
      return res.json({ channel: null, items: [] });
    }
  });

  app.get("/api/youtube/trending", async (req, res) => {
    const category = String(req.query.category || "all").trim();
    
    // Map category to search query for live YouTube trending videos
    let query = "trending music nhac tre viet nam hot";
    if (category === "gaming") query = "trending gaming việt nam";
    else if (category === "news") query = "tin tức thời sự hôm nay";
    else if (category === "movies") query = "phim ngắn hài hước việt nam";
    else if (category === "shorts") query = "shorts triệu view việt nam";

    const liveData = await scrapeYouTubeSearch(query);
    if (liveData.items.length > 0) {
      return res.json({ items: liveData.items });
    }

    return res.json({ items: [] });
  });

  // Vite middleware for development or fallback to production static files
  const isProd = process.env.NODE_ENV === "production";
  
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🎬 Gấu Cinema HD Web server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
