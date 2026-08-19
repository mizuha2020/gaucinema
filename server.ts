import express from "express";
import path from "path";
import dns from "node:dns";
import cors from "cors";
import { createServer as createViteServer } from "vite";

// Force IPv4 resolution first to prevent ConnectTimeoutError on Cloudflare IPv6
try {
  dns.setDefaultResultOrder("ipv4first");
} catch (e) {
  // Ignore on older runtimes
}

const proxyCache = new Map<string, { data: any; timestamp: number }>();
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
    res.json({ status: "ok", message: "Gấu Cinema API Server is healthy" });
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

  // 5. Default General Proxy with resilient multi-source failover and caching
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

  // 3. TV & Sports M3U Playlist Parser Endpoint
  app.get("/api/tv/channels", async (req, res) => {
    try {
      const preferredUrl = "https://bit.ly/tinhlagitivi";
      const fallbackUrl = "https://iptv-org.github.io/iptv/countries/vn.m3u";

      let text = "";
      let sourceUsed = "";

      // Try preferred first
      try {
        const resPref = await fetch(preferredUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
          redirect: "follow",
        });
        
        if (resPref.ok) {
          const content = await resPref.text();
          // Check if it's actually an M3U or JSON (starts with { and has channels)
          if (content.includes("#EXTM3U") || (content.trim().startsWith("{") && content.includes("channels"))) {
            text = content;
            sourceUsed = preferredUrl;
          }
        }
      } catch (e) {
        console.error("Preferred IPTV source failed:", e);
      }

      // Fallback if preferred failed or returned invalid content (e.g. suspended page HTML)
      if (!text || text.length < 100) {
        console.log("Preferred IPTV source failed or returned short content, trying fallback...");
        const resFall = await fetch(fallbackUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
        });
        if (resFall.ok) {
          text = await resFall.text();
          sourceUsed = fallbackUrl;
        }
      }

      if (!text || text.length < 50) {
        // Safe empty response instead of throwing to prevent 500
        return res.json({ success: true, count: 0, channels: [], message: "No channels found from upstreams" });
      }

      const channels: Array<{
        name: string;
        logo: string;
        group: string;
        url: string;
        drmKey?: string;
      }> = [];

      // Handle JSON source (common for some bit.ly redirects)
      if (text.trim().startsWith("{")) {
        try {
          const data = JSON.parse(text);
          if (data.channels && Array.isArray(data.channels)) {
            return res.json({ success: true, count: data.channels.length, channels: data.channels, source: sourceUsed });
          }
        } catch (e) {
          // Fall through to M3U parser if it's not valid JSON
        }
      }

      const lines = text.split(/\r?\n/);
      let currentGroup = "Truyền Hình";
      let currentLogo = "";
      let currentName = "";
      let currentKey = "";

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
        } else if (line.startsWith("#KODIPROP:inputstream.adaptive.license_key=")) {
          currentKey = line.replace("#KODIPROP:inputstream.adaptive.license_key=", "").trim();
        } else if (line && !line.startsWith("#")) {
          if (currentName) {
            channels.push({
              name: currentName,
              logo: currentLogo || "https://images.unsplash.com/photo-1593784991095-a205069470b6?w=100&auto=format&fit=crop&q=60",
              group: currentGroup,
              url: line,
              drmKey: currentKey || undefined,
            });
          }
          currentName = "";
          currentLogo = "";
          currentKey = "";
        }
      }

      res.json({ success: true, count: channels.length, channels, source: sourceUsed });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
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
