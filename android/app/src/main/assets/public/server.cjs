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
var proxyCache = /* @__PURE__ */ new Map();
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
    res.json({ status: "ok", message: "G\u1EA5u Cinema API Server is healthy" });
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
      const preferredUrl = "https://bit.ly/tinhlagitivi";
      const fallbackUrl = "https://iptv-org.github.io/iptv/countries/vn.m3u";
      let text = "";
      let sourceUsed = "";
      try {
        const resPref = await fetch(preferredUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
          },
          redirect: "follow"
        });
        if (resPref.ok) {
          const content = await resPref.text();
          if (content.includes("#EXTM3U") || content.trim().startsWith("{") && content.includes("channels")) {
            text = content;
            sourceUsed = preferredUrl;
          }
        }
      } catch (e) {
        console.error("Preferred IPTV source failed:", e);
      }
      if (!text || text.length < 100) {
        console.log("Preferred IPTV source failed or returned short content, trying fallback...");
        const resFall = await fetch(fallbackUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
          }
        });
        if (resFall.ok) {
          text = await resFall.text();
          sourceUsed = fallbackUrl;
        }
      }
      if (!text || text.length < 50) {
        return res.json({ success: true, count: 0, channels: [], message: "No channels found from upstreams" });
      }
      const channels = [];
      if (text.trim().startsWith("{")) {
        try {
          const data = JSON.parse(text);
          if (data.channels && Array.isArray(data.channels)) {
            return res.json({ success: true, count: data.channels.length, channels: data.channels, source: sourceUsed });
          }
        } catch (e) {
        }
      }
      const lines = text.split(/\r?\n/);
      let currentGroup = "Truy\u1EC1n H\xECnh";
      let currentLogo = "";
      let currentName = "";
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith("#EXTINF:")) {
          const groupMatch = line.match(/group-title="([^"]*)"/);
          if (groupMatch) {
            currentGroup = groupMatch[1];
          }
          const logoMatch = line.match(/tvg-logo="([^"]*)"/);
          if (logoMatch) {
            currentLogo = logoMatch[1];
          }
          const commaIndex = line.lastIndexOf(",");
          if (commaIndex !== -1) {
            currentName = line.substring(commaIndex + 1).trim();
          }
        } else if (line && !line.startsWith("#")) {
          if (currentName) {
            channels.push({
              name: currentName,
              logo: currentLogo || "https://images.unsplash.com/photo-1593784991095-a205069470b6?w=100&auto=format&fit=crop&q=60",
              group: currentGroup,
              url: line
            });
          }
          currentName = "";
          currentLogo = "";
        }
      }
      res.json({ success: true, count: channels.length, channels, source: sourceUsed });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
  if (process.env.NODE_ENV !== "production") {
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
