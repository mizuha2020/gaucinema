import { NavTab } from '../types';
import { systemApiService } from './systemApiService';
import { getFullApiUrl } from './apiConfig';

export type MangaSource = 'otruyen' | 'mangadex' | 'cuutruyen';

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

// Dynamic API Base URL Resolvers (Controlled in real-time by Admin Dashboard)
const getOtruyenBase = () => systemApiService.getActiveBaseUrl('manga', 'otruyen', 'https://otruyenapi.com/v1/api');
const getMangadexBase = () => systemApiService.getActiveBaseUrl('manga', 'mangadex', 'https://api.mangadex.org');
const getCuutruyenBase = () => systemApiService.getActiveBaseUrl('manga', 'cuutruyen', 'https://api.cuutruyen.net/v1');

async function fetchMangaApi(url: string): Promise<any> {
  // 1. Try Direct Fetch first (works on Android APK, Capacitor, and CORS-enabled browsers)
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json, text/plain, */*',
      }
    });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      if (data) return data;
    }
  } catch (e) {
    // Direct fetch failed or CORS blocked, fallback to proxies below
  }

  // 2. Try Backend Server Generic Proxy (if running in full-stack web/preview)
  try {
    const proxyUrl = getFullApiUrl(`/api/proxy/generic?url=${btoa(url)}`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(proxyUrl, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await res.json();
      }
    }
  } catch (e) {
    // Backend proxy unavailable (e.g. standalone APK without live backend server)
  }

  // 3. Try Public Web CORS Proxy fallback
  try {
    const publicProxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(publicProxyUrl, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    // Fallback failed
  }

  throw new Error(`Failed to fetch manga data from ${url}`);
}

export const mangaApi = {
  // 1. Get List / Home from selected source
  async getMangaList(source: MangaSource, page = 1, keyword = ''): Promise<{ items: MangaItem[]; totalPages: number }> {
    try {
      if (source === 'otruyen') {
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
                coverUrl: thumb,
                status: item.status,
                updatedAt: item.updatedAt,
                source: 'otruyen' as MangaSource,
                chapters: []
              };
            });
            const totalItems = data.data?.params?.pagination?.totalItems || rawItems.length * 16;
            const totalPages = Math.max(1, Math.ceil(totalItems / 24));
            return { items, totalPages };
          }
        } catch (e) {
          console.warn('OTruyen API error, using demo fallback:', e);
        }

        return {
          items: [
            {
              id: 'ot-demo-1',
              title: 'One Piece (Đảo Hải Tặc)',
              slug: 'one-piece',
              coverUrl: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=500&auto=format&fit=crop',
              description: 'Hành trình vĩ đại tìm kho báu One Piece.',
              status: 'ongoing',
              authors: ['Eiichiro Oda'],
              genres: ['Action', 'Adventure', 'Shounen'],
              source: 'otruyen',
              chapters: [
                { id: 'ot-ch-1', chapterNumber: '1', title: 'Chapter 1', source: 'otruyen', chapterApiUrl: `${getOtruyenBase()}/chapter/1` },
                { id: 'ot-ch-2', chapterNumber: '2', title: 'Chapter 2', source: 'otruyen', chapterApiUrl: `${getOtruyenBase()}/chapter/2` }
              ]
            }
          ],
          totalPages: 1
        };
      } else if (source === 'mangadex') {
        try {
          let url = `${getMangadexBase()}/manga?limit=24&offset=${(page - 1) * 24}&includes[]=cover_art&includes[]=author&contentRating[]=safe&contentRating[]=suggestive`;
          if (keyword) {
            url += `&title=${encodeURIComponent(keyword)}&order[relevance]=desc`;
          } else {
            // Default to Vietnamese manga with available readable chapters
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
              
              // Prioritize Vietnamese titles, then altTitles in Vietnamese, then English, then original
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
                coverUrl,
                description: desc,
                status: manga.attributes.status,
                authors,
                genres: manga.attributes.tags?.map((t: any) => t.attributes.name.en) || [],
                source: 'mangadex' as MangaSource,
                chapters: []
              };
            });
            const total = data.total || items.length;
            return { items, totalPages: Math.ceil(total / 24) || 1 };
          }
        } catch (e) {
          console.warn('MangaDex API network restriction or CORS. Using fallback demo items.', e);
        }

        // Fallback MangaDex list if network fails
        return {
          items: [
            {
              id: '77bee52c-d2d6-44ad-a33a-1734c1fe696a',
              title: 'Ta Muốn Trở Thành Chúa Tể Bóng Tối!',
              slug: '77bee52c-d2d6-44ad-a33a-1734c1fe696a',
              coverUrl: 'https://uploads.mangadex.org/covers/77bee52c-d2d6-44ad-a33a-1734c1fe696a/6079dd31-838b-4d61-87c4-121f3ad19158.jpg.256.jpg',
              description: 'Chàng trai Cid Kagenou mơ ước trở thành kẻ giật dây trong bóng tối.',
              status: 'ongoing',
              authors: ['Aizawa Daisuke'],
              genres: ['Action', 'Comedy', 'Fantasy', 'Isekai'],
              source: 'mangadex',
              chapters: []
            }
          ],
          totalPages: 1
        };
      } else if (source === 'cuutruyen') {
        try {
          const data = await fetchMangaApi(`${getCuutruyenBase()}/mangas?page=${page}${keyword ? `&query=${encodeURIComponent(keyword)}` : ''}`);
          const raw = data.data || data.mangas || data || [];
          const items: MangaItem[] = (Array.isArray(raw) ? raw : []).map((m: any) => ({
            id: String(m.id || m.slug),
            title: m.name || m.title || 'Untitled',
            slug: m.slug || String(m.id),
            coverUrl: m.cover_url || m.thumbnail_url || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop',
            description: m.description,
            status: m.status,
            source: 'cuutruyen' as MangaSource,
            chapters: []
          }));
          return { items, totalPages: 20 };
        } catch (e) {
          return {
            items: [
              {
                id: 'ct-1',
                title: 'Đảo Hải Tặc (CuuTruyen Mirror)',
                slug: 'dao-hai-tac',
                coverUrl: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=500&auto=format&fit=crop',
                description: 'Hành trình tìm kho báu One Piece',
                source: 'cuutruyen',
                chapters: [
                  { id: 'c1', chapterNumber: '1', title: 'Chapter 1', source: 'cuutruyen' },
                  { id: 'c2', chapterNumber: '2', title: 'Chapter 2', source: 'cuutruyen' }
                ]
              }
            ],
            totalPages: 1
          };
        }
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
      } else if (isNumeric && effectiveSource !== 'cuutruyen') {
        effectiveSource = 'cuutruyen';
      }

      if (effectiveSource === 'otruyen') {
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
          const data = await fetchMangaApi(`${getCuutruyenBase()}/mangas/${idOrSlug}`);
          const m = data.data || data;
          const chapters: MangaChapter[] = (m.chapters || []).map((ch: any) => ({
            id: String(ch.id),
            chapterNumber: String(ch.name || ch.chapter_number || '1'),
            title: ch.title ? `Chapter ${ch.name}: ${ch.title}` : `Chapter ${ch.name || '1'}`,
            source: 'cuutruyen'
          }));

          return {
            id: String(m.id || idOrSlug),
            title: m.name || m.title || 'Manga',
            slug: m.slug || idOrSlug,
            coverUrl: m.cover_url || m.thumbnail_url || '',
            description: m.description,
            status: m.status,
            chapters,
            source: 'cuutruyen'
          };
        } catch (e) {
          return {
            id: idOrSlug,
            title: 'Đảo Hải Tặc',
            slug: idOrSlug,
            coverUrl: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=500&auto=format&fit=crop',
            description: 'Hành trình One Piece',
            chapters: [
              { id: 'c1', chapterNumber: '1', title: 'Chapter 1', source: 'cuutruyen' }
            ],
            source: 'cuutruyen'
          };
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
      if (chapter.source === 'otruyen' && chapter.chapterApiUrl) {
        try {
          const data = await fetchMangaApi(chapter.chapterApiUrl);
          if (data.status === 'success' && data.data?.item) {
            const domainCdn = data.data.domain_cdn || 'https://otruyenapi.com/uploads/comics';
            const chapterPath = data.data.item.chapter_path;
            const images = data.data.item.chapter_image || [];
            if (images.length > 0) {
              return images.map((img: any) => `${domainCdn}/${chapterPath}/${img.image_file}`);
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
              // Direct MangaDex CDN image URLs (works directly on Web and Android APK)
              return fileNames.map((fn: string) => `https://uploads.mangadex.org/${folder}/${hash}/${fn}`);
            }
          }
        } catch (e) {
          console.warn('MangaDex chapter pages fetch failed:', e);
        }
        return [];
      } else if (chapter.source === 'cuutruyen') {
        try {
          const data = await fetchMangaApi(`${getCuutruyenBase()}/chapters/${chapter.id}`);
          const pages = data.data?.pages || data.pages || [];
          return pages.map((p: any) => p.url || p);
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
  return url;
}

export function getProxyImageUrl(url: string): string {
  if (!url || !url.startsWith('http')) return url;
  return url;
}
