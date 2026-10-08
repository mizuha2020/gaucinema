import { NavTab } from '../types';
import { systemApiService } from './systemApiService';
import { getFullApiUrl, apiFetch, isNativeApp } from './apiConfig';
import { CapacitorHttp } from '@capacitor/core';

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

// Dynamic API Base URL Resolvers (backend proxy đã xác thực)
const getOtruyenBase = () => '/api/proxy/otruyen';
const getMangadexBase = () => '/api/proxy/mangadex';
const getCuutruyenBase = () => '/api/proxy/cuutruyen';

// Prompt 4 B8: TRUYENQQ_MIRRORS + fetch trực tiếp + CORS proxy công cộng đã gỡ.
// Mọi data truyện tranh chỉ qua backend proxy.

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
 /* Extracts raw underlying image CDN URL if a proxy wrapper URL is passed
 */
export function extractRawImageUrl(url: string): string {
  if (!url) return '';
  let u = url.trim();
  if (u.includes('/api/proxy/image?url=')) {
    const parts = u.split('/api/proxy/image?url=');
    if (parts[1]) {
      try {
        u = decodeURIComponent(parts[1].split('&')[0]);
      } catch {
        u = parts[1].split('&')[0];
      }
    }
  }
  if (u.startsWith('//')) u = 'https:' + u;
  if (u.startsWith('http://')) u = 'https://' + u.slice(7);
  return u;
}

const nativeImageCache = new Map<string, string>();

/**
 * Direct native image downloader for Android APK using CapacitorHttp.
 * Bypasses WebView CORS & Referer restrictions by sending custom Referer header
 * directly via native Android OkHttp/HttpURLConnection and returning a base64 Data URL.
 */
export async function fetchImageAsBase64Native(imageUrl: string, refererHost?: string): Promise<string> {
  if (!imageUrl) return 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop';

  const rawUrl = extractRawImageUrl(imageUrl);
  if (!rawUrl) return imageUrl;
  if (rawUrl.startsWith('data:')) return rawUrl;

  let cleanUrl = rawUrl;
  if (cleanUrl.includes('truyenvua.com') || cleanUrl.includes('hinhhinh.com') || cleanUrl.includes('tintruyen.com') || cleanUrl.includes('truyenqq') || cleanUrl.includes('80x105')) {
    cleanUrl = upgradeTruyenqqImageUrl(cleanUrl);
  }

  if (nativeImageCache.has(cleanUrl)) {
    return nativeImageCache.get(cleanUrl)!;
  }
  if (nativeImageCache.has(imageUrl)) {
    return nativeImageCache.get(imageUrl)!;
  }

  let referer = refererHost || 'https://truyenqqko.com/';
  if (cleanUrl.includes('truyenvua') || cleanUrl.includes('hinhhinh') || cleanUrl.includes('tintruyen') || cleanUrl.includes('truyenqq')) {
    referer = 'https://truyenqqko.com/';
  } else if (cleanUrl.includes('mangadex')) {
    referer = 'https://mangadex.org/';
  } else if (cleanUrl.includes('otruyen')) {
    referer = 'https://otruyenapi.com/';
  }

  const candidates: string[] = [cleanUrl];
  if (cleanUrl.includes('hinhhinh.com') || cleanUrl.includes('truyenvua.com') || cleanUrl.includes('tintruyen.com') || cleanUrl.includes('truyenqq')) {
    const hinhhinhAlt = cleanUrl.replace(/https?:\/\/[^\/]+/gi, 'https://i.hinhhinh.com');
    if (!candidates.includes(hinhhinhAlt)) candidates.push(hinhhinhAlt);
    const truyenvuaAlt = cleanUrl.replace(/https?:\/\/[^\/]+/gi, 'https://i178.truyenvua.com');
    if (!candidates.includes(truyenvuaAlt)) candidates.push(truyenvuaAlt);
  }

  for (const candidateUrl of candidates) {
    try {
      const res = await CapacitorHttp.get({
        url: candidateUrl,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
          'Referer': referer,
          'referer': referer,
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        },
        responseType: 'arraybuffer',
        connectTimeout: 8000,
        readTimeout: 8000,
      });

      if (res.status >= 200 && res.status < 400 && res.data) {
        let b64Data = '';
        if (typeof res.data === 'string') {
          b64Data = res.data.trim();
        } else if (res.data && typeof res.data === 'object') {
          if (res.data instanceof ArrayBuffer) {
            const bytes = new Uint8Array(res.data);
            let binary = '';
            const len = bytes.byteLength;
            for (let i = 0; i < len; i++) {
              binary += String.fromCharCode(bytes[i]);
            }
            b64Data = window.btoa(binary);
          } else if (typeof (res.data as any).data === 'string') {
            b64Data = String((res.data as any).data).trim();
          }
        }

        b64Data = b64Data.replace(/\s+/g, '');

        if (b64Data) {
          if (!b64Data.startsWith('data:')) {
            let mimeType = 'image/jpeg';
            if (candidateUrl.toLowerCase().includes('.png')) mimeType = 'image/png';
            else if (candidateUrl.toLowerCase().includes('.webp')) mimeType = 'image/webp';
            else if (candidateUrl.toLowerCase().includes('.gif')) mimeType = 'image/gif';

            b64Data = `data:${mimeType};base64,${b64Data}`;
          }

          if (b64Data.length > 100) {
            nativeImageCache.set(cleanUrl, b64Data);
            nativeImageCache.set(imageUrl, b64Data);
            return b64Data;
          }
        }
      }
    } catch (e) {
      // try next candidate
    }
  }

  return cleanUrl;
}

async function fetchImagesInBatches(urls: string[], batchSize = 6): Promise<string[]> {
  const results: string[] = [];
  for (let i = 0; i < urls.length; i += batchSize) {
    const chunk = urls.slice(i, i + batchSize);
    const chunkResults = await Promise.all(chunk.map((u) => fetchImageAsBase64Native(u)));
    results.push(...chunkResults);
  }
  return results;
}

/**
 * Manga API fetcher: CHỈ qua backend proxy đã xác thực (/api/proxy/...).
 * Prompt 4 B8 đã gỡ đường vòng (upstream trực tiếp, CORS proxy công cộng,
 * CapacitorHttp trực tiếp). Backend lỗi thì báo lỗi, không tự đi đường vòng.
 */
async function fetchMangaApi(url: string): Promise<any> {
  const fullUrl = getFullApiUrl(url);

  // 1. Direct fetch to local/cloud backend server proxy
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const res = await apiFetch(fullUrl, {
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

  // Prompt 4 B8: GỠ BỎ toàn bộ fallback gọi thẳng upstream (MangaDex,
  // OTruyen, CuuTruyen) — đi vòng qua kiểm tra slot. Backend lỗi thì báo
  // lỗi, không tự đi đường vòng.

  // 3. Generic and Public CORS Proxy fallback if url is an external absolute http url
  if (url.startsWith('http')) {
    try {
      const b64 = btoa(unescape(encodeURIComponent(url)));
      const proxyUrl = getFullApiUrl(`/api/proxy/generic?url=${b64}`);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      const res = await apiFetch(proxyUrl, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        const data = await parseJsonResponseSafe(res);
        if (data) return data;
      }
    } catch (e) {}
  }

  throw new Error(`Failed to fetch manga data from ${url}`);
}

// (Đã gỡ fetchTruyenqqViaPublicCORS theo Prompt 4 B8.)

function upgradeTruyenqqImageUrl(url: string): string {
  if (!url) return url;
  let u = url.trim();
  if (u.startsWith('//')) u = 'https:' + u;
  if (u.startsWith('http://')) u = 'https://' + u.slice(7);

  // Replace dead tintruyen domains with working i.hinhhinh.com
  u = u.replace(/(\d+\.)?tintruyen\.(net|com)/gi, 'i.hinhhinh.com');

  // Replace double slashes in paths e.g. https://domain.com//file.jpg -> https://domain.com/file.jpg
  u = u.replace(/(https?:\/\/[^\/]+)\/\/+/g, '$1/');

  // Fix chính: TruyenQQ dùng pattern F80x105 / 80x105 -> 190x247
  u = u.replace(/F80x105/gi, '190x247');
  u = u.replace(/F190x247/gi, '190x247');
  u = u.replace(/F\d+x\d+/gi, '190x247');
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

// (Đã gỡ toàn bộ HTML scraper TruyenQQ client-side theo Prompt 4 B8.
// Data truyện chỉ qua backend proxy đã xác thực.)

export const mangaApi = {
  // 1. Get List / Home from selected source
  async getMangaList(source: MangaSource, page = 1, keyword = ''): Promise<{ items: MangaItem[]; totalPages: number }> {
    if (!isMangaSourceEnabled(source)) return { items: [], totalPages: 1 };
    try {
      if (source === 'truyenqq') {
        // Prompt 4 B8: CHỈ qua backend proxy đã xác thực. Gỡ toàn bộ đường
        // vòng (CapacitorHttp trực tiếp, CORS proxy công cộng).
        // B. Express Backend Proxy (/api/proxy/truyenqq/...)
        let backendFallback: any = null;
        try {
          const baseProxy = keyword
            ? `/api/proxy/truyenqq/search?q=${encodeURIComponent(keyword)}`
            : `/api/proxy/truyenqq/list?page=${page}`;
          const data = await fetchMangaApi(baseProxy);
          const isFallback = data && (data.isFallback || data.fallbackSource === 'otruyen');
          if (data && Array.isArray(data.items) && data.items.length > 0 && !isFallback) {
            const items: MangaItem[] = data.items.map((item: any) => ({
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
            return { items, totalPages: data.totalPages || 1 };
          }
          if (isFallback && data && Array.isArray(data.items) && data.items.length > 0) backendFallback = data;
        } catch (e: any) {
        }

        // C. (Đã gỡ theo Prompt 4 B8: không fallback CORS proxy công cộng.
        // Backend lỗi thì báo lỗi, không tự đi đường vòng.)

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
          void 0;
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
          void 0;
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
          void 0;
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
      void 0;
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

        // Prompt 4 B8: CHỈ qua backend proxy đã xác thực (đã gỡ native
        // direct + CORS proxy công cộng). Backend lỗi thì báo lỗi.
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
              const rawCover = data.coverUrl || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop';
              const coverUrl = isNativeApp() ? await fetchImageAsBase64Native(rawCover) : getMangaImageUrl(rawCover);
              return {
                id: data.id || cleanSlug,
                title: data.title || 'Truyện Tranh',
                altTitles: data.altTitles || [],
                slug: data.slug || cleanSlug,
                coverUrl,
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
          void 0;
        }

        // C. (Đã gỡ theo Prompt 4 B8: không fallback CORS proxy công cộng.)

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
          void 0;
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
          void 0;
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
          void 0;
          return null;
        }
      }
      return null;
    } catch (err) {
      void 0;
      return null;
    }
  },

  // 3. Get Chapter Pages (Images)
  async getChapterPages(chapter: MangaChapter, options?: { dataSaver?: boolean }): Promise<string[]> {
    try {
      if (chapter.source === 'truyenqq') {
        const targetParam = chapter.id || chapter.chapterApiUrl || '';
        const cleanChapSlug = targetParam.replace(/^https?:\/\/[^/]+\/truyen-tranh\//i, '').replace(/^\/|\/$/g, '');

        // Prompt 4 B8: CHỈ qua backend proxy (đã gỡ native direct + CORS
        // proxy công cộng). Backend lỗi thì trả rỗng để UI báo lỗi.
        // B. Express Backend Proxy
        try {
          const chapUrl = `/api/proxy/truyenqq/chapter?slug=${encodeURIComponent(cleanChapSlug)}`;
          const data = await fetchMangaApi(chapUrl);
          if (data && Array.isArray(data.pages) && data.pages.length > 0) {
            return data.pages.map((p: string) => getProxyImageUrl(p));
          }
        } catch (e: any) {
        }

        // C. (Đã gỡ theo Prompt 4 B8: không fallback CORS proxy công cộng.)

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
          void 0;
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
          void 0;
        }
        return [];
      } else if (chapter.source === 'cuutruyen') {
        try {
          const data = await fetchMangaApi(`${getCuutruyenBase()}/chapters/${chapter.id}`);
          const rawPages = data.data?.pages || data.pages || [];
          return rawPages.map((p: any) => getMangaImageUrl(p.image_url || p.url || p.src || p));
        } catch (e) {
          void 0;
          return [];
        }
      }
      return [];
    } catch (err) {
      void 0;
      return [];
    }
  }
};

/**
 * Helper to generate direct, resilient and clean image URLs for Manga posters & pages
 */
export function getProxyImageUrl(url: string): string {
  if (!url) return 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop';
  const rawUrl = extractRawImageUrl(url);
  if (!rawUrl) return url;
  if (rawUrl.startsWith('data:')) return rawUrl;

  let cleanUrl = rawUrl;
  if (cleanUrl.includes('truyenvua.com') || cleanUrl.includes('hinhhinh.com') || cleanUrl.includes('tintruyen.com') || cleanUrl.includes('truyenqq') || cleanUrl.includes('80x105')) {
    cleanUrl = upgradeTruyenqqImageUrl(cleanUrl);
  }

  if (nativeImageCache.has(cleanUrl)) {
    return nativeImageCache.get(cleanUrl)!;
  }
  if (nativeImageCache.has(url)) {
    return nativeImageCache.get(url)!;
  }

  if (isNativeApp()) {
    return cleanUrl;
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    return `/api/proxy/image?url=${encodeURIComponent(cleanUrl)}`;
  }

  return getFullApiUrl(`/api/proxy/image?url=${encodeURIComponent(cleanUrl)}`);
}

export function getMangaImageUrl(url: string): string {
  if (!url) return 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop';
  const rawUrl = extractRawImageUrl(url);
  if (!rawUrl) return url;
  if (rawUrl.startsWith('data:')) return rawUrl;

  let u = rawUrl;
  if (u.includes('truyenvua.com') || u.includes('hinhhinh.com') || u.includes('tintruyen.com') || u.includes('truyenqq') || u.includes('80x105')) {
    u = upgradeTruyenqqImageUrl(u);
  }

  if (nativeImageCache.has(u)) {
    return nativeImageCache.get(u)!;
  }
  if (nativeImageCache.has(url)) {
    return nativeImageCache.get(url)!;
  }

  if (isNativeApp()) {
    return u;
  }

  return getProxyImageUrl(u);
}

/**
 * Multi-stage resilient fallback for image onError handlers across all devices (Web, PWA, Android APK)
 */
export function getFallbackMangaImageUrl(url: string, currentFailedSrc?: string): string {
  const fallbackImg = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop';
  const rawUrl = extractRawImageUrl(url || currentFailedSrc || '');
  if (!rawUrl) return fallbackImg;

  if (nativeImageCache.has(rawUrl)) {
    return nativeImageCache.get(rawUrl)!;
  }

  if (isNativeApp()) {
    fetchImageAsBase64Native(rawUrl).catch(() => {});
    return getFullApiUrl(`/api/proxy/image?url=${encodeURIComponent(rawUrl)}`);
  }

  if (!currentFailedSrc || !currentFailedSrc.includes('/api/proxy/image')) {
    return getProxyImageUrl(rawUrl);
  }

  return fallbackImg;
}

/**
 * Universal React image onError handler for Manga posters & pages
 */
export function handleMangaImageError(e: React.SyntheticEvent<HTMLImageElement, Event>, originalUrl: string) {
  const target = e.target as HTMLImageElement;
  const fallbackImg = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop';
  const rawUrl = extractRawImageUrl(originalUrl || target.src);
  if (!rawUrl) {
    target.src = fallbackImg;
    return;
  }

  const failedCount = parseInt(target.dataset.failedCount || '0', 10);
  if (failedCount >= 3) {
    target.src = fallbackImg;
    return;
  }
  target.dataset.failedCount = String(failedCount + 1);

  if (nativeImageCache.has(rawUrl)) {
    target.src = nativeImageCache.get(rawUrl)!;
    return;
  }

  if (isNativeApp()) {
    fetchImageAsBase64Native(rawUrl).then((b64) => {
      if (b64 && (b64.startsWith('data:') || b64.startsWith('http'))) {
        target.src = b64;
      } else {
        target.src = getFullApiUrl(`/api/proxy/image?url=${encodeURIComponent(rawUrl)}`);
      }
    }).catch(() => {
      target.src = getFullApiUrl(`/api/proxy/image?url=${encodeURIComponent(rawUrl)}`);
    });
    return;
  }

  if (!target.src.includes('/api/proxy/image')) {
    target.src = getProxyImageUrl(rawUrl);
    return;
  }

  target.src = fallbackImg;
}
