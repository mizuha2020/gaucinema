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
    const raw = await fetchWithTimeout(`https://phimapi.com/phim/${slug}`, 3000);
    if (raw?.movie?.name) {
      const m = raw.movie;
      const item = {
        slug: m.slug || slug,
        name: m.name,
        origin_name: m.origin_name || '',
        poster_url: m.poster_url || '',
        thumb_url: m.thumb_url || '',
        year: m.year || undefined,
        quality: m.quality || 'HD',
        lang: m.lang || 'Vietsub',
        source: 'kkphim',
        sourceLabel: 'KKPhim',
        actor: m.actor || [],
        director: m.director || [],
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
      if (data?.movie) {
        indexMovieCast(data.movie, 'kkphim');
      }
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
      if (data?.movie) {
        indexMovieCast(data.movie, 'nguonc');
      }
      proxyCache.set(cacheKey, { data, timestamp: Date.now() });
      return res.json(data);
    } catch (err: any) {
      if (cached) return res.json(cached.data);
      return res.status(502).json({ status: false, msg: `NguonC error: ${err.message}` });
    }
  });

  // 4. Multi-Source Search Aggregator with Smart Cast & Actor Matching
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

  function extractTruyenqqCoverUrl(block: string): string {
    if (!block) return "";
    const dataMatch = block.match(/data-original="([^"]+)"/i) || block.match(/data-src="([^"]+)"/i) || block.match(/data-fb="([^"]+)"/i);
    if (dataMatch && dataMatch[1] && !dataMatch[1].includes("lazy.gif")) {
      return dataMatch[1].trim();
    }
    const srcMatches = [...block.matchAll(/src="([^"]+)"/gi)];
    for (const m of srcMatches) {
      const s = m[1]?.trim();
      if (s && !s.includes("lazy.gif") && !s.includes("logo") && !s.includes("icon")) {
        return s;
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
        const coverUrl = rawCover.replace(/F80x105/gi, 'F190x247').replace(/80x105/gi, '190x247');
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
            const coverUrl = rawCover.replace(/F80x105/gi, 'F190x247').replace(/80x105/gi, '190x247');

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
    const coverUrl = rawCover.replace(/F80x105/gi, 'F190x247').replace(/80x105/gi, '190x247');

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
  app.get("/api/proxy/truyenqq/list", async (req, res) => {
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

  app.get("/api/proxy/truyenqq/search", async (req, res) => {
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

  app.get("/api/proxy/truyenqq/detail", async (req, res) => {
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

  app.get("/api/proxy/truyenqq/chapter", async (req, res) => {
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
  app.get("/api/proxy/mangadex/*", async (req, res) => {
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
  app.get("/api/proxy/otruyen/*", async (req, res) => {
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
  app.get("/api/proxy/cuutruyen/*", async (req, res) => {
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
          "https://raw.githubusercontent.com/vuminhthanh12/vuminhthanh12/main/vmttv"
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

      if (targetUrl.includes("fptplay") || targetUrl.includes("vips-livecdn") || targetUrl.includes("seenow.vn")) {
        forwardHeaders["Origin"] = "https://fptplay.vn";
        forwardHeaders["Referer"] = "https://fptplay.vn/";
        forwardHeaders["X_ID"] = "Dalvik";
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

  // 4. ClearKey DRM Dynamic License Proxy & Key Resolver
  app.all("/api/tv/clearkey-license", async (req, res) => {
    // CORS headers for Web EME / Shaka Player
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Range, Accept, X-License-Url");
    res.setHeader("Access-Control-Expose-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }

    try {
      const targetUrl =
        (req.query.url as string) ||
        (req.headers["x-license-url"] as string) ||
        "https://vmttv.dpdns.org/AutoKey/";

      let rawBody = req.body;
      let bodyText = "";
      if (Buffer.isBuffer(rawBody)) {
        bodyText = rawBody.toString("utf-8");
      } else if (typeof rawBody === "object") {
        bodyText = JSON.stringify(rawBody);
      } else if (typeof rawBody === "string") {
        bodyText = rawBody;
      }

      // If requested via GET with ?kid=... or query params
      if (!bodyText && req.query.kid) {
        bodyText = JSON.stringify({
          kids: [req.query.kid],
          type: "temporary",
        });
      }

      // 1. Forward request to target license server with Dalvik UA
      const upstreamRes = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 10; Build/QP1A.190711.020)",
          Accept: "application/json, text/plain, */*",
          Origin: "https://fptplay.vn",
          Referer: "https://fptplay.vn/",
        },
        body: bodyText || undefined,
      });

      const responseText = await upstreamRes.text();
      res.setHeader("Content-Type", "application/json");

      if (upstreamRes.ok) {
        try {
          const parsed = JSON.parse(responseText);
          // Standard W3C JWK ClearKey payload: {"keys": [...]}
          if (parsed && Array.isArray(parsed.keys) && parsed.keys.length > 0) {
            for (const keyItem of parsed.keys) {
              if (keyItem.kid) {
                keyItem.kid = keyItem.kid.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
              }
              if (keyItem.k) {
                keyItem.k = keyItem.k.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
              }
            }
            return res.json(parsed);
          }
        } catch (e) {
          // not valid json
        }
      }

      // Fallback: If target server returned empty keys or failed, try alternative formats
      try {
        if (bodyText) {
          const reqObj = JSON.parse(bodyText);
          if (reqObj && Array.isArray(reqObj.kids) && reqObj.kids.length > 0) {
            const originalKid = reqObj.kids[0];
            let altKid = "";
            if (originalKid.length < 32) {
              // base64url to hex
              const clean = originalKid.replace(/-/g, "+").replace(/_/g, "/");
              const buf = Buffer.from(clean, "base64");
              altKid = buf.toString("hex");
            } else if (originalKid.length === 32) {
              // hex to base64url
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
                  Referer: "https://fptplay.vn/",
                },
                body: altBody,
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
        // Continue
      }

      return res
        .status(upstreamRes.status || 200)
        .send(responseText || JSON.stringify({ keys: [] }));
    } catch (err: any) {
      return res.status(500).json({ error: err.message, keys: [] });
    }
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
  app.get("/api/youtube/search", async (req, res) => {
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
  app.get("/api/youtube/channel", async (req, res) => {
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

  app.get("/api/youtube/trending", async (req, res) => {
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
  app.get("/api/youtube/suggest", async (req, res) => {
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
  const isProd = process.env.NODE_ENV === "production";
  
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
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
