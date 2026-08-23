var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_node_dns = __toESM(require("node:dns"), 1);
var import_cors = __toESM(require("cors"), 1);
var import_vite = require("vite");
try {
  import_node_dns.default.setDefaultResultOrder("ipv4first");
} catch (e) {
}
var LRUCache = class {
  constructor(max = 500) {
    this.max = max;
    this.cache = /* @__PURE__ */ new Map();
  }
  get(key) {
    const item = this.cache.get(key);
    if (item === void 0) return void 0;
    this.cache.delete(key);
    this.cache.set(key, item);
    return item;
  }
  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.max) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== void 0) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(key, value);
    return this;
  }
  has(key) {
    return this.cache.has(key);
  }
  delete(key) {
    return this.cache.delete(key);
  }
  clear() {
    this.cache.clear();
  }
  get size() {
    return this.cache.size;
  }
};
var proxyCache = new LRUCache(500);
var imageMemoryCache = new LRUCache(400);
var CACHE_TTL_MS = 3 * 60 * 1e3;
async function fetchWithTimeout(url, timeoutMs = 4e3) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "application/json, text/plain, */*"
      }
    });
    clearTimeout(timer);
    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}`);
    }
    const data = await res.json();
    return data;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}
async function startServer() {
  const app = (0, import_express.default)();
  const PORT = 3e3;
  app.use((0, import_cors.default)({
    origin: (origin, callback) => {
      if (!origin || origin === "null" || origin.includes("localhost") || origin.includes("capacitor://") || origin.includes("run.app")) {
        callback(null, true);
      } else {
        callback(null, true);
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
    credentials: true
  }));
  app.use(import_express.default.json());
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "G\u1EA5u Cinema API Server is healthy", timestamp: Date.now() });
  });
  app.post("/api/system/apis/ping", async (req, res) => {
    let { url, timeoutMs = 8e3 } = req.body || {};
    if (!url || typeof url !== "string" || !url.startsWith("http")) {
      return res.status(400).json({
        ok: false,
        status: "down",
        statusCode: 400,
        latencyMs: 0,
        message: "URL kh\xF4ng h\u1EE3p l\u1EC7 ho\u1EB7c thi\u1EBFu giao th\u1EE9c http/https"
      });
    }
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
    const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, 2e4));
    try {
      let response = await fetch(targetUrl, {
        method: "GET",
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept: "application/json, text/plain, */*"
        }
      });
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
                Accept: "application/json, text/plain, */*"
              }
            });
            if (probeRes.ok) {
              response = probeRes;
              targetUrl = probeUrl;
              break;
            }
          } catch {
          }
        }
      }
      clearTimeout(timer);
      const latencyMs = Date.now() - startTime;
      const statusCode = response.status;
      const isOk = response.ok;
      let status = "down";
      let message = `M\xE3 ph\u1EA3n h\u1ED3i: ${statusCode} ${response.statusText}`;
      if (isOk) {
        if (latencyMs < 800) {
          status = "live";
          message = `Ho\u1EA1t \u0111\u1ED9ng t\u1ED1t (${latencyMs}ms) - HTTP ${statusCode}`;
        } else if (latencyMs < 2500) {
          status = "slow";
          message = `Ph\u1EA3n h\u1ED3i ch\u1EADm (${latencyMs}ms) - HTTP ${statusCode}`;
        } else {
          status = "slow";
          message = `\u0110\u1ED9 tr\u1EC5 cao (${latencyMs}ms) - HTTP ${statusCode}`;
        }
      } else {
        if (statusCode === 404 || statusCode === 403 || statusCode === 301 || statusCode === 302) {
          status = latencyMs < 1e3 ? "live" : "slow";
          message = `M\xE1y ch\u1EE7 ph\u1EA3n h\u1ED3i ${statusCode} (${latencyMs}ms)`;
        } else {
          status = "down";
          message = `L\u1ED7i m\xE1y ch\u1EE7 upstream: HTTP ${statusCode} (${response.statusText || "Error"})`;
        }
      }
      return res.json({
        ok: isOk || status === "live" || status === "slow",
        status,
        statusCode,
        latencyMs,
        message,
        url: targetUrl
      });
    } catch (err) {
      clearTimeout(timer);
      const latencyMs = Date.now() - startTime;
      const isTimeout = err.name === "AbortError" || err.message?.includes("aborted");
      const message = isTimeout ? `Qu\xE1 th\u1EDDi gian ph\u1EA3n h\u1ED3i (Timeout > ${timeoutMs}ms)` : `M\u1EA5t k\u1EBFt n\u1ED1i: ${err.message || "Kh\xF4ng th\u1EC3 k\u1EBFt n\u1ED1i \u0111\u1EBFn m\xE1y ch\u1EE7 ngu\u1ED3n"}`;
      return res.json({
        ok: false,
        status: "down",
        statusCode: isTimeout ? 504 : 502,
        latencyMs,
        message,
        url
      });
    }
  });
  app.get("/api/proxy/kkphim/*", async (req, res) => {
    const endpoint = req.params[0];
    const query = new URLSearchParams(req.query).toString();
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
    } catch (err) {
      if (cached) return res.json(cached.data);
      return res.status(502).json({ status: false, msg: `KKPhim error: ${err.message}` });
    }
  });
  app.get("/api/proxy/ophim/*", async (req, res) => {
    const endpoint = req.params[0];
    const query = new URLSearchParams(req.query).toString();
    const cacheKey = `ophim:${endpoint}?${query}`;
    const cached = proxyCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return res.json(cached.data);
    }
    const mirrors = [
      `https://ophim1.com/${endpoint}${query ? `?${query}` : ""}`,
      `https://ophim17.cc/${endpoint}${query ? `?${query}` : ""}`,
      `https://ophim1.net/${endpoint}${query ? `?${query}` : ""}`
    ];
    for (const url of mirrors) {
      try {
        const data = await fetchWithTimeout(url, 4e3);
        if (data && (data.status === true || data.status === "success" || data.items || data.data?.items || data.movie)) {
          proxyCache.set(cacheKey, { data, timestamp: Date.now() });
          return res.json(data);
        }
      } catch {
      }
    }
    if (cached) return res.json(cached.data);
    return res.status(502).json({ status: false, msg: "OPhim upstreams unavailable" });
  });
  app.get("/api/proxy/nguonc/*", async (req, res) => {
    const endpoint = req.params[0];
    const query = new URLSearchParams(req.query).toString();
    const cacheKey = `nguonc:${endpoint}?${query}`;
    const cached = proxyCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return res.json(cached.data);
    }
    try {
      const normalizedEndpoint = endpoint.startsWith("api/") ? endpoint : `api/${endpoint}`;
      const url = `https://phim.nguonc.com/${normalizedEndpoint}${query ? `?${query}` : ""}`;
      const data = await fetchWithTimeout(url, 5e3);
      proxyCache.set(cacheKey, { data, timestamp: Date.now() });
      return res.json(data);
    } catch (err) {
      if (cached) return res.json(cached.data);
      return res.status(502).json({ status: false, msg: `NguonC error: ${err.message}` });
    }
  });
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
      fetchWithTimeout(`https://phimapi.com/v1/api/tim-kiem?keyword=${encoded}&limit=16`, 4e3).then((d) => ({ source: "kkphim", data: d })).catch(() => null),
      fetchWithTimeout(`https://ophim1.com/v1/api/tim-kiem?keyword=${encoded}&limit=16`, 4e3).then((d) => ({ source: "ophim", data: d })).catch(() => null),
      fetchWithTimeout(`https://phim.nguonc.com/api/films/search?keyword=${encoded}`, 4500).then((d) => ({ source: "nguonc", data: d })).catch(() => null)
    ];
    const results = await Promise.all(tasks);
    const combinedMap = /* @__PURE__ */ new Map();
    for (const r of results) {
      if (!r || !r.data) continue;
      const src = r.source;
      const raw = r.data;
      if (raw.data?.items && Array.isArray(raw.data.items)) {
        for (const item of raw.data.items) {
          if (!item.slug) continue;
          if (!combinedMap.has(item.slug)) {
            combinedMap.set(item.slug, {
              ...item,
              source: src,
              sourceLabel: src === "kkphim" ? "KKPhim" : "OPhim"
            });
          }
        }
      } else if (raw.items && Array.isArray(raw.items)) {
        for (const item of raw.items) {
          if (!item.slug) continue;
          if (!combinedMap.has(item.slug)) {
            combinedMap.set(item.slug, {
              ...item,
              source: src,
              sourceLabel: src === "nguonc" ? "NguonC" : src === "kkphim" ? "KKPhim" : "OPhim"
            });
          }
        }
      }
    }
    const payload = {
      status: true,
      items: Array.from(combinedMap.values()),
      total: combinedMap.size
    };
    proxyCache.set(cacheKey, { data: payload, timestamp: Date.now() });
    return res.json(payload);
  });
  app.get("/api/proxy/generic", async (req, res) => {
    const b64url = req.query.url;
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
      const data = await fetchWithTimeout(url, 6e4);
      proxyCache.set(cacheKey, { data, timestamp: Date.now() });
      return res.json(data);
    } catch (err) {
      if (err.message && err.message.includes("404")) {
        console.warn(`[Proxy 404] Upstream not found for ${url}`);
        return res.status(404).json({ error: "Upstream not found", status: 404 });
      }
      console.warn(`[Proxy Warning] ${url}:`, err.message);
      if (cached) return res.json(cached.data);
      return res.status(502).json({ error: err.message });
    }
  });
  app.get("/api/proxy/image", async (req, res) => {
    let imageUrl = req.query.url;
    if (!imageUrl) {
      return res.status(400).send("Missing image url");
    }
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
    const candidateUrls = [];
    const mdMatch = imageUrl.match(/(?:mangadex\.network|uploads\.mangadex\.org)\/(data|data-saver)\/([a-f0-9]+)\/([^?#]+)/i);
    if (mdMatch) {
      const [, type, hash, file] = mdMatch;
      const officialUploads = `https://uploads.mangadex.org/${type}/${hash}/${file}`;
      candidateUrls.push(officialUploads);
      if (imageUrl !== officialUploads) {
        candidateUrls.push(imageUrl);
      }
      if (type === "data") {
        candidateUrls.push(`https://uploads.mangadex.org/data-saver/${hash}/${file}`);
      }
    } else {
      candidateUrls.push(imageUrl);
    }
    const mdCoverMatch = imageUrl.match(/uploads\.mangadex\.org\/covers\/([a-f0-9-]+)\/([^?#]+)/i);
    if (mdCoverMatch) {
      const [, mangaId, fileName] = mdCoverMatch;
      if (fileName.endsWith(".256.jpg") || fileName.endsWith(".512.jpg")) {
        const rawFileName = fileName.replace(/\.(256|512)\.jpg$/, "");
        candidateUrls.push(`https://uploads.mangadex.org/covers/${mangaId}/${rawFileName}`);
      }
    }
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
        const timer = setTimeout(() => controller.abort(), 8e3);
        const upstream = await fetch(urlToFetch, {
          signal: controller.signal,
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            "Referer": "https://mangadex.org/"
          }
        });
        clearTimeout(timer);
        if (upstream.ok) {
          const contentType = upstream.headers.get("content-type") || "image/jpeg";
          const arrayBuffer = await upstream.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          imageMemoryCache.set(imageUrl, { buffer, contentType });
          res.setHeader("Content-Type", contentType);
          res.setHeader("Cache-Control", "public, max-age=2592000, immutable");
          res.setHeader("X-Cache", "MISS");
          return res.send(buffer);
        }
      } catch (err) {
      }
    }
    return res.status(502).send("Failed to fetch image upstream across all fallback sources");
  });
  app.get("/api/proxy/movie/*", async (req, res) => {
    const endpoint = req.params[0];
    const query = new URLSearchParams(req.query).toString();
    const cacheKey = `movie:${endpoint}?${query}`;
    const cached = proxyCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return res.json(cached.data);
    }
    const upstreamUrls = [
      `https://ophim1.com/${endpoint}${query ? `?${query}` : ""}`,
      `https://phimapi.com/${endpoint}${query ? `?${query}` : ""}`,
      `https://ophim17.cc/${endpoint}${query ? `?${query}` : ""}`
    ];
    if (endpoint.startsWith("phim/")) {
      const slug = endpoint.replace(/^phim\//, "").split("?")[0];
      upstreamUrls.push(`https://ophim1.com/v1/api/phim/${slug}`);
      upstreamUrls.push(`https://phim.nguonc.com/api/film/${slug}`);
    }
    if (endpoint.includes("tim-kiem") && req.query.keyword) {
      const keyword = encodeURIComponent(String(req.query.keyword));
      upstreamUrls.push(`https://phim.nguonc.com/api/films/search?keyword=${keyword}`);
    }
    let lastError = null;
    for (const targetUrl of upstreamUrls) {
      try {
        const data = await fetchWithTimeout(targetUrl, 3500);
        if (data && (data.status === true || data.status === "success" || data.items || data.data?.items || data.movie)) {
          proxyCache.set(cacheKey, { data, timestamp: Date.now() });
          return res.json(data);
        }
      } catch (err) {
        lastError = err;
      }
    }
    if (cached) {
      return res.json(cached.data);
    }
    console.warn(`[Proxy Warning] All upstreams failed for: ${endpoint}`, lastError?.message);
    if (endpoint.includes("phim/")) {
      return res.status(404).json({ status: false, msg: "Kh\xF4ng t\xECm th\u1EA5y phim", movie: null, episodes: [] });
    }
    return res.json({
      status: true,
      items: [],
      data: { items: [], params: { pagination: { totalItems: 0, totalItemsPerPage: 24, currentPage: 1, totalPages: 1 } } }
    });
  });
  app.get("/api/tv/channels", async (req, res) => {
    try {
      const requestedUrl = req.query.url;
      const candidateUrls = [];
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
          "https://raw.githubusercontent.com/vuminhthanh12/vuminhthanh12/main/vmttv"
        );
      }
      const allChannels = [];
      const parseJsonChannels = (data) => {
        const list = [];
        if (!data) return list;
        if (data.channels && Array.isArray(data.channels)) {
          for (const ch of data.channels) {
            if (ch.url) {
              list.push({
                name: ch.name || "K\xEAnh TV",
                logo: ch.logo || ch.image?.url || "",
                group: ch.group || "Truy\u1EC1n H\xECnh",
                url: ch.url,
                drmKey: ch.drmKey,
                licenseType: ch.licenseType,
                userAgent: ch.userAgent || ch.http_user_agent
              });
            }
          }
        }
        if (data.groups && Array.isArray(data.groups)) {
          for (const grp of data.groups) {
            const groupName = grp.name || "K\xEAnh TV";
            if (grp.channels && Array.isArray(grp.channels)) {
              for (const ch of grp.channels) {
                const chName = ch.name || "K\xEAnh TV";
                const logo = ch.image?.url || ch.logo || "";
                const chUA = ch.userAgent || ch.http_user_agent || ch.headers?.["User-Agent"];
                const findStreamUrls = (obj) => {
                  let found = [];
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
                      userAgent: chUA
                    });
                    break;
                  }
                }
              }
            }
          }
        }
        return list;
      };
      const parseHtmlExtinfChannels = (html) => {
        const cleanText = html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<\/div>/gi, "\n").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
        const list = [];
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
          const group = groupMatch ? groupMatch[1] : "Truy\u1EC1n H\xECnh";
          const logoMatch = extinfLine.match(/tvg-logo="([^"]*)"/i);
          const logo = logoMatch ? logoMatch[1] : "";
          const commaIndex = extinfLine.lastIndexOf(",");
          const name = commaIndex !== -1 ? extinfLine.substring(commaIndex + 1).trim() : "K\xEAnh TV";
          list.push({
            name,
            logo: logo || "https://images.unsplash.com/photo-1593784991095-a205069470b6?w=100&auto=format&fit=crop&q=60",
            group,
            url: streamUrl
          });
        }
        return list;
      };
      const parseM3uChannels = (text) => {
        const list = [];
        const lines = text.split(/\r?\n/);
        let currentGroup = "Truy\u1EC1n H\xECnh";
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
            } catch {
            }
          } else if (line && !line.startsWith("#") && (line.startsWith("http://") || line.startsWith("https://") || line.startsWith("/"))) {
            if (currentName || line) {
              list.push({
                name: currentName || "K\xEAnh LiveTV",
                logo: currentLogo || "https://images.unsplash.com/photo-1593784991095-a205069470b6?w=100&auto=format&fit=crop&q=60",
                group: currentGroup,
                url: line,
                drmKey: currentKey || void 0,
                licenseType: currentLicenseType || void 0,
                userAgent: currentUserAgent || void 0
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
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            },
            redirect: "follow"
          });
          if (resp.ok) {
            const content = await resp.text();
            const trimmed = content.trim();
            let parsed = [];
            if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
              try {
                parsed = parseJsonChannels(JSON.parse(trimmed));
              } catch (e) {
              }
            }
            if (parsed.length === 0 && (content.includes("<!DOCTYPE") || content.includes("<html") || content.includes("<div"))) {
              parsed = parseHtmlExtinfChannels(content);
            }
            if (parsed.length === 0) {
              parsed = parseM3uChannels(content);
            }
            allChannels.push(...parsed);
            if (requestedUrl && parsed.length > 0) {
              break;
            }
          }
        } catch (e) {
        }
      }
      const uniqueChannels = [];
      const seen = /* @__PURE__ */ new Set();
      for (const ch of allChannels) {
        const key = `${ch.name}_${ch.url}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueChannels.push(ch);
        }
      }
      res.json({ success: true, count: uniqueChannels.length, channels: uniqueChannels });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
  app.all("/api/tv/stream-proxy", async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Range, User-Agent, X-Custom-UA, Authorization, Accept");
    res.setHeader("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges, Content-Type");
    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }
    try {
      const targetUrl = req.query.url;
      const customUA = req.query.ua || req.headers["x-custom-ua"] || "Dalvik/2.1.0 (Linux; U; Android 10; Build/QP1A.190711.020)";
      if (!targetUrl || !targetUrl.startsWith("http")) {
        return res.status(400).send("Invalid stream URL");
      }
      const forwardHeaders = {
        "User-Agent": customUA,
        "Accept": "*/*"
      };
      if (req.headers.range) {
        forwardHeaders["Range"] = req.headers.range;
      }
      if (targetUrl.includes("fptplay") || targetUrl.includes("vips-livecdn") || targetUrl.includes("seenow.vn")) {
        forwardHeaders["Origin"] = "https://fptplay.vn";
        forwardHeaders["Referer"] = "https://fptplay.vn/";
        forwardHeaders["X_ID"] = "Dalvik";
      }
      const upstreamRes = await fetch(targetUrl, {
        method: req.method === "HEAD" ? "HEAD" : "GET",
        headers: forwardHeaders,
        redirect: "follow"
      });
      if (!upstreamRes.ok && upstreamRes.status !== 206) {
        return res.status(upstreamRes.status).send(`Upstream stream error (${upstreamRes.status})`);
      }
      let contentType = upstreamRes.headers.get("content-type") || "application/octet-stream";
      if (targetUrl.includes(".mpd") && !contentType.includes("xml")) {
        contentType = "application/dash+xml";
      } else if (targetUrl.includes(".m3u8") && !contentType.includes("mpegurl")) {
        contentType = "application/vnd.apple.mpegurl";
      }
      res.setHeader("Content-Type", contentType);
      if (upstreamRes.headers.get("accept-ranges")) {
        res.setHeader("Accept-Ranges", upstreamRes.headers.get("accept-ranges"));
      }
      if (upstreamRes.headers.get("content-range")) {
        res.setHeader("Content-Range", upstreamRes.headers.get("content-range"));
      }
      if (upstreamRes.headers.get("content-length")) {
        res.setHeader("Content-Length", upstreamRes.headers.get("content-length"));
      }
      res.status(upstreamRes.status);
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
      if (contentType.includes("dash+xml") || contentType.includes("xml") || targetUrl.includes(".mpd")) {
        const mpdText = await upstreamRes.text();
        if (mpdText.includes("<MPD") && !mpdText.includes("<BaseURL>http")) {
          const baseUrlStr = targetUrl.substring(0, targetUrl.lastIndexOf("/") + 1);
          const injectedMpd = mpdText.replace(
            /(<MPD[^>]*>)/i,
            `$1
  <BaseURL>${baseUrlStr}</BaseURL>`
          );
          return res.send(injectedMpd);
        }
        return res.send(mpdText);
      }
      const arrayBuffer = await upstreamRes.arrayBuffer();
      return res.send(Buffer.from(arrayBuffer));
    } catch (err) {
      return res.status(500).send(`Stream Proxy Error: ${err.message}`);
    }
  });
  app.all("/api/tv/clearkey-license", async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Range, Accept, X-License-Url");
    res.setHeader("Access-Control-Expose-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }
    try {
      const targetUrl = req.query.url || req.headers["x-license-url"] || "https://vmttv.dpdns.org/AutoKey/";
      let rawBody = req.body;
      let bodyText = "";
      if (Buffer.isBuffer(rawBody)) {
        bodyText = rawBody.toString("utf-8");
      } else if (typeof rawBody === "object") {
        bodyText = JSON.stringify(rawBody);
      } else if (typeof rawBody === "string") {
        bodyText = rawBody;
      }
      if (!bodyText && req.query.kid) {
        bodyText = JSON.stringify({
          kids: [req.query.kid],
          type: "temporary"
        });
      }
      const upstreamRes = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 10; Build/QP1A.190711.020)",
          Accept: "application/json, text/plain, */*",
          Origin: "https://fptplay.vn",
          Referer: "https://fptplay.vn/"
        },
        body: bodyText || void 0
      });
      const responseText = await upstreamRes.text();
      res.setHeader("Content-Type", "application/json");
      if (upstreamRes.ok) {
        try {
          const parsed = JSON.parse(responseText);
          if (parsed && Array.isArray(parsed.keys) && parsed.keys.length > 0) {
            return res.json(parsed);
          }
        } catch (e) {
        }
      }
      try {
        if (bodyText) {
          const reqObj = JSON.parse(bodyText);
          if (reqObj && Array.isArray(reqObj.kids) && reqObj.kids.length > 0) {
            const originalKid = reqObj.kids[0];
            let altKid = "";
            if (originalKid.length < 32) {
              const clean = originalKid.replace(/-/g, "+").replace(/_/g, "/");
              const buf = Buffer.from(clean, "base64");
              altKid = buf.toString("hex");
            } else if (originalKid.length === 32) {
              const buf = Buffer.from(originalKid, "hex");
              altKid = buf.toString("base64url");
            }
            if (altKid) {
              const altBody = JSON.stringify({ kids: [altKid], type: "temporary" });
              const retryRes = await fetch(targetUrl, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "User-Agent": "Dalvik/2.1.0",
                  Origin: "https://fptplay.vn",
                  Referer: "https://fptplay.vn/"
                },
                body: altBody
              });
              if (retryRes.ok) {
                const retryText = await retryRes.text();
                const retryParsed = JSON.parse(retryText);
                if (retryParsed && Array.isArray(retryParsed.keys) && retryParsed.keys.length > 0) {
                  return res.json(retryParsed);
                }
              }
            }
          }
        }
      } catch (err2) {
      }
      return res.status(upstreamRes.status || 200).send(responseText || JSON.stringify({ keys: [] }));
    } catch (err) {
      return res.status(500).json({ error: err.message, keys: [] });
    }
  });
  async function scrapeYouTubeSearch(query, opts) {
    try {
      const url = "https://www.youtube.com/results?search_query=" + encodeURIComponent(query) + (opts?.liveOnly ? "&sp=EgJAAQ%3D%3D" : "") + "&persist_gl=1&gl=VN&hl=vi";
      const { data, apiKey, clientVersion } = await fetchYouTubePageDataFull(url);
      cachedInnertubeKey = apiKey || cachedInnertubeKey;
      cachedInnertubeVer = clientVersion || cachedInnertubeVer;
      if (!data) return { channels: [], items: [], nextToken: null };
      const items = extractAllVideos(data);
      const channels = [];
      const walkChannels = (obj) => {
        if (!obj || typeof obj !== "object") return;
        const c = obj.channelRenderer;
        if (c && c.channelId && !channels.some((x) => x.id === c.channelId)) {
          const channelId = c.channelId;
          const title = c.title?.simpleText || c.title?.runs?.[0]?.text || "K\xEAnh YouTube";
          const subscribers = c.subscriberCountText?.simpleText || c.subscriberCountText?.runs?.[0]?.text || "";
          const videoCount = c.videoCountText?.simpleText || c.videoCountText?.runs?.[0]?.text || "";
          const description = c.descriptionSnippet?.runs?.[0]?.text || "";
          let avatarUrl = c.thumbnail?.thumbnails?.[c.thumbnail.thumbnails.length - 1]?.url || "";
          if (avatarUrl && avatarUrl.startsWith("//")) avatarUrl = "https:" + avatarUrl;
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
          const val = obj[key];
          if (val && typeof val === "object") walkChannels(val);
        }
      };
      walkChannels(data);
      return { channels, items, nextToken: findNextContinuationToken(data) };
    } catch (err) {
      console.error("Scrape YouTube Search error:", err);
      return { channels: [], items: [], nextToken: null };
    }
  }
  const normChannelKey = (s) => (s || "").toLowerCase().replace(/\s+/g, "");
  async function fetchYouTubePageDataFull(url) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8e3);
      const res = await fetch(url, {
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Cookie": "CONSENT=YES+cb.20210328-04-p0.en+FX+900; SOCS=CAI"
        }
      }).finally(() => clearTimeout(timer));
      if (!res.ok) return { data: null };
      const html = await res.text();
      const match = html.match(/var ytInitialData = ({.*?});<\/script>/s) || html.match(/ytInitialData = ({.*?});/s);
      if (!match) return { data: null };
      return {
        data: JSON.parse(match[1]),
        apiKey: html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1],
        clientVersion: html.match(/"INNERTUBE_CONTEXT_CLIENT_VERSION":"([^"]+)"/)?.[1] || html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1]
      };
    } catch {
      return { data: null };
    }
  }
  async function fetchYouTubePageData(url) {
    const { data } = await fetchYouTubePageDataFull(url);
    return data;
  }
  function findNextContinuationToken(obj) {
    let token = null;
    const walk = (node) => {
      if (!node || typeof node !== "object" || token) return;
      const cir = node.continuationItemRenderer;
      const t = cir?.continuationEndpoint?.continuationCommand?.token || cir?.button?.buttonRenderer?.command?.continuationCommand?.token;
      if (typeof t === "string" && t.length > 10) {
        token = t;
        return;
      }
      for (const key of Object.keys(node)) {
        walk(node[key]);
      }
    };
    walk(obj);
    return token;
  }
  async function fetchInnertubeContinuation(token, apiKey, clientVersion, kind) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8e3);
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
          "X-YouTube-Client-Version": clientVersion || "2.20240801.00.00"
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: "WEB",
              clientVersion: clientVersion || "2.20240801.00.00",
              hl: "vi",
              gl: "VN"
            }
          },
          continuation: token
        })
      }).finally(() => clearTimeout(timer));
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }
  function extractVideoRenderers(obj, out = []) {
    if (!obj || typeof obj !== "object") return out;
    const raw = obj.videoRenderer || obj.gridVideoRenderer;
    if (raw && raw.videoId && !out.some((x) => x.videoId === raw.videoId)) {
      out.push(raw);
    }
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (val && typeof val === "object") extractVideoRenderers(val, out);
    }
    return out;
  }
  function collectLockupViewModels(obj, out = []) {
    if (!obj || typeof obj !== "object") return out;
    const lv = obj.lockupViewModel;
    if (lv && lv.contentId && !out.includes(lv)) out.push(lv);
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (val && typeof val === "object") collectLockupViewModels(val, out);
    }
    return out;
  }
  function mapLockupVideo(lockup) {
    if (!lockup || typeof lockup !== "object") return null;
    const contentType = String(lockup.contentType || "");
    if (contentType && !/VIDEO|LIVE/i.test(contentType)) return null;
    const vid = lockup.contentId || lockup.rendererContext?.commandContext?.onTap?.innertubeCommand?.watchEndpoint?.videoId;
    if (!vid) return null;
    const metaVm = lockup.metadata?.lockupMetadataViewModel;
    const title = metaVm?.title?.content || "Video YouTube";
    const sources = lockup.contentImage?.thumbnailViewModel?.image?.sources || [];
    const thumbnailUrl = sources[sources.length - 1]?.url || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
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
    let channelTitle = "";
    let channelAvatar = "";
    let viewCount = "";
    let publishedAt = "";
    const avSrcs = metaVm?.image?.avatarViewModel?.avatar?.image?.sources || [];
    if (avSrcs.length > 0) channelAvatar = avSrcs[avSrcs.length - 1]?.url || "";
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
    return {
      id: vid,
      title,
      channelTitle: channelTitle || "K\xEAnh YouTube",
      channelId: "",
      channelAvatar,
      publishedAt: publishedAt || "M\u1EDBi \u0111\xE2y",
      viewCount,
      duration: isLive ? "LIVE" : duration,
      thumbnailUrl,
      description: "",
      category: isLive ? "live" : "trending"
    };
  }
  function extractAllVideos(obj) {
    const items = extractVideoRenderers(obj).map((v) => mapChannelVideoRenderer(v, v.ownerText?.runs?.[0]?.text || "K\xEAnh YouTube")).filter(Boolean);
    const seen = new Set(items.map((i) => i.id));
    const lockItems = collectLockupViewModels(obj).map(mapLockupVideo).filter(Boolean);
    for (const li of lockItems) {
      if (!seen.has(li.id)) {
        seen.add(li.id);
        items.push(li);
      }
    }
    return items;
  }
  const PIPED_INSTANCES = [
    "https://pipedapi.kavin.rocks",
    "https://api.piped.privacydev.net",
    "https://pipedapi.adminforge.de"
  ];
  async function fetchPipedChannel(ucId) {
    for (const base of PIPED_INSTANCES) {
      try {
        const data = await fetchWithTimeout(`${base}/channels/${ucId}`, 6e3);
        if (!data?.relatedStreams) continue;
        const items = data.relatedStreams.map((s) => mapPipedStreamItem(s, data.name || "K\xEAnh YouTube", ucId)).filter(Boolean);
        const subsText = typeof data.subscriberCount === "number" && data.subscriberCount > 0 ? `${data.subscriberCount.toLocaleString("vi-VN")} ng\u01B0\u1EDDi \u0111\u0103ng k\xFD` : "";
        return {
          channel: {
            id: ucId,
            title: data.name || "K\xEAnh YouTube",
            subscribers: subsText,
            description: data.description || "",
            avatarUrl: data.avatarUrl || "",
            bannerUrl: data.bannerUrl || ""
          },
          items
        };
      } catch {
      }
    }
    return null;
  }
  function formatPipedDuration(sec) {
    if (!sec || sec <= 0) return "";
    const h = Math.floor(sec / 3600);
    const m = Math.floor(sec % 3600 / 60);
    const s = sec % 60;
    return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
  }
  function mapPipedStreamItem(s, fallbackChannelTitle, channelId) {
    const vid = String(s?.url || "").replace("/watch?v=", "").replace("/shorts/", "");
    if (!vid) return null;
    const isLive = Boolean(s?.livestream) || s?.duration === -1;
    return {
      id: vid,
      title: s.title || "Video YouTube",
      channelTitle: s.uploaderName || fallbackChannelTitle,
      channelId: s.uploaderUrl ? String(s.uploaderUrl).replace("/channel/", "") : channelId || "",
      channelAvatar: s.uploaderAvatar || "",
      publishedAt: s.uploadedDate || "M\u1EDBi \u0111\xE2y",
      viewCount: typeof s.views === "number" && s.views > 0 ? `${s.views.toLocaleString("vi-VN")} l\u01B0\u1EE3t xem` : "",
      duration: isLive ? "LIVE" : formatPipedDuration(s.duration),
      thumbnailUrl: s.thumbnail || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
      description: s.shortDescription || "",
      category: isLive ? "live" : "trending"
    };
  }
  let cachedInnertubeKey;
  let cachedInnertubeVer;
  const VIETNAM_CATEGORY_QUERIES = {
    all: [
      "video hot trend vi\u1EC7t nam h\xF4m nay",
      "th\u1ECBnh h\xE0nh vi\u1EC7t nam m\u1EDBi nh\u1EA5t",
      "tin t\u1EE9c gi\u1EA3i tr\xED vi\u1EC7t nam hot nh\u1EA5t",
      "top trending youtube vietnam"
    ],
    trending: [
      "th\u1ECBnh h\xE0nh youtube vi\u1EC7t nam h\xF4m nay",
      "video tri\u1EC7u view vi\u1EC7t nam m\u1EDBi nh\u1EA5t",
      "nh\u1EEFng video hot nh\u1EA5t vi\u1EC7t nam tu\u1EA7n n\xE0y",
      "xu h\u01B0\u1EDBng vi\u1EC7t nam h\xF4m nay"
    ],
    music_vn: [
      "nh\u1EA1c vi\u1EC7t nam m\u1EDBi nh\u1EA5t th\u1ECBnh h\xE0nh vpop",
      "top bxh nh\u1EA1c vi\u1EC7t hay nh\u1EA5t h\xF4m nay",
      "mv ca nh\u1EA1c vi\u1EC7t nam tri\u1EC7u view m\u1EDBi",
      "nh\u1EA1c tr\u1EBB acoustic chill vi\u1EC7t nam hay nh\u1EA5t",
      "nh\u1EA1c remix tiktok vi\u1EC7t nam hot trend"
    ],
    music: [
      "nh\u1EA1c vi\u1EC7t nam m\u1EDBi nh\u1EA5t th\u1ECBnh h\xE0nh vpop",
      "top b\xE0i h\xE1t vi\u1EC7t nam hay nh\u1EA5t",
      "ca kh\xFAc vi\u1EC7t nam tri\u1EC7u view m\u1EDBi ra m\u1EAFt",
      "nh\u1EA1c lofi vi\u1EC7t nam chill th\u01B0 gi\xE3n"
    ],
    news_vn: [
      "tin t\u1EE9c th\u1EDDi s\u1EF1 vi\u1EC7t nam 24h m\u1EDBi nh\u1EA5t h\xF4m nay",
      "tin n\xF3ng vi\u1EC7t nam vtv chuy\u1EC3n \u0111\u1ED9ng 24h",
      "tin t\u1EE9c vi\u1EC7t nam trong ng\xE0y h\xF4m nay",
      "b\u1EA3n tin th\u1EDDi s\u1EF1 vi\u1EC7t nam tr\u1EF1c ti\u1EBFp"
    ],
    news: [
      "tin t\u1EE9c th\u1EDDi s\u1EF1 vi\u1EC7t nam m\u1EDBi nh\u1EA5t",
      "tin n\xF3ng 24h vi\u1EC7t nam h\xF4m nay",
      "th\u1EDDi s\u1EF1 vtv24 tin t\u1EE9c vi\u1EC7t nam"
    ],
    comedy_vn: [
      "h\xE0i h\u01B0\u1EDBc gi\u1EA3i tr\xED vi\u1EC7t nam tri\u1EC7u view",
      "ti\u1EC3u ph\u1EA9m h\xE0i vi\u1EC7t nam c\u01B0\u1EDDi b\u1EC3 b\u1EE5ng",
      "t\xE1o qu\xE2n h\xE0i k\u1ECBch vi\u1EC7t nam ch\u1ECDn l\u1ECDc",
      "sitcom h\xE0i vi\u1EC7t nam vui nh\u1ED9n"
    ],
    entertainment: [
      "gameshow vi\u1EC7t nam tri\u1EC7u view hot nh\u1EA5t",
      "ch\u01B0\u01A1ng tr\xECnh gi\u1EA3i tr\xED vi\u1EC7t nam hay nh\u1EA5t",
      "talkshow h\xE0i h\u01B0\u1EDBc vi\u1EC7t nam",
      "show truy\u1EC1n h\xECnh th\u1EF1c t\u1EBF vi\u1EC7t nam"
    ],
    gaming_vn: [
      "streamer vi\u1EC7t nam highlights vui nh\u1ED9n",
      "gaming vi\u1EC7t nam li\xEAn qu\xE2n t\u1ED1c chi\u1EBFn free fire pubg",
      "highlight li\xEAn minh huy\u1EC1n tho\u1EA1i vi\u1EC7t nam",
      "top game th\u1EE7 vi\u1EC7t nam stream hay"
    ],
    gaming: [
      "streamer vi\u1EC7t nam gaming highlight",
      "li\xEAn minh huy\u1EC1n tho\u1EA1i lmht vi\u1EC7t nam",
      "game mobile vi\u1EC7t nam hot nh\u1EA5t"
    ],
    review_phim: [
      "review phim hay vi\u1EC7t nam t\xF3m t\u1EAFt phim chi\u1EBFu r\u1EA1p",
      "t\xF3m t\u1EAFt phim bom t\u1EA5n vi\u1EC7t nam thuy\u1EBFt minh",
      "review phim \u0111i\u1EC7n \u1EA3nh vi\u1EC7t nam m\u1EDBi",
      "phim ng\u1EAFn vi\u1EC7t nam c\u1EA3m \u0111\u1ED9ng hay nh\u1EA5t"
    ],
    podcast_vn: [
      "podcast vi\u1EC7t nam ch\u1EEFa l\xE0nh t\xE2m s\u1EF1 talkshow",
      "vietcetera have a sip podcast vi\u1EC7t nam",
      "tr\xF2 chuy\u1EC7n podcast vi\u1EC7t nam \xFD ngh\u0129a cu\u1ED9c s\u1ED1ng",
      "radio t\xE2m s\u1EF1 \u0111\xEAm khuya vi\u1EC7t nam"
    ],
    food_vn: [
      "\u1EA9m th\u1EF1c \u0111\u01B0\u1EDDng ph\u1ED1 vi\u1EC7t nam street food m\xF3n ngon",
      "kh\xE1m ph\xE1 du l\u1ECBch \u1EA9m th\u1EF1c vi\u1EC7t nam",
      "review \u1EA9m th\u1EF1c vi\u1EC7t nam \u0103n s\u1EADp h\xE0 n\u1ED9i s\xE0i g\xF2n",
      "n\u1EA5u \u0103n m\xF3n ngon vi\u1EC7t nam chu\u1EA9n v\u1ECB"
    ],
    tech_vn: [
      "\u0111\xE1nh gi\xE1 c\xF4ng ngh\u1EC7 \u0111i\u1EC7n tho\u1EA1i vi\u1EC7t nam review",
      "v\u1EADt v\u1EDD studio schannel c\xF4ng ngh\u1EC7 vi\u1EC7t nam",
      "m\u1EDF h\u1ED9p tr\xEAn tay \u0111i\u1EC7n tho\u1EA1i m\xE1y t\xEDnh m\u1EDBi nh\u1EA5t vi\u1EC7t nam"
    ],
    tech: [
      "c\xF4ng ngh\u1EC7 vi\u1EC7t nam review \u0111\xE1nh gi\xE1 m\u1EDBi",
      "smartphone laptop c\xF4ng ngh\u1EC7 vi\u1EC7t nam"
    ],
    kids_vn: [
      "ho\u1EA1t h\xECnh thi\u1EBFu nhi thuy\u1EBFt minh ti\u1EBFng vi\u1EC7t",
      "nh\u1EA1c thi\u1EBFu nhi vi\u1EC7t nam vui nh\u1ED9n b\xE9 xem",
      "m\xE8o \xFA doraemon ti\u1EBFng vi\u1EC7t t\u1EADp m\u1EDBi",
      "c\u1ED5 t\xEDch vi\u1EC7t nam ho\u1EA1t h\xECnh gi\xE1o d\u1EE5c b\xE9"
    ],
    kids: [
      "ho\u1EA1t h\xECnh ti\u1EBFng vi\u1EC7t cho b\xE9 thi\u1EBFu nhi",
      "nh\u1EA1c thi\u1EBFu nhi vi\u1EC7t nam vui nh\u1ED9n"
    ],
    live_vn: [
      "tr\u1EF1c ti\u1EBFp vi\u1EC7t nam livestream hot h\xF4m nay",
      "live stream vi\u1EC7t nam ph\xE1t s\xF3ng tr\u1EF1c ti\u1EBFp"
    ],
    shorts: [
      "shorts vi\u1EC7t nam h\xE0i h\u01B0\u1EDBc tri\u1EC7u view",
      "tiktok shorts vi\u1EC7t nam hot trend"
    ]
  };
  const TRENDING_FALLBACK_QUERIES = VIETNAM_CATEGORY_QUERIES.all;
  const buildTrendingFallbackToken = (pageIndex, category) => `trendsearch:${pageIndex}:${encodeURIComponent(category || "all")}`;
  async function scrapeYouTubeTrending(region = "VN") {
    const { data, apiKey, clientVersion } = await fetchYouTubePageDataFull(
      `https://www.youtube.com/feed/trending?gl=${encodeURIComponent(region)}&hl=vi`
    );
    if (!data) return { items: [], nextToken: null };
    cachedInnertubeKey = apiKey || cachedInnertubeKey;
    cachedInnertubeVer = clientVersion || cachedInnertubeVer;
    const seen = /* @__PURE__ */ new Set();
    const items = extractAllVideos(data).filter((v) => {
      if (!v?.id || seen.has(v.id)) return false;
      seen.add(v.id);
      return true;
    });
    return { items, nextToken: findNextContinuationToken(data) };
  }
  function mapChannelVideoRenderer(video, fallbackChannelTitle) {
    const videoId = video?.videoId;
    if (!videoId) return null;
    const title = video.title?.runs?.[0]?.text || video.title?.simpleText || "Video YouTube";
    const channelTitle = video.ownerText?.runs?.[0]?.text || fallbackChannelTitle;
    const channelId = video.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || "";
    let channelAvatar = video.channelThumbnailSupportedRenderers?.channelThumbnailWithRippleRenderer?.thumbnail?.thumbnails?.[0]?.url || "";
    if (channelAvatar && channelAvatar.startsWith("//")) channelAvatar = "https:" + channelAvatar;
    const publishedAt = video.publishedTimeText?.simpleText || video.publishedTimeText?.runs?.map((r) => r.text).join("") || "M\u1EDBi \u0111\xE2y";
    const viewCount = video.viewCountText?.simpleText || video.viewCountText?.runs?.map((r) => r.text).join("") || "";
    let lengthText = video.lengthText?.simpleText || video.lengthText?.runs?.map((r) => r.text).join("") || "";
    const badges = video.badges || [];
    const isLive = badges.some((b) => {
      const label = b.metadataBadgeRenderer?.label?.toLowerCase() || "";
      return label.includes("live") || label.includes("tr\u1EF1c ti\u1EBFp");
    }) || lengthText === "" && (viewCount.includes("\u0111ang xem") || viewCount.includes("watching") || video.upcomingEventData);
    if (isLive) lengthText = "LIVE";
    const thumbnail = video.thumbnail?.thumbnails?.[video.thumbnail.thumbnails.length - 1]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    const description = video.descriptionSnippet?.runs?.map((r) => r.text).join("") || video.detailedMetadataSnippets?.[0]?.snippetText?.runs?.map((r) => r.text).join("") || "";
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
      category: isLive ? "live" : "trending"
    };
  }
  async function resolveChannelIdByTitle(title) {
    if (!title) return null;
    const searchData = await fetchYouTubePageData(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(title)}&sp=EgIQAg%3D%3D`
    );
    if (!searchData) return null;
    const found = [];
    const walk = (obj) => {
      if (!obj || typeof obj !== "object") return;
      const ch = obj.channelRenderer;
      if (ch && ch.channelId) found.push(ch);
      for (const key of Object.keys(obj)) {
        const val = obj[key];
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
  async function scrapeYouTubeChannelVideos(channelId, channelName) {
    const idTrim = (channelId || "").trim();
    const nameTrim = (channelName || "").trim();
    const fallbackChannel = {
      id: idTrim || "channel_custom",
      title: nameTrim || "K\xEAnh YouTube",
      subscribers: "",
      description: "",
      avatarUrl: "",
      bannerUrl: ""
    };
    const parseChannelPage = (data) => {
      const meta = { ...fallbackChannel };
      const metadata = data?.metadata?.channelMetadataRenderer;
      if (metadata) {
        meta.id = metadata.externalId || meta.id;
        meta.title = metadata.title || meta.title;
        meta.description = metadata.description || "";
        meta.avatarUrl = metadata.avatar?.thumbnails?.[0]?.url || meta.avatarUrl;
      }
      const header = data?.header?.c4TabbedHeaderRenderer || data?.header?.interactiveTabbedHeaderRenderer || data?.header?.pageHeaderRenderer;
      if (header) {
        if (header.subscriberCountText) {
          meta.subscribers = header.subscriberCountText.simpleText || header.subscriberCountText.runs?.[0]?.text || meta.subscribers;
        }
        const banner = header.banner?.thumbnails || header.imageBannerViewModel?.image?.sources;
        if (banner && banner.length > 0) {
          meta.bannerUrl = banner[banner.length - 1].url;
        }
        if (!meta.avatarUrl && header.avatar?.thumbnails?.length > 0) {
          meta.avatarUrl = header.avatar.thumbnails[header.avatar.thumbnails.length - 1].url;
        }
      }
      let videos = extractAllVideos(data);
      videos.sort((a, b) => {
        if (a.duration === "LIVE" && b.duration !== "LIVE") return -1;
        if (a.duration !== "LIVE" && b.duration === "LIVE") return 1;
        return 0;
      });
      return { channel: meta, items: videos };
    };
    const candidates = [];
    if (/^UC[\w-]{22}$/.test(idTrim)) {
      candidates.push(`https://www.youtube.com/channel/${idTrim}`);
    } else if (idTrim.startsWith("@")) {
      candidates.push(`https://www.youtube.com/${encodeURIComponent(idTrim)}`);
    }
    let usedBase = "";
    let pageData = null;
    for (const base of candidates) {
      pageData = await fetchYouTubePageData(`${base}/videos`);
      if (pageData && (extractAllVideos(pageData).length > 0 || pageData.metadata?.channelMetadataRenderer)) {
        usedBase = base;
        break;
      }
      pageData = null;
    }
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
    try {
      const streamsData = await fetchYouTubePageData(`${usedBase}/streams`);
      if (streamsData) {
        const streamItems = extractAllVideos(streamsData);
        const seen = new Set(parsed.items.map((i) => i.id));
        for (const s of streamItems) {
          if (!seen.has(s.id)) {
            seen.add(s.id);
            parsed.items.push(s);
          }
        }
        parsed.items.sort((a, b) => {
          if (a.duration === "LIVE" && b.duration !== "LIVE") return -1;
          if (a.duration !== "LIVE" && b.duration === "LIVE") return 1;
          return 0;
        });
      }
    } catch {
    }
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
    if (parsed.items.length === 0 && nameTrim) {
      const s = await scrapeYouTubeSearch(nameTrim);
      const tKey = normChannelKey(parsed.channel.title || nameTrim);
      parsed.items = s.items.filter((it) => {
        const iKey = normChannelKey(it.channelTitle || "");
        return iKey && (iKey === tKey || iKey.includes(tKey) || tKey.includes(iKey));
      });
    }
    return parsed;
  }
  app.get("/api/youtube/search", async (req, res) => {
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
    const [baseResult, livePass] = await Promise.all([
      scrapeYouTubeSearch(query),
      scrapeYouTubeSearch(query, { liveOnly: true }).catch(() => ({ channels: [], items: [], nextToken: null }))
    ]);
    let liveData = baseResult;
    if (liveData.items.length === 0 && (query.includes("|") || query.includes("-") || query.split(" ").length > 4)) {
      const coreKeywords = query.split(/\||\-/)[0].trim().split(" ").slice(0, 4).join(" ");
      if (coreKeywords && coreKeywords !== query) {
        const fallbackData = await scrapeYouTubeSearch(coreKeywords);
        if (fallbackData.items.length > 0 || fallbackData.channels.length > 0) {
          liveData = fallbackData;
        }
      }
    }
    const mergedItems = [...liveData.items];
    if (livePass.items.length > 0) {
      const seenIds = new Set(mergedItems.map((i) => i.id));
      const freshLives = livePass.items.filter((i) => i?.id && !seenIds.has(i.id)).slice(0, 8);
      mergedItems.unshift(...freshLives);
    }
    if (mergedItems.length > 0 || liveData.channels.length > 0) {
      return res.json({
        channels: liveData.channels,
        items: mergedItems,
        nextToken: liveData.nextToken
      });
    }
    const pipedInstances = [
      "https://pipedapi.kavin.rocks",
      "https://api.piped.privacydev.net",
      "https://pipedapi.tokhmi.xyz"
    ];
    for (const pipedBase of pipedInstances) {
      try {
        const pipedUrl = `${pipedBase}/search?q=${encodeURIComponent(query)}&filter=all`;
        const data = await fetchWithTimeout(pipedUrl, 4e3);
        if (data?.items && Array.isArray(data.items) && data.items.length > 0) {
          const items = data.items.filter((item) => item.type === "stream" && item.url).map((item) => {
            const vid = item.url.replace("/watch?v=", "").replace("/shorts/", "");
            return {
              id: vid,
              title: item.title,
              channelTitle: item.uploaderName || "YouTube Channel",
              publishedAt: item.uploadedDate || "M\u1EDBi \u0111\xE2y",
              thumbnailUrl: item.thumbnail || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
              duration: item.duration > 0 ? `${Math.floor(item.duration / 60).toString().padStart(2, "0")}:${(item.duration % 60).toString().padStart(2, "0")}` : void 0,
              viewCount: item.views,
              category: "trending"
            };
          }).filter((item) => item.id && item.title);
          if (items.length > 0) {
            return res.json({ channels: [], items });
          }
        }
      } catch {
      }
    }
    return res.json({ channels: [], items: [] });
  });
  app.get("/api/youtube/channel", async (req, res) => {
    const channelId = String(req.query.id || "").trim();
    const channelName = String(req.query.name || "").trim();
    if (!channelId && !channelName) {
      return res.json({ channel: null, items: [] });
    }
    try {
      const result = await scrapeYouTubeChannelVideos(channelId, channelName);
      return res.json(result);
    } catch (err) {
      console.error("Fetch channel error:", err);
      return res.json({
        channel: { id: channelId || "channel_custom", title: channelName || "K\xEAnh YouTube" },
        items: []
      });
    }
  });
  app.get("/api/youtube/trending", async (req, res) => {
    const token = String(req.query.token || "").trim();
    const category = String(req.query.category || "all").trim();
    const categoryQueries = VIETNAM_CATEGORY_QUERIES[category] || [
      `${category} th\u1ECBnh h\xE0nh vi\u1EC7t nam h\xF4m nay`,
      ...TRENDING_FALLBACK_QUERIES
    ];
    if (token.startsWith("trendsearch:")) {
      const [, pageRaw, catRaw] = token.split(":");
      const pageIndex = parseInt(pageRaw, 10) || 0;
      const cat = decodeURIComponent(catRaw || "all") || "all";
      const activeQueries = VIETNAM_CATEGORY_QUERIES[cat] || [
        `${cat} th\u1ECBnh h\xE0nh vi\u1EC7t nam h\xF4m nay`,
        ...TRENDING_FALLBACK_QUERIES
      ];
      if (pageIndex >= activeQueries.length) {
        return res.json({ items: [], nextToken: null });
      }
      try {
        const data = await scrapeYouTubeSearch(activeQueries[pageIndex]);
        return res.json({
          items: data.items,
          nextToken: pageIndex + 1 < activeQueries.length ? buildTrendingFallbackToken(pageIndex + 1, cat) : null
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
    if (category !== "all" && category !== "trending") {
      const firstCatQuery = categoryQueries[0] || `${category} vi\u1EC7t nam`;
      const catData = await scrapeYouTubeSearch(firstCatQuery);
      if (catData.items.length > 0) {
        return res.json({
          items: catData.items,
          nextToken: categoryQueries.length > 1 ? buildTrendingFallbackToken(1, category) : null
        });
      }
    }
    try {
      const { items, nextToken } = await scrapeYouTubeTrending("VN");
      if (items.length > 0) {
        return res.json({ items, nextToken: nextToken || buildTrendingFallbackToken(0, category) });
      }
    } catch (e) {
      console.warn("Trending feed scrape failed:", e);
    }
    for (const pipedBase of PIPED_INSTANCES) {
      try {
        const data = await fetchWithTimeout(`${pipedBase}/trending?region=VN`, 5e3);
        if (Array.isArray(data) && data.length > 0) {
          const items = data.map((s) => mapPipedStreamItem(s, "Th\u1ECBnh h\xE0nh")).filter(Boolean);
          if (items.length > 0) {
            return res.json({ items, nextToken: buildTrendingFallbackToken(0, category) });
          }
        }
      } catch {
      }
    }
    const liveData = await scrapeYouTubeSearch(categoryQueries[0] || "video hot trend vi\u1EC7t nam h\xF4m nay");
    return res.json({
      items: liveData.items,
      nextToken: liveData.items.length > 0 ? buildTrendingFallbackToken(1, category) : null
    });
  });
  const isProd = process.env.NODE_ENV === "production";
  if (!isProd) {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\u{1F3AC} G\u1EA5u Cinema HD Web server running on http://0.0.0.0:${PORT}`);
  });
}
startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
//# sourceMappingURL=server.cjs.map
