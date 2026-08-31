import { NavTab } from '../types';
import { systemApiService } from './systemApiService';
import { getFullApiUrl } from './apiConfig';

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
 * Robust Manga API fetcher with multi-layer fallback:
 * 1. Express backend proxy (/api/proxy/...)
 * 2. Direct upstream API (MangaDex, OTruyen have open CORS)
 * 3. Public CORS proxies
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

    // Public Web Proxies
    const publicProxies = [
      (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
      (u: string) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
      (u: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
    ];

    for (const proxyGen of publicProxies) {
      try {
        const publicProxyUrl = proxyGen(url);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(publicProxyUrl, { signal: controller.signal });
        clearTimeout(timer);
        if (res.ok) {
          const data = await parseJsonResponseSafe(res);
          if (data) return data;
        }
      } catch (e) {}
    }
  }

  throw new Error(`Failed to fetch manga data from ${url}`);
}

// Client-side fallback scraper for TruyenQQ when backend is inaccessible on public domain
async function fetchTruyenqqViaPublicCORS(path: string): Promise<string> {
  const mirrors = ['https://truyenqqko.com', 'https://truyenqqno.com', 'https://truyenqqgo.com'];
  const publicProxies = [
    (u: string) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
    (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    (u: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
  ];

  for (const mirror of mirrors) {
    const targetUrl = `${mirror}${path}`;
    for (const proxyGen of publicProxies) {
      try {
        const proxyUrl = proxyGen(targetUrl);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(proxyUrl, { signal: controller.signal });
        clearTimeout(timer);
        if (res.ok) {
          const html = await res.text();
          if (html && html.length > 500 && (html.includes('truyen-tranh') || html.includes('book_avatar'))) {
            return html;
          }
        }
      } catch (e) {}
    }
  }
  return '';
}

function parseTruyenqqHtmlList(html: string): { items: MangaItem[]; totalPages: number } {
  const pageMatches = [...html.matchAll(/\/trang-(\d+)/g)];
  let maxPage = 1;
  for (const pm of pageMatches) {
    const p = parseInt(pm[1], 10);
    if (p > maxPage && p < 10000) maxPage = p;
  }

  const items: MangaItem[] = [];
  const liBlocks = html.match(/<li>[\s\S]*?<div class="book_avatar">[\s\S]*?<\/li>/gi) || [];
  for (const block of liBlocks) {
    const slugMatch = block.match(/href="[^"]*\/truyen-tranh\/([^"]+)"/i);
    const titleMatch = block.match(/<h3[^>]*><a[^>]*title="([^"]+)"/i) || block.match(/<h3[^>]*><a[^>]*>([^<]+)<\/a>/i) || block.match(/alt="([^"]+)"/i);
    const imgMatch = block.match(/<img[^>]*src="([^"]+)"/i) || block.match(/data-original="([^"]+)"/i);
    const descMatch = block.match(/class="excerpt"[^>]*>([\s\S]*?)<\/div>/i);
    const statusMatch = block.match(/Tình trạng:\s*([^<]+)<\/p>/i);
    const otherTitleMatch = block.match(/Tên khác:\s*([^<]+)<\/div>/i);

    if (slugMatch && titleMatch) {
      const slug = slugMatch[1].replace(/^\/|\/$/g, '');
      const title = titleMatch[1].trim();
      const coverUrl = imgMatch ? imgMatch[1] : '';
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

export const mangaApi = {
  // 1. Get List / Home from selected source
  async getMangaList(source: MangaSource, page = 1, keyword = ''): Promise<{ items: MangaItem[]; totalPages: number }> {
    try {
      if (source === 'truyenqq') {
        try {
          const baseProxy = keyword
            ? `/api/proxy/truyenqq/search?q=${encodeURIComponent(keyword)}`
            : `/api/proxy/truyenqq/list?page=${page}`;
          const data = await fetchMangaApi(baseProxy);
          if (data && Array.isArray(data.items) && data.items.length > 0) {
            const items: MangaItem[] = data.items.map((item: any) => ({
              id: item.slug || item.id,
              title: item.title,
              slug: item.slug,
              coverUrl: getMangaImageUrl(item.coverUrl || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop'),
              description: item.description,
              status: item.status,
              altTitles: item.altTitles,
              source: 'truyenqq' as MangaSource,
              chapters: []
            }));
            return { items, totalPages: data.totalPages || 1 };
          }
        } catch (e: any) {
        }

        // Direct client fallback via public CORS proxy
        try {
          const path = keyword
            ? `/tim-kiem/trang-${page}?q=${encodeURIComponent(keyword)}`
            : `/truyen-moi-cap-nhat/trang-${page}`;
          const html = await fetchTruyenqqViaPublicCORS(path);
          if (html) {
            const parsed = parseTruyenqqHtmlList(html);
            if (parsed.items.length > 0) {
              return parsed;
            }
          }
        } catch (e: any) {
        }

        // Failover to OTruyen if TruyenQQ is blocked on network
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

        // Failover to CuuTruyen
        try {
          const ctResult = await this.getMangaList('cuutruyen', page, keyword);
          if (ctResult.items.length > 0) {
            return {
              items: ctResult.items.map(i => ({ ...i, source: 'otruyen' as MangaSource })),
              totalPages: ctResult.totalPages
            };
          }
        } catch (e) {}

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
                ? `https://uploads.mangadex.org/covers/${manga.id}/${coverFileName}.256.jpg`
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

        // Failover to OTruyen
        try {
          const otResult = await this.getMangaList('otruyen', page, keyword);
          if (otResult.items.length > 0) {
            return {
              items: otResult.items.map(i => ({ ...i, source: 'mangadex' as MangaSource })),
              totalPages: otResult.totalPages
            };
          }
        } catch (e) {}

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

        // Failover to OTruyen
        try {
          const otResult = await this.getMangaList('otruyen', page, keyword);
          if (otResult.items.length > 0) {
            return {
              items: otResult.items.map(i => ({ ...i, source: 'cuutruyen' as MangaSource })),
              totalPages: otResult.totalPages
            };
          }
        } catch (e) {}

        return { items: [], totalPages: 1 };
      }
      return { items: [], totalPages: 1 };
    } catch (err) {
      console.error('Error fetching manga list for source:', source, err);
      return { items: [], totalPages: 1 };
    }
  },

  // 2. Get Manga Detail & Chapters
  async getMangaDetail(source: MangaSource, idOrSlug: string): Promise<MangaItem | null> {
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
        try {
          const detailUrl = `/api/proxy/truyenqq/detail?slug=${encodeURIComponent(idOrSlug)}`;
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
                id: data.id || idOrSlug,
                title: data.title || 'Truyện Tranh',
                altTitles: data.altTitles || [],
                slug: data.slug || idOrSlug,
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

        // Try OTruyen fallback search if TruyenQQ returned 0 chapters
        try {
          const cleanTitle = idOrSlug.replace(/-\d+$/, '').replace(/-/g, ' ');
          const otResult = await this.getMangaList('otruyen', 1, cleanTitle);
          if (otResult.items.length > 0) {
            const matched = otResult.items[0];
            const otDetail = await this.getMangaDetail('otruyen', matched.id || matched.slug);
            if (otDetail && otDetail.chapters && otDetail.chapters.length > 0) {
              return {
                ...otDetail,
                id: idOrSlug,
                slug: idOrSlug,
                source: 'truyenqq'
              };
            }
          }
        } catch (e) {}

        return {
          id: idOrSlug,
          title: 'Truyện Tranh TruyenQQ',
          slug: idOrSlug,
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
        try {
          const targetParam = chapter.id || chapter.chapterApiUrl || '';
          const chapUrl = `/api/proxy/truyenqq/chapter?slug=${encodeURIComponent(targetParam)}`;
          const data = await fetchMangaApi(chapUrl);
          if (data && Array.isArray(data.pages) && data.pages.length > 0) {
            return data.pages.map((p: string) => getProxyImageUrl(p));
          }
        } catch (e: any) {
        }
        return [];
      } else if (chapter.source === 'otruyen' && chapter.chapterApiUrl) {
        try {
          const data = await fetchMangaApi(chapter.chapterApiUrl);
          if (data.status === 'success' && data.data?.item) {
            const domainCdn = data.data.domain_cdn || 'https://otruyenapi.com/uploads/comics';
            const chapterPath = data.data.item.chapter_path;
            const images = data.data.item.chapter_image || [];
            if (images.length > 0) {
              return images.map((img: any) => getProxyImageUrl(`${domainCdn}/${chapterPath}/${img.image_file}`));
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
              return fileNames.map((fn: string) => getProxyImageUrl(`https://uploads.mangadex.org/${folder}/${hash}/${fn}`));
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
          return rawPages.map((p: any) => getProxyImageUrl(p.image_url || p.url || p.src || p));
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
 * Helper to generate resilient image URLs
 */
export function getMangaImageUrl(url: string): string {
  if (!url) return 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop';
  return getProxyImageUrl(url);
}

export function getProxyImageUrl(url: string): string {
  if (!url) return '';
  if (url.includes('/api/proxy/image?url=')) return url;
  if (!url.startsWith('http')) return url;
  return `/api/proxy/image?url=${encodeURIComponent(url)}`;
}
