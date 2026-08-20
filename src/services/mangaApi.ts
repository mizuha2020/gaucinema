import { NavTab } from '../types';

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

// OTruyen API Helper
const OTRUYEN_BASE = 'https://otruyenapi.com/v1/api';
const MANGADEX_BASE = 'https://api.mangadex.org';
const CUUTRUYEN_BASE = 'https://api.cuutruyen.net/v1';

export const mangaApi = {
  // 1. Get List / Home from selected source
  async getMangaList(source: MangaSource, page = 1, keyword = ''): Promise<{ items: MangaItem[]; totalPages: number }> {
    try {
      if (source === 'otruyen') {
        let url = `${OTRUYEN_BASE}/danh-sach/truyen-moi?page=${page}`;
        if (keyword) {
          url = `${OTRUYEN_BASE}/tim-kiem?keyword=${encodeURIComponent(keyword)}&page=${page}`;
        }
        const res = await fetch(url);
        const data = await res.json();
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
      } else if (source === 'mangadex') {
        try {
          let url = `${MANGADEX_BASE}/manga?limit=24&offset=${(page - 1) * 24}&includes[]=cover_art&includes[]=author`;
          if (keyword) {
            url += `&title=${encodeURIComponent(keyword)}`;
          }
          const res = await fetch(url);
          const data = await res.json();
          if (data.result === 'ok') {
            const items: MangaItem[] = data.data.map((manga: any) => {
              const rels = manga.relationships || [];
              const coverRel = rels.find((r: any) => r.type === 'cover_art');
              const authorRel = rels.find((r: any) => r.type === 'author');
              const coverFileName = coverRel?.attributes?.fileName;
              const coverUrl = coverFileName
                ? `https://uploads.mangadex.org/covers/${manga.id}/${coverFileName}.256.jpg`
                : 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop';
              const titleObj = manga.attributes.title;
              const title = titleObj.vi || titleObj.en || Object.values(titleObj)[0] || 'Unknown Manga';
              const descriptionObj = manga.attributes.description;
              const desc = descriptionObj?.vi || descriptionObj?.en || '';
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
            return { items, totalPages: 50 };
          }
        } catch (e) {
          console.warn('MangaDex API network restriction or CORS. Using fallback demo items.');
        }

        // Fallback MangaDex list if network/CORS fails
        return {
          items: [
            {
              id: 'md-demo-1',
              title: 'Solo Leveling (MangaDex Featured)',
              slug: 'solo-leveling',
              coverUrl: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=500&auto=format&fit=crop',
              description: 'Hành trình thăng cấp của thợ săn yếu nhất thế giới.',
              status: 'completed',
              authors: ['Chugong'],
              genres: ['Action', 'Fantasy', 'Adventure'],
              source: 'mangadex',
              chapters: [
                { id: 'md-ch-1', chapterNumber: '1', title: 'Chapter 1', source: 'mangadex' },
                { id: 'md-ch-2', chapterNumber: '2', title: 'Chapter 2', source: 'mangadex' }
              ]
            },
            {
              id: 'md-demo-2',
              title: 'Berserk (MangaDex Mirror)',
              slug: 'berserk',
              coverUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop',
              description: 'Câu chuyện bi tráng về Guts - Hiệp sĩ đen.',
              status: 'ongoing',
              authors: ['Kentaro Miura'],
              genres: ['Dark Fantasy', 'Action', 'Drama'],
              source: 'mangadex',
              chapters: [
                { id: 'md-ch-b1', chapterNumber: '1', title: 'Chapter 1', source: 'mangadex' }
              ]
            }
          ],
          totalPages: 1
        };
      } else if (source === 'cuutruyen') {
        try {
          const res = await fetch(`${CUUTRUYEN_BASE}/mangas?page=${page}${keyword ? `&query=${encodeURIComponent(keyword)}` : ''}`);
          const data = await res.json();
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
      if (source === 'otruyen') {
        const res = await fetch(`${OTRUYEN_BASE}/truyen-tranh/${idOrSlug}`);
        const data = await res.json();
        if (data.status === 'success' && data.data?.item) {
          const item = data.data.item;
          const domainCdn = data.data.domain_cdn || 'https://otruyenapi.com/uploads/comics';
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
            id: item.slug,
            title: item.name,
            altTitles: item.origin_name,
            slug: item.slug,
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
      } else if (source === 'mangadex') {
        try {
          const res = await fetch(`${MANGADEX_BASE}/manga/${idOrSlug}?includes[]=cover_art&includes[]=author`);
          const data = await res.json();
          if (data.result === 'ok') {
            const m = data.data;
            const rels = m.relationships || [];
            const coverRel = rels.find((r: any) => r.type === 'cover_art');
            const authorRel = rels.find((r: any) => r.type === 'author');
            const coverFileName = coverRel?.attributes?.fileName;
            const coverUrl = coverFileName
              ? `https://uploads.mangadex.org/covers/${m.id}/${coverFileName}.512.jpg`
              : '';
            const titleObj = m.attributes.title;
            const title = titleObj.vi || titleObj.en || Object.values(titleObj)[0] || '';
            const descObj = m.attributes.description;
            const description = descObj?.vi || descObj?.en || '';

            const feedRes = await fetch(`${MANGADEX_BASE}/manga/${idOrSlug}/feed?translatedLanguage[]=vi&translatedLanguage[]=en&limit=100&order[chapter]=asc`);
            const feedData = await feedRes.json();
            const chapters: MangaChapter[] = (feedData.data || []).map((ch: any) => ({
              id: ch.id,
              chapterNumber: ch.attributes.chapter || '1',
              title: ch.attributes.title ? `Ch. ${ch.attributes.chapter} - ${ch.attributes.title}` : `Chapter ${ch.attributes.chapter}`,
              translatedLanguage: ch.attributes.translatedLanguage,
              source: 'mangadex'
            }));

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
          // Demo fallback detail for demo items
          return {
            id: idOrSlug,
            title: 'Solo Leveling (Demo)',
            slug: idOrSlug,
            coverUrl: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=500&auto=format&fit=crop',
            description: 'Hành trình thăng cấp của thợ săn yếu nhất thế giới.',
            status: 'completed',
            chapters: [
              { id: 'ch-1', chapterNumber: '1', title: 'Chapter 1', source: 'mangadex' },
              { id: 'ch-2', chapterNumber: '2', title: 'Chapter 2', source: 'mangadex' }
            ],
            source: 'mangadex'
          };
        }
      } else if (source === 'cuutruyen') {
        try {
          const res = await fetch(`${CUUTRUYEN_BASE}/mangas/${idOrSlug}`);
          const data = await res.json();
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
  async getChapterPages(chapter: MangaChapter): Promise<string[]> {
    try {
      if (chapter.source === 'otruyen' && chapter.chapterApiUrl) {
        const res = await fetch(chapter.chapterApiUrl);
        const data = await res.json();
        if (data.status === 'success' && data.data?.item) {
          const domainCdn = data.data.domain_cdn || 'https://otruyenapi.com/uploads/comics';
          const chapterPath = data.data.item.chapter_path;
          const images = data.data.item.chapter_image || [];
          return images.map((img: any) => `${domainCdn}/${chapterPath}/${img.image_file}`);
        }
      } else if (chapter.source === 'mangadex') {
        try {
          const res = await fetch(`${MANGADEX_BASE}/at-home/server/${chapter.id}`);
          const data = await res.json();
          if (data.baseUrl) {
            const baseUrl = data.baseUrl;
            const hash = data.chapter.hash;
            const fileNames: string[] = data.chapter.data || [];
            return fileNames.map((fn: string) => `${baseUrl}/data/${hash}/${fn}`);
          }
        } catch (e) {
          // Fallback sample manga pages
          return [
            'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop',
            'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=800&auto=format&fit=crop',
            'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop'
          ];
        }
      } else if (chapter.source === 'cuutruyen') {
        try {
          const res = await fetch(`${CUUTRUYEN_BASE}/chapters/${chapter.id}`);
          const data = await res.json();
          const pages = data.data?.pages || data.pages || [];
          return pages.map((p: any) => p.url || p);
        } catch (e) {
          return [
            'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop',
            'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=800&auto=format&fit=crop'
          ];
        }
      }
      return [
        'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop'
      ];
    } catch (err) {
      console.error('Error fetching chapter pages:', err);
      return [
        'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop'
      ];
    }
  }
};
