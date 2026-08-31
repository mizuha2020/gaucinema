import { NavTab } from '../types';
import { systemApiService } from './systemApiService';
import { getFullApiUrl, isNativeApp } from './apiConfig';
import { Capacitor, CapacitorHttp } from '@capacitor/core';

export type MangaSource = 'truyenqq' | 'otruyen' | 'mangadex' | 'cuutruyen';

export interface MangaChapter {
  id: string;
  chapterNumber: string;
  title: string;
  translatedLanguage?: string;
  source: MangaSource;
  chapterApiUrl?: string; // For fetching pages if needed
}

export interface MangaItem {
  id: string;
  title: string;
  altTitles?: string[];
  slug: string;
  coverUrl: string;
  description?: string;
  status?: string;
  lastChapter?: string;
  authors?: string[];
  genres?: string[];
  chapters: MangaChapter[];
  source: MangaSource;
  updatedAt?: string;
}

export interface MangaHistoryItem {
  mangaId: string;
  source: MangaSource;
  title: string;
  coverUrl: string;
  chapterId: string;
  chapterNumber: string;
  chapterTitle: string;
  pageIndex: number;
  totalPages?: number;
  timestamp: number;
}

// Dynamic API Base URL Resolvers
const getTruyenqqBase = () => '/api/proxy/truyenqq';
const getOtruyenBase = () => '/api/proxy/otruyen';
const getMangadexBase = () => '/api/proxy/mangadex';
const getCuutruyenBase = () => '/api/proxy/cuutruyen';

const TRUYENQQ_MIRRORS = [
  'https://truyenqqko.com',
  'https://truyenqqno.com',
  'https://truyenqqgo.com',
  'https://truyenqqto.com',
  'https://truyenqqviet.com'
];

function isMangaSourceEnabled(id: MangaSource): boolean {
  try {
    const active = systemApiService.getActiveEndpointsForCategory('manga');
    // If not yet initialized (empty), assume enabled to avoid blocking initial load
    if (!active || active.length === 0) return true;
    return active.some(e => e.id === id);
  } catch { return true; }
}

/**
 * Validates whether a response is actual JSON data rather than an HTML auth gate or error page.
 */
async function parseJsonResponseSafe(res: Response): Promise<any> {
  const text = await res.text();
  if (!text || text.trim() === '') return null;
  const trimmed = text.trim();
  // Reject HTML error pages / auth gates
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || trimmed.startsWith('<head')) {
    throw new Error('Received HTML response instead of JSON');
  }
  return JSON.parse(text);
}

/**
 * Direct Native Android Fetch for TruyenQQ via CapacitorHttp (Bypasses WebView CORS & Cookies)
 */
async function fetchTruyenqqNative(
  pathBuilder: (base: string) => string,
  options: { method?: 'GET' | 'POST'; data?: any; isPost?: boolean } = {}
): Promise<{ html: string; base: string } | null> {
  for (const base of TRUYENQQ_MIRRORS) {
    try {
      const url = pathBuilder(base);
      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
        'Referer': `${base}/`,
      };
      if (options.isPost) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
        headers['X-Requested-With'] = 'XMLHttpRequest';
      }

      let res: any;
      if (options.isPost) {
        res = await CapacitorHttp.post({
          url,
          headers,
          data: options.data,
          responseType: 'text',
          connectTimeout: 5000,
          readTimeout: 5000,
        });
      } else {
        res = await CapacitorHttp.get({
          url,
          headers,
          responseType: 'text',
          connectTimeout: 5000,
          readTimeout: 5000,
        });
      }

      const rawData = typeof res.data === 'string' ? res.data : JSON.stringify(res.data || '');
      if (res.status >= 200 && res.status < 400 && rawData && rawData.length > 50) {
        return { html: rawData, base };
      }
    } catch (e) {}
  }
  return null;
}

/**
 * Robust Manga API fetcher with multi-layer fallback:
 * 1. Express backend proxy (/api/proxy/...)
 * 2. Direct upstream API (MangaDex, OTruyen have open CORS)
 * 3. Native CapacitorHttp for Android APK
 */
async function fetchMangaApi(url: string): Promise<any> {
  const fullUrl = getFullApiUrl(url);

  // 1. Direct fetch to local/cloud backend server proxy
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(fullUrl, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json, text/plain, */*',
      }
    });
    clearTimeout(timer);
    if (res.ok) {
      const data = await parseJsonResponseSafe(res);
      if (data) {
        return data;
      }
    }
  } catch (e: any) {
  }

  // 2. Direct upstream fallback for APIs with native CORS support
  // MangaDex: https://api.mangadex.org has native CORS enabled
  if (url.includes('/api/proxy/mangadex')) {
    try {
      const directPath = url.replace(/.*?\/api\/proxy\/mangadex/, '');
      const directUrl = `https://api.mangadex.org${directPath}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(directUrl, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        const data = await parseJsonResponseSafe(res);
        if (data) return data;
      }
    } catch (e: any) {}
  }

  // OTruyen: https://otruyenapi.com/v1/api has native CORS enabled
  if (url.includes('/api/proxy/otruyen')) {
    try {
      const directPath = url.replace(/.*?\/api\/proxy\/otruyen/, '');
      const directUrl = `https://otruyenapi.com/v1/api${directPath}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(directUrl, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        const data = await parseJsonResponseSafe(res);
        if (data) return data;
      }
    } catch (e: any) {}
  }

  // CuuTruyen: direct fallback
  if (url.includes('/api/proxy/cuutruyen')) {
    try {
      const directPath = url.replace(/.*?\/api\/proxy\/cuutruyen/, '');
      const directUrl = `https://cuutruyen.net/api/v2${directPath}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(directUrl, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        const data = await parseJsonResponseSafe(res);
        if (data) return data;
      }
    } catch (e: any) {}
  }

  // 3. Generic and Public CORS Proxy fallback if url is an external absolute http url
  if (url.startsWith('http')) {
    try {
      const b64 = btoa(unescape(encodeURIComponent(url)));
      const proxyUrl = getFullApiUrl(`/api/proxy/generic?url=${b64}`);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(proxyUrl, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        const data = await parseJsonResponseSafe(res);
        if (data) return data;
      }
    } catch (e) {}
  }

  throw new Error(`Failed to fetch manga data from ${url}`);
}

// Client-side fallback scraper for TruyenQQ when backend is inaccessible on Web
async function fetchTruyenqqViaPublicCORS(path: string): Promise<string> {
  const publicProxies = [
    (u: string) => `https://cors.eu.org/${u}`,
    (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  ];

  for (const mirror of TRUYENQQ_MIRRORS) {
    const targetUrl = `${mirror}${path}`;
    for (const proxyGen of publicProxies) {
      try {
        const proxyUrl = proxyGen(targetUrl);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);
        const res = await fetch(proxyUrl, { signal: controller.signal });
        clearTimeout(timer);
        if (res.ok) {
          const html = await res.text();
          if (html && html.length > 50 && (html.includes('truyen-tranh') || html.includes('book_avatar') || html.includes('search_avatar') || html.includes('ItemList') || html.includes('list_chapter'))) {
            return html;
          }
        }
      } catch (e) {}
    }
  }
  return '';
}

function upgradeTruyenqqImageUrl(url: string): string {
  if (!url) return url;
  let u = url.trim();
  if (u.startsWith('//')) u = 'https:' + u;
  if (u.startsWith('http://')) u = 'https://' + u.slice(7);
  // Fix chính: TruyenQQ dùng pattern F80x105 / 80x105 -> F190x247 (độ phân giải cao nét căng)
  u = u.replace(/F80x105/gi, 'F190x247');
  u = u.replace(/F\d+x\d+/gi, 'F190x247');
  u = u.replace(/\/ebook\/F?\d+x\d+\//gi, '/ebook/190x247/');
  u = u.replace(/\/thumb\/F?\d+x\d+\//gi, '/thumb/190x247/');
  u = u.replace(/[-_]F?80x105\./gi, '-190x247.').replace(/[-_]F?90x\d+\./gi, '-190x247.');
  u = u.replace(/80x105/gi, '190x247');
  if (u.includes('?')) {
    try {
      const urlObj = new URL(u);
      const w = parseInt(urlObj.searchParams.get('w') || '0', 10);
      if (w && w < 400) { urlObj.searchParams.delete('w'); urlObj.searchParams.delete('h'); urlObj.searchParams.delete('resize'); u = urlObj.toString(); }
    } catch {}
  }
  u = u.replace(/\/thumb\//gi, '/').replace(/_thumb\./gi, '.').replace(/-thumb\./gi, '.');
  return u;
}

function parseTruyenqqHtmlList(html: string): { items: MangaItem[]; totalPages: number } {
  const pageMatches = [...html.matchAll(/\/trang-(\d+)/g)];
  let maxPage = 1;
  for (const pm of pageMatches) {
    const p = parseInt(pm[1], 10);
    if (p > maxPage && p < 10000) maxPage = p;
  }

  const items: MangaItem[] = [];
  const listGridMatch = html.match(/<ul class="list_grid[^"]*">([\s\S]*?)<\/ul>/i) || html.match(/<div class="list_grid[^"]*">([\s\S]*?)<\/div>/i);
  const container = listGridMatch ? listGridMatch[0] : html;
  const liBlocks = container.match(/<li[^>]*>[\s\S]*?<\/li>/gi) || [];

  for (const block of liBlocks) {
    const slugMatch = block.match(/href="[^"]*\/truyen-tranh\/([^"]+)"/i);
    const titleMatch = block.match(/<h3[^>]*><a[^>]*title="([^"]+)"/i) || block.match(/<h3[^>]*><a[^>]*>([^<]+)<\/a>/i) || block.match(/alt="([^"]+)"/i) || block.match(/<p class="name">([^<]+)<\/p>/i);
    const imgMatch = block.match(/<img[^>]*src="([^"]+)"/i) || block.match(/data-original="([^"]+)"/i) || block.match(/data-fb="([^"]+)"/i);
    const lastChapMatch = block.match(/class="last_chapter"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i);
    const descMatch = block.match(/class="excerpt"[^>]*>([\s\S]*?)<\/div>/i);
    const statusMatch = block.match(/Tình trạng:\s*([^<]+)<\/p>/i);
    const otherTitleMatch = block.match(/Tên khác:\s*([^<]+)<\/div>/i);

    if (slugMatch && titleMatch) {
      const slug = slugMatch[1].replace(/^\/|\/$/g, '');
      const title = titleMatch[1].trim();
      const rawCover = imgMatch ? imgMatch[1] : '';
      const coverUrl = upgradeTruyenqqImageUrl(rawCover);
      const lastChapter = lastChapMatch ? lastChapMatch[1].trim() : '';
      const description = descMatch ? descMatch[1].trim() : '';
      const status = statusMatch ? statusMatch[1].trim() : 'Đang cập nhật';
      const altTitles = otherTitleMatch ? otherTitleMatch[1].split(';').map((s) => s.trim()) : [];

      items.push({
        id: slug,
        slug,
        title,
        coverUrl: getMangaImageUrl(coverUrl),
        description,
        status,
        altTitles,
        source: 'truyenqq',
        chapters: [],
      });
    }
  }
  return { items, totalPages: maxPage };
}

function parseTruyenqqSearchHtml(html: string): MangaItem[] {
  const items: MangaItem[] = [];
  const liBlocks = html.match(/<li>[\s\S]*?<\/li>/gi) || [];
  for (const block of liBlocks) {
    const slugMatch = block.match(/href="[^"]*\/truyen-tranh\/([^"]+)"/i);
    const titleMatch = block.match(/<p class="name">([^<]+)<\/p>/i) || block.match(/<h3[^>]*>([^<]+)<\/h3>/i) || block.match(/alt="([^"]+)"/i);
    const altMatch = block.match(/<p class="name_other">([^<]+)<\/p>/i);
    const imgMatch = block.match(/<img[^>]*src="([^"]+)"/i) || block.match(/data-original="([^"]+)"/i) || block.match(/data-fb="([^"]+)"/i);

    if (slugMatch && titleMatch) {
      const slug = slugMatch[1].replace(/^\/|\/$/g, '');
      const title = titleMatch[1].trim();
      const altTitles = altMatch ? altMatch[1].split(';').map((s) => s.trim()) : [];
      const rawCover = imgMatch ? imgMatch[1] : '';
      const coverUrl = upgradeTruyenqqImageUrl(rawCover);

      let lastChapter = '';
      if (block.includes('Chương') || block.includes('Chapter') || block.includes('Chap')) {
        const chm = block.match(/<p>(Chương\s*[\d.]+|Chapter\s*[\d.]+|Chap\s*[\d.]+)<\/p>/i) || block.match(/(?:Chương|Chapter|Chap)\s*[\d.]+/i);
        if (chm) lastChapter = Array.isArray(chm) ? (chm[1] || chm[0]) : String(chm);
      }

      items.push({
        id: slug,
        slug,
        title,
        altTitles,
        coverUrl: getMangaImageUrl(coverUrl),
        lastChapter,
        source: 'truyenqq',
        chapters: [],
      });
    }
  }
  return items;
}

function parseTruyenqqDetailHtml(html: string, slug: string, base: string): MangaItem {
  const cleanSlug = slug.replace(/^https?:\/\/[^/]+\/truyen-tranh\//i, '').replace(/^\/|\/$/g, '');
  const titleMatch = html.match(/<h1[^>]*itemprop="name"[^>]*>([^<]+)<\/h1>/i) || html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  const title = titleMatch ? titleMatch[1].trim() : 'Truyện Tranh';

  const imgMatch = html.match(/<div class="block01"[\s\S]*?<img[^>]*src="([^"]+)"/i) || html.match(/<div class="book_avatar"[\s\S]*?<img[^>]*src="([^"]+)"/i);
  const rawCover = imgMatch ? imgMatch[1] : '';
  const coverUrl = upgradeTruyenqqImageUrl(rawCover);

  const altMatch = html.match(/<li class="othername[^>]*>[\s\S]*?<p class="other-name[^>]*>([^<]+)<\/p>/i);
  const altTitles = altMatch ? altMatch[1].split(';').map((s) => s.trim()) : [];

  const authorMatch = html.match(/<li class="author[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i);
  const authors = authorMatch ? [authorMatch[1].trim()] : [];

  const statusMatch = html.match(/<li class="status[^>]*>[\s\S]*?<p class="col-xs-9">([^<]+)<\/p>/i);
  const status = statusMatch ? statusMatch[1].trim() : 'Đang cập nhật';

  const genreMatches = [...html.matchAll(/<ul class="list01">[\s\S]*?<\/ul>/gi)];
  let genres: string[] = [];
  if (genreMatches.length > 0) {
    const gList = [...genreMatches[0][0].matchAll(/<a[^>]*>([^<]+)<\/a>/gi)];
    genres = gList.map((g) => g[1].trim());
  }

  const descMatch = html.match(/<div class="story-detail-info[^>]*>([\s\S]*?)<\/div>/i) || html.match(/<p class="listing-excerpt">([\s\S]*?)<\/p>/i);
  const description = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : '';

  const chapters: MangaChapter[] = [];
  const chapBlocks = [...html.matchAll(/<div class="works-chapter-item">[\s\S]*?<a[^>]*href="([^"]*\/truyen-tranh\/([^"]+))"[^>]*>([^<]+)<\/a>/gi)];

  for (const cb of chapBlocks) {
    const chapSlug = cb[2].replace(/^\/|\/$/g, '');
    const chapTitle = cb[3].trim();
    const numMatch = chapTitle.match(/(?:Chương|Chapter|Chap)\s*([\d.]+)/i) || chapSlug.match(/chap-([\d.]+)/i);
    const chapterNumber = numMatch ? numMatch[1] : chapTitle;

    chapters.push({
      id: chapSlug,
      title: chapTitle,
      chapterNumber,
      source: 'truyenqq',
      chapterApiUrl: `${base}/truyen-tranh/${chapSlug}`,
    });
  }

  return {
    id: cleanSlug,
    slug: cleanSlug,
    title,
    altTitles,
    coverUrl: getMangaImageUrl(coverUrl),
    description,
    status,
    authors,
    genres,
    chapters,
    source: 'truyenqq',
  };
}

function parseTruyenqqChapterHtml(html: string): string[] {
  const pages: string[] = [];
  const imgMatches = [...html.matchAll(/<img[^>]*class="[^"]*lazy[^"]*"[^>]*data-original="([^"]+)"/gi)]
    .concat([...html.matchAll(/<img[^>]*data-original="([^"]+)"/gi)])
    .concat([...html.matchAll(/<div class="page-chapter"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"/gi)]);

  for (const m of imgMatches) {
    const src = m[1];
    if (src && !src.includes('lazy.gif') && !src.includes('logo') && !pages.includes(src)) {
      pages.push(src);
    }
  }

  return pages;
}

export const mangaApi = {
  // 1. Get List / Home from selected source
  async getMangaList(source: MangaSource, page = 1, keyword = ''): Promise<{ items: MangaItem[]; totalPages: number }> {
    if (!isMangaSourceEnabled(source)) return { items: [], totalPages: 1 };
    try {
      if (source === 'truyenqq') {
        // A. Native Android APK Direct Fetch (CapacitorHttp with direct mirror access, zero CORS/cookie restrictions)
        if (isNativeApp()) {
          try {
            if (keyword) {
              const res = await fetchTruyenqqNative(
                (base) => `${base}/frontend/search/search`,
                { isPost: true, data: `search=${encodeURIComponent(keyword)}&type=0` }
              );
              if (res?.html) {
                const items = parseTruyenqqSearchHtml(res.html);
                if (items.length > 0) return { items, totalPages: 1 };
              }
            } else {
              const res = await fetchTruyenqqNative((base) => `${base}/truyen-moi-cap-nhat/trang-${page}`);
              if (res?.html) {
                const parsed = parseTruyenqqHtmlList(res.html);
                if (parsed.items.length > 0) return parsed;
              }
            }
          } catch (nativeErr) {
            console.warn('Native TruyenQQ fetch failed, trying proxy/fallback:', nativeErr);
          }
        }

        // B. Express Backend Proxy (/api/proxy/truyenqq/...)
        let backendFallback: any = null;
        try {
          const baseProxy = keyword
            ? `/api/proxy/truyenqq/search?q=${encodeURIComponent(keyword)}`
            : `/api/proxy/truyenqq/list?page=${page}`;
          const data = await fetchMangaApi(baseProxy);
          // If backend returned fallback (otruyen disguised as truyenqq), don't accept yet — try true TruyenQQ via direct CORS
          const isFallback = data && (data.isFallback || data.fallbackSource === 'otruyen');
          if (data && Array.isArray(data.items) && data.items.length > 0 && !isFallback) {
            const items: MangaItem[] = data.items.map((item: any) => ({
              id: item.slug || item.id,
              title: item.title,
              slug: item.slug,
              coverUrl: getMangaImageUrl(upgradeTruyenqqImageUrl(item.coverUrl || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop')),
              description: item.description,
              status: item.status,
              altTitles: item.altTitles,
              source: 'truyenqq' as MangaSource,
              chapters: []
            }));
            return { items, totalPages: data.totalPages || 1 };
          }
          // If backend returned fallback data, keep it as last resort but try direct first
          if (isFallback && data && Array.isArray(data.items) && data.items.length > 0) backendFallback = data;
        } catch (e: any) {
        }

        // C. Direct client fallback via public CORS proxy on Web
        try {
          if (keyword) {
            const path = `/tim-kiem/trang-${page}?q=${encodeURIComponent(keyword)}`;
            const html = await fetchTruyenqqViaPublicCORS(path);
            if (html) {
              const parsed = parseTruyenqqHtmlList(html);
              if (parsed.items.length > 0) return parsed;
            }
          } else {
            const path = `/truyen-moi-cap-nhat/trang-${page}`;
            const html = await fetchTruyenqqViaPublicCORS(path);
            if (html) {
              const parsed = parseTruyenqqHtmlList(html);
              if (parsed.items.length > 0) return parsed;
            }
          }
        } catch (e: any) {
        }

        // D. Backend fallback if present
        if (backendFallback && isMangaSourceEnabled('otruyen')) {
          const items: MangaItem[] = backendFallback.items.map((item: any) => ({
            id: item.slug || item.id,
            title: item.title,
            slug: item.slug,
            coverUrl: getMangaImageUrl(upgradeTruyenqqImageUrl(item.coverUrl || '')),
            description: item.description,
            status: item.status,
            altTitles: item.altTitles,
            source: 'truyenqq' as MangaSource,
            chapters: []
          }));
          if (items.length > 0) return { items, totalPages: backendFallback.totalPages || 1 };
        }

        // E. Failover to OTruyen if TruyenQQ is blocked — respect disabled toggle
        if (isMangaSourceEnabled('otruyen')) {
          try {
            const otResult = await this.getMangaList('otruyen', page, keyword);
            if (otResult.items.length > 0) {
              return {
                items: otResult.items.map(i => ({ ...i, source: 'truyenqq' as MangaSource })),
                totalPages: otResult.totalPages
              };
            }
          } catch (e: any) {
          }
        }

        return { items: [], totalPages: 1 };
      } else if (source === 'otruyen') {
        try {
          let url = `${getOtruyenBase()}/danh-sach/truyen-moi?page=${page}`;
          if (keyword) {
            url = `${getOtruyenBase()}/tim-kiem?keyword=${encodeURIComponent(keyword)}&page=${page}`;
          }
          const data = await fetchMangaApi(url);
          if (data.status === 'success' || data.data) {
            const rawItems = data.data?.items || data.items || [];
            const domainCdn = data.data?.domain_cdn || 'https://otruyenapi.com/uploads/comics';
            const items: MangaItem[] = rawItems.map((item: any) => {
              const thumb = item.thumb_url
                ? (item.thumb_url.startsWith('http') ? item.thumb_url : `${domainCdn}/${item.thumb_url}`)
                : 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop';
              return {
                id: item.slug || item._id,
                title: item.name,
                slug: item.slug,
                coverUrl: getMangaImageUrl(thumb),
                status: item.status,
                updatedAt: item.updatedAt,
                source: 'otruyen' as MangaSource,
                chapters: []
              };
            });
            const totalItems = data.data?.params?.pagination?.totalItems || rawItems.length * 16;
            const totalPages = Math.max(1, Math.ceil(totalItems / 24));
            if (items.length > 0) return { items, totalPages };
          }
        } catch (e) {
          console.warn('OTruyen API error, trying CuuTruyen failover:', e);
        }

        // Failover to CuuTruyen — only if enabled
        if (isMangaSourceEnabled('cuutruyen')) {
          try {
            const ctResult = await this.getMangaList('cuutruyen', page, keyword);
            if (ctResult.items.length > 0) {
              return {
                items: ctResult.items.map(i => ({ ...i, source: 'otruyen' as MangaSource })),
                totalPages: ctResult.totalPages
              };
            }
          } catch (e) {}
        }

        return { items: [], totalPages: 1 };
      } else if (source === 'mangadex') {
        try {
          let url = `${getMangadexBase()}/manga?limit=24&offset=${(page - 1) * 24}&includes[]=cover_art&includes[]=author&contentRating[]=safe&contentRating[]=suggestive`;
          if (keyword) {
            url += `&title=${encodeURIComponent(keyword)}&order[relevance]=desc`;
          } else {
            url += `&availableTranslatedLanguage[]=vi&hasAvailableChapters=true&order[latestUploadedChapter]=desc`;
          }

          const data = await fetchMangaApi(url);
          if (data.result === 'ok' && Array.isArray(data.data)) {
            const items: MangaItem[] = data.data.map((manga: any) => {
              const rels = manga.relationships || [];
              const coverRel = rels.find((r: any) => r.type === 'cover_art');
              const authorRel = rels.find((r: any) => r.type === 'author');
              const coverFileName = coverRel?.attributes?.fileName;
              const coverUrl = coverFileName
                ? `https://uploads.mangadex.org/covers/${manga.id}/${coverFileName}.512.jpg`
                : 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop';
              
              const titleObj = manga.attributes.title || {};
              const altTitles = manga.attributes.altTitles || [];
              const viAlt = altTitles.find((t: any) => t.vi)?.vi;
              const enAlt = altTitles.find((t: any) => t.en)?.en;
              const title = titleObj.vi || viAlt || titleObj.en || enAlt || Object.values(titleObj)[0] || 'Manga';

              const descriptionObj = manga.attributes.description || {};
              const desc = descriptionObj.vi || descriptionObj.en || '';
              const authors = authorRel?.attributes?.name ? [authorRel.attributes.name] : [];

              return {
                id: manga.id,
                title: String(title),
                slug: manga.id,
                coverUrl: getMangaImageUrl(coverUrl),
                description: desc,
                status: manga.attributes.status,
                authors,
                genres: manga.attributes.tags?.map((t: any) => t.attributes.name.en) || [],
                source: 'mangadex' as MangaSource,
                chapters: []
              };
            });
            const total = data.total || items.length;
            if (items.length > 0) return { items, totalPages: Math.ceil(total / 24) || 1 };
          }
        } catch (e) {
          console.warn('MangaDex API network error, trying OTruyen failover:', e);
        }

        // Failover to OTruyen — only if enabled
        if (isMangaSourceEnabled('otruyen')) {
          try {
            const otResult = await this.getMangaList('otruyen', page, keyword);
            if (otResult.items.length > 0) {
              return {
                items: otResult.items.map(i => ({ ...i, source: 'mangadex' as MangaSource })),
                totalPages: otResult.totalPages
              };
            }
          } catch (e) {}
        }

        return { items: [], totalPages: 1 };
      } else if (source === 'cuutruyen') {
        try {
          const endpoint = keyword
            ? `${getCuutruyenBase()}/mangas?query=${encodeURIComponent(keyword)}&page=${page}`
            : `${getCuutruyenBase()}/mangas/recently_updated?page=${page}`;
          const data = await fetchMangaApi(endpoint);
          const raw = data.data || data.mangas || (Array.isArray(data) ? data : []);
          const items: MangaItem[] = (Array.isArray(raw) ? raw : []).map((m: any) => ({
            id: String(m.id || m.slug),
            title: m.name || m.title || 'Manga',
            slug: String(m.id || m.slug),
            coverUrl: getMangaImageUrl(m.cover_url || m.cover_mobile_url || m.thumbnail_url || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop'),
            description: m.description || '',
            status: m.status || 'Đang cập nhật',
            source: 'cuutruyen' as MangaSource,
            chapters: []
          }));
          if (items.length > 0) return { items, totalPages: 20 };
        } catch (e) {
          console.warn('CuuTruyen API error, trying OTruyen failover:', e);
        }

        // Failover to OTruyen — only if enabled
        if (isMangaSourceEnabled('otruyen')) {
          try {
            const otResult = await this.getMangaList('otruyen', page, keyword);
            if (otResult.items.length > 0) {
              return {
                items: otResult.items.map(i => ({ ...i, source: 'cuutruyen' as MangaSource })),
                totalPages: otResult.totalPages
              };
            }
          } catch (e) {}
        }

        return { items: [], totalPages: 1 };
      }
      return { items: [], totalPages: 1 };
    } catch (err) {
      console.error('Error fetching manga list for source:', source, err);
      return { items: [], totalPages: 1 };
    }
  },

  // 1b. Mixed list - gộp 4 nguồn, ưu tiên MangaDex 70%, loại nguồn bị admin tắt
  async getMixedMangaList(page = 1, keyword = ''): Promise<{ items: MangaItem[]; totalPages: number }> {
    const enabledSources = (() => {
      try {
        const active = systemApiService.getActiveEndpointsForCategory('manga');
        if (!active || active.length === 0) return ['mangadex','truyenqq','otruyen','cuutruyen'] as MangaSource[];
        return active.map(e=>e.id).filter((id):id is MangaSource => ['truyenqq','otruyen','mangadex','cuutruyen'].includes(id));
      } catch { return ['mangadex','truyenqq','otruyen','cuutruyen'] as MangaSource[]; }
    })();
    if (enabledSources.length === 0) return { items: [], totalPages: 1 };

    // Fetch tất cả nguồn song song, mỗi nguồn lấy riêng page
    const results = await Promise.allSettled(
      enabledSources.map(src => this.getMangaList(src, page, keyword).catch(()=> ({ items: [] as MangaItem[], totalPages: 1 })))
    );
    const perSource: Record<string, MangaItem[]> = {};
    let maxTotalPages = 1;
    results.forEach((r, idx) => {
      if (r.status === 'fulfilled' && r.value?.items) {
        const src = enabledSources[idx];
        perSource[src] = r.value.items;
        if (r.value.totalPages > maxTotalPages) maxTotalPages = r.value.totalPages;
      }
    });

    const mangadexItems = perSource['mangadex'] || [];
    const otherSources = enabledSources.filter(s => s !== 'mangadex');
    const otherItems: MangaItem[] = [];
    otherSources.forEach(src => {
      (perSource[src] || []).forEach(it => otherItems.push(it));
    });

    // Dedupe theo slug/title chuẩn hoá
    const seen = new Set<string>();
    const dedupe = (arr: MangaItem[]) => {
      const out: MangaItem[] = [];
      for (const it of arr) {
        const key = (it.slug || it.id || it.title || '').toLowerCase().trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(it);
      }
      return out;
    };
    const dedupedDex = dedupe(mangadexItems);
    const dedupedOther = dedupe(otherItems);

    // Mix 70% MangaDex, 30% còn lại xen kẽ
    const targetTotal = 24;
    const dexCount = Math.min(dedupedDex.length, Math.round(targetTotal * 0.7));
    const otherCount = Math.min(dedupedOther.length, targetTotal - dexCount);
    // Nếu thiếu thì bù
    const finalDexCount = dedupedDex.length < dexCount ? dedupedDex.length : dexCount;
    const finalOtherCount = dedupedOther.length < otherCount ? dedupedOther.length : otherCount;
    // Fill thêm nếu còn slot
    let extraDex = 0, extraOther = 0;
    if (finalDexCount + finalOtherCount < targetTotal) {
      const remain = targetTotal - (finalDexCount + finalOtherCount);
      const availDex = dedupedDex.length - finalDexCount;
      const availOther = dedupedOther.length - finalOtherCount;
      if (availDex > 0 || availOther > 0) {
        // ưu tiên vẫn 70/30 cho phần còn lại
        extraDex = Math.min(availDex, Math.round(remain * 0.7));
        extraOther = Math.min(availOther, remain - extraDex);
        if (extraDex + extraOther < remain) {
          extraOther = Math.min(availOther - extraOther, remain - extraDex - extraOther);
        }
      }
    }
    const pickedDex = dedupedDex.slice(0, finalDexCount + extraDex);
    const pickedOther = dedupedOther.slice(0, finalOtherCount + extraOther);

    // Xen kẽ: cứ 7 MangaDex thì 3 Other (tỉ lệ 70/30) -> pattern 3-1 lặp
    const mixed: MangaItem[] = [];
    let di = 0, oi = 0;
    while (di < pickedDex.length || oi < pickedOther.length) {
      for (let k=0; k<3 && di < pickedDex.length; k++) mixed.push(pickedDex[di++]);
      if (oi < pickedOther.length) mixed.push(pickedOther[oi++]);
    }

    // Nếu keyword search và All: giữ nguyên thứ tự mix đã dedupe, không cần cắt 24 nữa nếu ít hơn
    const items = mixed.length > 0 ? mixed : [...dedupedDex, ...dedupedOther].slice(0, targetTotal);
    return { items: items.slice(0, targetTotal), totalPages: maxTotalPages };
  },

  // 2. Get Manga Detail & Chapters
  async getMangaDetail(source: MangaSource, idOrSlug: string): Promise<MangaItem | null> {
    if (!isMangaSourceEnabled(source)) return null;
    try {
      // Auto-detect source if ID format unambiguously identifies the platform
      let effectiveSource: MangaSource = source;
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
      const isNumeric = /^\d+$/.test(idOrSlug);

      if (isUuid) {
        effectiveSource = 'mangadex';
      } else if (isNumeric && effectiveSource !== 'cuutruyen' && effectiveSource !== 'truyenqq') {
        effectiveSource = 'cuutruyen';
      }

      if (effectiveSource === 'truyenqq') {
        const cleanSlug = idOrSlug.replace(/^https?:\/\/[^/]+\/truyen-tranh\//i, '').replace(/^\/|\/$/g, '');

        // A. Native Android APK Direct Detail Fetch
        if (isNativeApp()) {
          try {
            const res = await fetchTruyenqqNative((b) => `${b}/truyen-tranh/${cleanSlug}`);
            if (res?.html) {
              const detail = parseTruyenqqDetailHtml(res.html, cleanSlug, res.base);
              if (detail && detail.chapters && detail.chapters.length > 0) {
                return detail;
              }
            }
          } catch (nativeErr) {
            console.warn('Native TruyenQQ detail fetch failed, trying proxy:', nativeErr);
          }
        }

        // B. Express Backend Proxy
        try {
          const detailUrl = `/api/proxy/truyenqq/detail?slug=${encodeURIComponent(cleanSlug)}`;
          const data = await fetchMangaApi(detailUrl);
          if (data && (data.title || data.id)) {
            const chapters: MangaChapter[] = (data.chapters || []).map((ch: any) => ({
              id: ch.id || ch.slug,
              chapterNumber: ch.chapterNumber || '1',
              title: ch.title || `Chapter ${ch.chapterNumber || '1'}`,
              source: 'truyenqq' as MangaSource,
              chapterApiUrl: ch.chapterApiUrl || `/api/proxy/truyenqq/chapter?slug=${encodeURIComponent(ch.id || ch.slug)}`
            }));

            if (chapters.length > 0) {
              return {
                id: data.id || cleanSlug,
                title: data.title || 'Truyện Tranh',
                altTitles: data.altTitles || [],
                slug: data.slug || cleanSlug,
                coverUrl: getMangaImageUrl(data.coverUrl || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop'),
                description: data.description || '',
                status: data.status || 'Đang cập nhật',
                authors: data.authors || [],
                genres: data.genres || [],
                chapters,
                source: 'truyenqq',
                updatedAt: data.updatedAt
              };
            }
          }
        } catch (e) {
          console.warn('TruyenQQ detail fetch error:', e);
        }

        // C. Direct CORS proxy fallback on Web
        try {
          const html = await fetchTruyenqqViaPublicCORS(`/truyen-tranh/${cleanSlug}`);
          if (html) {
            const detail = parseTruyenqqDetailHtml(html, cleanSlug, 'https://truyenqqko.com');
            if (detail && detail.chapters && detail.chapters.length > 0) {
              return detail;
            }
          }
        } catch (e) {}

        // Try OTruyen fallback search if TruyenQQ returned 0 chapters — only if otruyen enabled
        if (isMangaSourceEnabled('otruyen')) {
          try {
            const cleanTitle = cleanSlug.replace(/-\d+$/, '').replace(/-/g, ' ');
            const otResult = await this.getMangaList('otruyen', 1, cleanTitle);
            if (otResult.items.length > 0) {
              const matched = otResult.items[0];
              const otDetail = await this.getMangaDetail('otruyen', matched.id || matched.slug);
              if (otDetail && otDetail.chapters && otDetail.chapters.length > 0) {
                return {
                  ...otDetail,
                  id: cleanSlug,
                  slug: cleanSlug,
                  source: 'truyenqq'
                };
              }
            }
          } catch (e) {}
        }

        return {
          id: cleanSlug,
          title: 'Truyện Tranh TruyenQQ',
          slug: cleanSlug,
          coverUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop',
          description: 'Hành trình khám phá truyện tranh.',
          status: 'ongoing',
          authors: [],
          genres: [],
          chapters: [],
          source: 'truyenqq'
        };
      } else if (effectiveSource === 'otruyen') {
        try {
          const data = await fetchMangaApi(`${getOtruyenBase()}/truyen-tranh/${idOrSlug}`);
          if (data && (data.status === 'success' || data.data?.item)) {
            const item = data.data?.item || data.item;
            if (item) {
              const domainCdn = data.data?.domain_cdn || data.domain_cdn || 'https://otruyenapi.com/uploads/comics';
              const coverUrl = item.thumb_url
                ? (item.thumb_url.startsWith('http') ? item.thumb_url : `${domainCdn}/${item.thumb_url}`)
                : '';
              
              const rawChapters = item.chapters?.[0]?.server_data || [];
              const chapters: MangaChapter[] = rawChapters.map((ch: any) => ({
                id: ch.chapter_api_data || ch.chapter_name,
                chapterNumber: ch.chapter_name,
                title: `Chapter ${ch.chapter_name}${ch.chapter_title ? `: ${ch.chapter_title}` : ''}`,
                source: 'otruyen',
                chapterApiUrl: ch.chapter_api_data
              }));

              return {
                id: item.slug || idOrSlug,
                title: item.name || 'Truyện Tranh',
                altTitles: item.origin_name,
                slug: item.slug || idOrSlug,
                coverUrl,
                description: item.content,
                status: item.status,
                authors: item.author || [],
                genres: item.category?.map((c: any) => c.name) || [],
                chapters,
                source: 'otruyen',
                updatedAt: item.updatedAt
              };
            }
          }
        } catch (e) {
          console.warn('OTruyen detail fetch error or fallback:', e);
        }

        return {
          id: idOrSlug,
          title: 'Truyện Tranh (Đang cập nhật)',
          slug: idOrSlug,
          coverUrl: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=500&auto=format&fit=crop',
          description: 'Hành trình khám phá truyện tranh.',
          status: 'ongoing',
          authors: ['Tác giả'],
          genres: ['Action', 'Adventure'],
          chapters: [
            { id: 'ot-ch-1', chapterNumber: '1', title: 'Chapter 1', source: 'otruyen', chapterApiUrl: `${getOtruyenBase()}/chapter/1` },
            { id: 'ot-ch-2', chapterNumber: '2', title: 'Chapter 2', source: 'otruyen', chapterApiUrl: `${getOtruyenBase()}/chapter/2` }
          ],
          source: 'otruyen'
        };
      } else if (effectiveSource === 'mangadex') {
        try {
          const data = await fetchMangaApi(`${getMangadexBase()}/manga/${idOrSlug}?includes[]=cover_art&includes[]=author`);
          if (data.result === 'ok' && data.data) {
            const m = data.data;
            const rels = m.relationships || [];
            const coverRel = rels.find((r: any) => r.type === 'cover_art');
            const authorRel = rels.find((r: any) => r.type === 'author');
            const coverFileName = coverRel?.attributes?.fileName;
            const coverUrl = coverFileName
              ? `https://uploads.mangadex.org/covers/${m.id}/${coverFileName}.512.jpg`
              : 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop';
            
            // Prioritize Vietnamese title from title or altTitles
            const titleObj = m.attributes.title || {};
            const altTitles = m.attributes.altTitles || [];
            const viAlt = altTitles.find((t: any) => t.vi)?.vi;
            const enAlt = altTitles.find((t: any) => t.en)?.en;
            const title = titleObj.vi || viAlt || titleObj.en || enAlt || Object.values(titleObj)[0] || 'Manga';

            const descObj = m.attributes.description || {};
            const description = descObj.vi || descObj.en || '';

            // Fetch chapter feed: 1. Try Vietnamese first
            let feedData = await fetchMangaApi(
              `${getMangadexBase()}/manga/${idOrSlug}/feed?translatedLanguage[]=vi&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&order[chapter]=asc&limit=100`
            );
            let rawChapters = (feedData?.data || []).filter((ch: any) => !ch.attributes.externalUrl);

            // 2. If no internal Vietnamese chapters found, fallback to English/all chapters
            if (rawChapters.length === 0) {
              feedData = await fetchMangaApi(
                `${getMangadexBase()}/manga/${idOrSlug}/feed?translatedLanguage[]=en&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&order[chapter]=asc&limit=100`
              );
              rawChapters = (feedData?.data || []).filter((ch: any) => !ch.attributes.externalUrl);
            }

            const chapters: MangaChapter[] = rawChapters.map((ch: any) => {
              const lang = ch.attributes.translatedLanguage;
              const chNum = ch.attributes.chapter || '1';
              const chTitle = ch.attributes.title ? `: ${ch.attributes.title}` : '';
              const langBadge = lang === 'vi' ? '' : `[${lang?.toUpperCase()}] `;
              return {
                id: ch.id,
                chapterNumber: chNum,
                title: `${langBadge}Chương ${chNum}${chTitle}`,
                translatedLanguage: lang,
                source: 'mangadex'
              };
            });

            return {
              id: m.id,
              title: String(title),
              slug: m.id,
              coverUrl,
              description,
              status: m.attributes.status,
              authors: authorRel?.attributes?.name ? [authorRel.attributes.name] : [],
              genres: m.attributes.tags?.map((t: any) => t.attributes.name.en) || [],
              chapters,
              source: 'mangadex'
            };
          }
        } catch (e) {
          console.warn('MangaDex detail fetch error:', e);
        }

        return {
          id: idOrSlug,
          title: 'Ta Muốn Trở Thành Chúa Tể Bóng Tối!',
          slug: idOrSlug,
          coverUrl: 'https://uploads.mangadex.org/covers/77bee52c-d2d6-44ad-a33a-1734c1fe696a/6079dd31-838b-4d61-87c4-121f3ad19158.jpg.512.jpg',
          description: 'Cid Kagenou mong muốn điều khiển thế giới trong bóng tối.',
          status: 'ongoing',
          authors: ['Aizawa Daisuke'],
          genres: ['Action', 'Comedy', 'Fantasy'],
          chapters: [],
          source: 'mangadex'
        };
      } else if (source === 'cuutruyen') {
        try {
          const detailRes = await fetchMangaApi(`${getCuutruyenBase()}/mangas/${idOrSlug}`);
          const m = detailRes.data || detailRes;
          
          let chapters: MangaChapter[] = [];
          try {
            const chapRes = await fetchMangaApi(`${getCuutruyenBase()}/mangas/${idOrSlug}/chapters`);
            const rawChaps = chapRes.data || chapRes || [];
            if (Array.isArray(rawChaps)) {
              chapters = rawChaps.map((ch: any) => ({
                id: String(ch.id),
                chapterNumber: String(ch.number || ch.name || '1'),
                title: ch.name ? `Chapter ${ch.number || ch.name}: ${ch.name}` : `Chapter ${ch.number || '1'}`,
                source: 'cuutruyen'
              }));
            }
          } catch (e) {}

          return {
            id: String(m.id || idOrSlug),
            title: m.name || m.title || 'Manga',
            slug: String(m.id || idOrSlug),
            coverUrl: getMangaImageUrl(m.cover_url || m.cover_mobile_url || m.thumbnail_url || ''),
            description: m.description || '',
            status: m.status || 'Đang cập nhật',
            chapters,
            source: 'cuutruyen'
          };
        } catch (e) {
          console.warn('CuuTruyen detail fetch error:', e);
          return null;
        }
      }
      return null;
    } catch (err) {
      console.error('Error fetching manga detail:', err);
      return null;
    }
  },

  // 3. Get Chapter Pages (Images)
  async getChapterPages(chapter: MangaChapter, options?: { dataSaver?: boolean }): Promise<string[]> {
    try {
      if (chapter.source === 'truyenqq') {
        const targetParam = chapter.id || chapter.chapterApiUrl || '';
        const cleanChapSlug = targetParam.replace(/^https?:\/\/[^/]+\/truyen-tranh\//i, '').replace(/^\/|\/$/g, '');

        // A. Native Android APK Direct Chapter Fetch
        if (isNativeApp()) {
          try {
            const res = await fetchTruyenqqNative((b) => `${b}/truyen-tranh/${cleanChapSlug}`);
            if (res?.html) {
              const pages = parseTruyenqqChapterHtml(res.html);
              if (pages.length > 0) {
                return pages.map((p: string) => getProxyImageUrl(p));
              }
            }
          } catch (nativeErr) {
            console.warn('Native TruyenQQ chapter fetch failed, trying proxy:', nativeErr);
          }
        }

        // B. Express Backend Proxy
        try {
          const chapUrl = `/api/proxy/truyenqq/chapter?slug=${encodeURIComponent(cleanChapSlug)}`;
          const data = await fetchMangaApi(chapUrl);
          if (data && Array.isArray(data.pages) && data.pages.length > 0) {
            return data.pages.map((p: string) => getProxyImageUrl(p));
          }
        } catch (e: any) {
        }

        // C. Direct CORS Proxy Fallback on Web
        try {
          const html = await fetchTruyenqqViaPublicCORS(`/truyen-tranh/${cleanChapSlug}`);
          if (html) {
            const pages = parseTruyenqqChapterHtml(html);
            if (pages.length > 0) {
              return pages.map((p: string) => getProxyImageUrl(p));
            }
          }
        } catch (e: any) {}

        return [];
      } else if (chapter.source === 'otruyen' && chapter.chapterApiUrl) {
        try {
          const data = await fetchMangaApi(chapter.chapterApiUrl);
          if (data.status === 'success' && data.data?.item) {
            const domainCdn = data.data.domain_cdn || 'https://otruyenapi.com/uploads/comics';
            const chapterPath = data.data.item.chapter_path;
            const images = data.data.item.chapter_image || [];
            if (images.length > 0) {
              return images.map((img: any) => getMangaImageUrl(`${domainCdn}/${chapterPath}/${img.image_file}`));
            }
          }
        } catch (e) {
          console.warn('OTruyen pages fetch error:', e);
        }
        return [];
      } else if (chapter.source === 'mangadex') {
        try {
          const data = await fetchMangaApi(`${getMangadexBase()}/at-home/server/${chapter.id}`);
          if (data && data.chapter) {
            const hash = data.chapter.hash;
            const useDataSaver = options?.dataSaver ?? false;
            
            // Choose dataSaver or original data array
            let folder = 'data';
            let fileNames: string[] = [];
            
            if (useDataSaver && Array.isArray(data.chapter.dataSaver) && data.chapter.dataSaver.length > 0) {
              folder = 'data-saver';
              fileNames = data.chapter.dataSaver;
            } else if (Array.isArray(data.chapter.data) && data.chapter.data.length > 0) {
              folder = 'data';
              fileNames = data.chapter.data;
            } else if (Array.isArray(data.chapter.dataSaver) && data.chapter.dataSaver.length > 0) {
              folder = 'data-saver';
              fileNames = data.chapter.dataSaver;
            }

            if (fileNames.length > 0) {
              return fileNames.map((fn: string) => getMangaImageUrl(`https://uploads.mangadex.org/${folder}/${hash}/${fn}`));
            }
          }
        } catch (e) {
          console.warn('MangaDex chapter pages fetch failed:', e);
        }
        return [];
      } else if (chapter.source === 'cuutruyen') {
        try {
          const data = await fetchMangaApi(`${getCuutruyenBase()}/chapters/${chapter.id}`);
          const rawPages = data.data?.pages || data.pages || [];
          return rawPages.map((p: any) => getMangaImageUrl(p.image_url || p.url || p.src || p));
        } catch (e) {
          console.warn('CuuTruyen chapter pages fetch failed:', e);
          return [];
        }
      }
      return [];
    } catch (err) {
      console.error('Error fetching chapter pages:', err);
      return [];
    }
  }
};

/**
 * Helper to generate direct, resilient and clean image URLs for Manga posters & pages
 */
export function getProxyImageUrl(url: string): string {
  if (!url) return 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop';
  let cleanUrl = url.trim();
  if (cleanUrl.startsWith('//')) cleanUrl = 'https:' + cleanUrl;
  if (cleanUrl.startsWith('http://')) cleanUrl = 'https://' + cleanUrl.slice(7);

  if (cleanUrl.startsWith('/api/proxy/image')) return getFullApiUrl(cleanUrl);
  if (cleanUrl.startsWith('/')) return getFullApiUrl(cleanUrl);

  if (cleanUrl.includes('truyenvua.com') || cleanUrl.includes('hinhhinh.com') || cleanUrl.includes('tintruyen.com') || cleanUrl.includes('truyenqq') || cleanUrl.includes('80x105')) {
    cleanUrl = upgradeTruyenqqImageUrl(cleanUrl);
  }

  return getFullApiUrl(`/api/proxy/image?url=${encodeURIComponent(cleanUrl)}`);
}

export function getMangaImageUrl(url: string): string {
  if (!url) return 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop';
  let u = url.trim();
  if (u.startsWith('//')) u = 'https:' + u;
  if (u.startsWith('http://')) u = 'https://' + u.slice(7);

  if (u.startsWith('/api/proxy/image')) return getFullApiUrl(u);
  if (u.startsWith('/')) return getFullApiUrl(u);

  // TruyenQQ CDNs (hinhhinh, truyenvua, tintruyen) block hotlinking, so route them through /api/proxy/image
  if (u.includes('truyenvua.com') || u.includes('hinhhinh.com') || u.includes('tintruyen.com') || u.includes('truyenqq') || u.includes('80x105')) {
    return getProxyImageUrl(u);
  }

  return u;
}

/**
 * Multi-stage resilient fallback for image onError handlers across all devices (Web, PWA, Android APK)
 */
export function getFallbackMangaImageUrl(url: string, currentFailedSrc?: string): string {
  if (!url) return 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop';
  let cleanUrl = url.trim();
  if (cleanUrl.startsWith('//')) cleanUrl = 'https:' + cleanUrl;
  if (cleanUrl.startsWith('http://')) cleanUrl = 'https://' + cleanUrl.slice(7);

  // If initial direct load failed, route through our backend image proxy (which injects referrer headers)
  if (!currentFailedSrc || !currentFailedSrc.includes('/api/proxy/image')) {
    if (cleanUrl.startsWith('http')) {
      return getFullApiUrl(`/api/proxy/image?url=${encodeURIComponent(cleanUrl)}`);
    }
  }

  // Final fallback illustration
  return 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop';
}
