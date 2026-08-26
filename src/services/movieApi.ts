import { Movie, MovieDetailResponse, MovieListResponse, EpisodeServer, ApiSource } from '../types';
import { getFullApiUrl } from './apiConfig';
import { systemApiService } from './systemApiService';

export interface SourceOption {
  id: ApiSource;
  name: string;
  shortName: string;
  badgeColor: string;
  description: string;
  hasM3u8: boolean;
  hasEmbed: boolean;
}

export const API_SOURCES: SourceOption[] = [
  {
    id: 'all',
    name: 'Tất cả nguồn (All-in-One)',
    shortName: 'Tổng hợp',
    badgeColor: 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white',
    description: 'Tự động tổng hợp và tìm kiếm từ KKPhim, OPhim và NguonC',
    hasM3u8: true,
    hasEmbed: true,
  },
  {
    id: 'kkphim',
    name: 'KKPhim (Vietsub & M3U8)',
    shortName: 'KKPhim',
    badgeColor: 'bg-emerald-900/80 text-emerald-300 border border-emerald-700/60',
    description: 'Kho phim chất lượng cao, luồng HLS .m3u8 mượt mà, đầy đủ TMDB/IMDb',
    hasM3u8: true,
    hasEmbed: true,
  },
  {
    id: 'ophim',
    name: 'OPhim (Vietsub VIP)',
    shortName: 'OPhim',
    badgeColor: 'bg-sky-900/80 text-sky-300 border border-sky-700/60',
    description: 'Kho phim bộ & phim lẻ cập nhật liên tục, server VIP Vietsub',
    hasM3u8: true,
    hasEmbed: true,
  },
  {
    id: 'nguonc',
    name: 'NguonC (Vietsub Fast)',
    shortName: 'NguonC',
    badgeColor: 'bg-amber-900/80 text-amber-300 border border-amber-700/60',
    description: 'Nguồn phim độc lập, streaming tốc độ cao, phong phú anime và TV shows',
    hasM3u8: false,
    hasEmbed: true,
  },
];

// Base fetchers using dynamic active base URLs
const getKKPhimUrl = (endpoint: string) => {
  const base = systemApiService.getActiveBaseUrl('movie', 'kkphim', 'https://phimapi.com');
  return `${base.replace(/\/$/, '')}/${endpoint.replace(/^\//, '')}`;
};

const getOPhimUrl = (endpoint: string) => {
  const base = systemApiService.getActiveBaseUrl('movie', 'ophim', 'https://ophim1.com');
  return `${base.replace(/\/$/, '')}/${endpoint.replace(/^\//, '')}`;
};

const getNguonCUrl = (endpoint: string) => {
  const base = systemApiService.getActiveBaseUrl('movie', 'nguonc', 'https://phim.nguonc.com');
  return `${base.replace(/\/$/, '')}/api/${endpoint.replace(/^\//, '')}`;
};

// Current active source preference stored in memory/localStorage
let activeApiSource: ApiSource = (typeof window !== 'undefined' && (localStorage.getItem('qtb_api_source') as ApiSource)) || 'all';

export function getActiveApiSource(): ApiSource {
  return activeApiSource;
}

export function setActiveApiSource(source: ApiSource) {
  activeApiSource = source;
  if (typeof window !== 'undefined') {
    localStorage.setItem('qtb_api_source', source);
    window.dispatchEvent(new CustomEvent('qtb_source_changed', { detail: source }));
  }
}

// Format image URL properly across all CDNs
export function getImageUrl(path?: string, source?: ApiSource | string): string {
  if (!path) {
    return 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=800&auto=format&fit=crop&q=80';
  }
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const cleanPath = path.replace(/^\//, '');

  if (source === 'nguonc' || cleanPath.startsWith('public/images/')) {
    return `https://phim.nguonc.com/${cleanPath}`;
  }

  if (source === 'kkphim' || cleanPath.startsWith('uploads/movies/202')) {
    return `https://phimimg.com/${cleanPath}`;
  }

  // Default to OPhim / KKPhim standard CDN
  if (cleanPath.startsWith('uploads/movies/')) {
    return `https://img.ophim.live/${cleanPath}`;
  }
  return `https://img.ophim.live/uploads/movies/${cleanPath}`;
}

// Client-side bounded LRU cache to prevent memory buildup
class ClientLRUCache<K, V> {
  private max: number;
  private cache: Map<K, { data: V; time: number }>;

  constructor(max = 300) {
    this.max = max;
    this.cache = new Map();
  }

  get(key: K, ttlMs: number): V | null {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() - item.time > ttlMs) {
      this.cache.delete(key);
      return null;
    }
    // Refresh LRU
    this.cache.delete(key);
    this.cache.set(key, item);
    return item.data;
  }

  set(key: K, data: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.max) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(key, { data, time: Date.now() });
  }

  clear(): void {
    this.cache.clear();
  }
}

const cache = new ClientLRUCache<string, any>(300);
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

async function cachedFetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const cached = cache.get(key, CACHE_TTL);
  if (cached !== null) {
    return cached;
  }
  try {
    const result = await fetcher();
    cache.set(key, result);
    return result;
  } catch (err) {
    // If cache had stale data, we can fallback, otherwise rethrow or return empty
    throw err;
  }
}

// Base Fetcher for each source with safe error catching
async function fetchKKPhim<T>(endpoint: string, params?: Record<string, any>): Promise<T> {
  const clean = endpoint.replace(/^\//, '');
  const query = params ? '?' + new URLSearchParams(params as any).toString() : '';

  // 1. Try proxy
  try {
    const res = await fetch(getFullApiUrl(`/api/proxy/kkphim/${clean}${query}`));
    if (res.ok) {
      const data = await res.json();
      if (data && (data.status === true || data.items || data.data?.items || data.movie)) return data;
    }
  } catch {}

  // 2. Try direct
  try {
    const directUrl = `${getKKPhimUrl(clean)}${query}`;
    const res = await fetch(directUrl);
    if (res.ok) {
      return await res.json();
    }
  } catch {}

  return { status: false, items: [], msg: 'KKPhim fetch failed' } as unknown as T;
}

async function fetchOPhim<T>(endpoint: string, params?: Record<string, any>): Promise<T> {
  const clean = endpoint.replace(/^\//, '');
  const query = params ? '?' + new URLSearchParams(params as any).toString() : '';

  // 1. Try proxy
  try {
    const res = await fetch(getFullApiUrl(`/api/proxy/ophim/${clean}${query}`));
    if (res.ok) {
      const data = await res.json();
      if (data && (data.status === true || data.status === 'success' || data.items || data.data?.items || data.movie)) return data;
    }
  } catch {}

  // 2. Try direct
  try {
    const directUrl = `${getOPhimUrl(clean)}${query}`;
    const res = await fetch(directUrl);
    if (res.ok) {
      return await res.json();
    }
  } catch {}

  return { status: false, items: [], msg: 'OPhim fetch failed' } as unknown as T;
}

async function fetchNguonC<T>(endpoint: string, params?: Record<string, any>): Promise<T> {
  const clean = endpoint.replace(/^\//, '');
  const query = params ? '?' + new URLSearchParams(params as any).toString() : '';

  // 1. Try proxy
  try {
    const res = await fetch(getFullApiUrl(`/api/proxy/nguonc/${clean}${query}`));
    if (res.ok) {
      const data = await res.json();
      if (data && (data.status === 'success' || data.items || data.movie)) return data;
    }
  } catch {}

  // 2. Try direct
  try {
    const directUrl = `${getNguonCUrl(clean)}${query}`;
    const res = await fetch(directUrl);
    if (res.ok) {
      return await res.json();
    }
  } catch {}

  return { status: 'error', items: [], msg: 'NguonC fetch failed' } as unknown as T;
}

export const GENRES = [
  { name: 'Hành Động', slug: 'hanh-dong' },
  { name: 'Tình Cảm', slug: 'tinh-cam' },
  { name: 'Hài Hước', slug: 'hai-huoc' },
  { name: 'Cổ Trang', slug: 'co-trang' },
  { name: 'Tâm Lý', slug: 'tam-ly' },
  { name: 'Hình Sự', slug: 'hinh-su' },
  { name: 'Chiến Tranh', slug: 'chien-tranh' },
  { name: 'Thể Thao', slug: 'the-thao' },
  { name: 'Võ Thuật', slug: 'vo-thuat' },
  { name: 'Viễn Tưởng', slug: 'vien-tuong' },
  { name: 'Phiêu Lưu', slug: 'phieu-luu' },
  { name: 'Khoa Học', slug: 'khoa-hoc' },
  { name: 'Kinh Dị', slug: 'kinh-di' },
  { name: 'Âm Nhạc', slug: 'am-nhac' },
  { name: 'Thần Thoại', slug: 'than-thoai' },
  { name: 'Tài Liệu', slug: 'tai-lieu' },
  { name: 'Gia Đình', slug: 'gia-dinh' },
  { name: 'Bí Ẩn', slug: 'bi-an' },
  { name: 'Học Đường', slug: 'hoc-duong' },
  { name: 'Kinh Điển', slug: 'kinh-dien' },
];

export const COUNTRIES = [
  { name: 'Hàn Quốc', slug: 'han-quoc' },
  { name: 'Trung Quốc', slug: 'trung-quoc' },
  { name: 'Âu Mỹ', slug: 'au-my' },
  { name: 'Nhật Bản', slug: 'nhat-ban' },
  { name: 'Việt Nam', slug: 'viet-nam' },
  { name: 'Thái Lan', slug: 'thai-lan' },
  { name: 'Hồng Kông', slug: 'hong-kong' },
  { name: 'Đài Loan', slug: 'dai-loan' },
  { name: 'Ấn Độ', slug: 'an-do' },
  { name: 'Anh', slug: 'anh' },
  { name: 'Pháp', slug: 'phap' },
];

export const YEARS = Array.from({ length: 15 }, (_, i) => 2026 - i);

// Normalize single movie item
function normalizeMovieItem(raw: any, source: ApiSource = 'kkphim'): Movie {
  const src = raw.source || source;
  const srcLabel = src === 'kkphim' ? 'KKPhim' : src === 'ophim' ? 'OPhim' : 'NguonC';

  return {
    _id: raw._id || raw.id || raw.slug,
    id: raw.id || raw._id || raw.slug,
    name: raw.name || raw.title || 'Chưa có tên',
    origin_name: raw.origin_name || raw.original_name || raw.name || '',
    slug: raw.slug || '',
    content: raw.content || raw.description || '',
    type: raw.type || 'single',
    status: raw.status || 'completed',
    poster_url: getImageUrl(raw.poster_url || raw.thumb_url, src),
    thumb_url: getImageUrl(raw.thumb_url || raw.poster_url, src),
    is_copyright: raw.is_copyright || false,
    sub_docquyen: raw.sub_docquyen || false,
    chieurap: raw.chieurap || false,
    trailer_url: raw.trailer_url || '',
    time: raw.time || raw.total_episodes || '',
    episode_current: raw.episode_current || raw.current_episode || (raw.episodes ? `${raw.episodes.length} tập` : 'Full'),
    episode_total: raw.episode_total || '',
    quality: raw.quality || 'FHD',
    lang: raw.lang || raw.language || 'Vietsub',
    notify: raw.notify || '',
    showtimes: raw.showtimes || '',
    year: raw.year ? Number(raw.year) : new Date().getFullYear(),
    view: raw.view || 0,
    actor: Array.isArray(raw.actor) ? raw.actor : raw.casts ? [raw.casts] : [],
    director: Array.isArray(raw.director) ? raw.director : raw.director ? [raw.director] : [],
    category: Array.isArray(raw.category) ? raw.category : Array.isArray(raw.categories) ? raw.categories : [],
    country: Array.isArray(raw.country) ? raw.country : Array.isArray(raw.countries) ? raw.countries : [],
    created: raw.created ? (typeof raw.created === 'string' ? { time: raw.created } : raw.created) : undefined,
    modified: raw.modified ? (typeof raw.modified === 'string' ? { time: raw.modified } : raw.modified) : undefined,
    source: src,
    sourceLabel: srcLabel,
  };
}

// Normalize movie list format across all API response types
function normalizeMovieList(raw: any, defaultSource: ApiSource = 'kkphim'): MovieListResponse {
  if (!raw) return { status: false, items: [] };

  if (raw?.data?.items && Array.isArray(raw.data.items)) {
    return {
      status: true,
      items: raw.data.items.map((m: any) => normalizeMovieItem(m, defaultSource)),
      pagination: raw.data.params?.pagination || raw.data.pagination,
      titlePage: raw.data.titlePage,
      breadCrumb: raw.data.breadCrumb,
    };
  }

  if (raw?.items && Array.isArray(raw.items)) {
    return {
      status: true,
      items: raw.items.map((m: any) => normalizeMovieItem(m, defaultSource)),
      pagination: raw.paginate
        ? {
            totalItems: raw.paginate.total_items || 0,
            totalItemsPerPage: raw.paginate.items_per_page || 24,
            currentPage: raw.paginate.current_page || 1,
            totalPages: raw.paginate.total_page || 1,
          }
        : raw.pagination,
      titlePage: raw.titlePage || raw.cat?.name || raw.cat?.title,
    };
  }

  return {
    status: false,
    items: [],
  };
}

export const movieApi = {
  // Current active source
  getActiveSource(): ApiSource {
    return getActiveApiSource();
  },

  setSource(source: ApiSource) {
    setActiveApiSource(source);
  },

  // 1. Phim mới cập nhật
  async getNewUpdated(page = 1, limit = 24, sourceOverride?: ApiSource): Promise<MovieListResponse> {
    const source = sourceOverride || getActiveApiSource();
    const cacheKey = `new-updated:${source}:${page}:${limit}`;

    return cachedFetch(cacheKey, async () => {
      if (source === 'kkphim') {
        const raw = await fetchKKPhim<any>('danh-sach/phim-moi-cap-nhat', { page });
        return normalizeMovieList(raw, 'kkphim');
      }
      if (source === 'ophim') {
        const raw = await fetchOPhim<any>('danh-sach/phim-moi-cap-nhat', { page });
        return normalizeMovieList(raw, 'ophim');
      }
      if (source === 'nguonc') {
        const raw = await fetchNguonC<any>('films/phim-moi-cap-nhat', { page });
        return normalizeMovieList(raw, 'nguonc');
      }

      // 'all' Mode: Fetch KKPhim + OPhim + NguonC concurrently & merge
      const [kk, op, nc] = await Promise.allSettled([
        fetchKKPhim<any>('danh-sach/phim-moi-cap-nhat', { page }),
        fetchOPhim<any>('danh-sach/phim-moi-cap-nhat', { page }),
        fetchNguonC<any>('films/phim-moi-cap-nhat', { page }),
      ]);

      const kkItems = kk.status === 'fulfilled' ? normalizeMovieList(kk.value, 'kkphim').items : [];
      const opItems = op.status === 'fulfilled' ? normalizeMovieList(op.value, 'ophim').items : [];
      const ncItems = nc.status === 'fulfilled' ? normalizeMovieList(nc.value, 'nguonc').items : [];

      const map = new Map<string, Movie>();
      // Interleave items from each source for variety
      const maxLen = Math.max(kkItems.length, opItems.length, ncItems.length);
      for (let i = 0; i < maxLen; i++) {
        if (kkItems[i] && !map.has(kkItems[i].slug)) map.set(kkItems[i].slug, kkItems[i]);
        if (opItems[i] && !map.has(opItems[i].slug)) map.set(opItems[i].slug, opItems[i]);
        if (ncItems[i] && !map.has(ncItems[i].slug)) map.set(ncItems[i].slug, ncItems[i]);
      }

      const merged = Array.from(map.values());
      return {
        status: true,
        items: merged,
        pagination: {
          totalItems: merged.length * 20,
          totalItemsPerPage: limit,
          currentPage: page,
          totalPages: 50,
        },
      };
    });
  },

  // 2. Phim bộ
  async getSeries(page = 1, limit = 24, sourceOverride?: ApiSource): Promise<MovieListResponse> {
    const source = sourceOverride || getActiveApiSource();
    const cacheKey = `series:${source}:${page}:${limit}`;

    return cachedFetch(cacheKey, async () => {
      if (source === 'kkphim') {
        const raw = await fetchKKPhim<any>('v1/api/danh-sach/phim-bo', { page, limit });
        return normalizeMovieList(raw, 'kkphim');
      }
      if (source === 'ophim') {
        const raw = await fetchOPhim<any>('v1/api/danh-sach/phim-bo', { page, limit });
        return normalizeMovieList(raw, 'ophim');
      }
      if (source === 'nguonc') {
        const raw = await fetchNguonC<any>('films/danh-sach/phim-bo', { page });
        return normalizeMovieList(raw, 'nguonc');
      }

      // 'all' Mode
      const [kk, op] = await Promise.allSettled([
        fetchKKPhim<any>('v1/api/danh-sach/phim-bo', { page, limit }),
        fetchOPhim<any>('v1/api/danh-sach/phim-bo', { page, limit }),
      ]);
      const kkList = kk.status === 'fulfilled' ? normalizeMovieList(kk.value, 'kkphim').items : [];
      const opList = op.status === 'fulfilled' ? normalizeMovieList(op.value, 'ophim').items : [];

      const map = new Map<string, Movie>();
      for (const m of [...kkList, ...opList]) {
        if (!map.has(m.slug)) map.set(m.slug, m);
      }

      return {
        status: true,
        items: Array.from(map.values()),
      };
    });
  },

  // 3. Phim lẻ
  async getSingleMovies(page = 1, limit = 24, sourceOverride?: ApiSource): Promise<MovieListResponse> {
    const source = sourceOverride || getActiveApiSource();
    const cacheKey = `single:${source}:${page}:${limit}`;

    return cachedFetch(cacheKey, async () => {
      if (source === 'kkphim') {
        const raw = await fetchKKPhim<any>('v1/api/danh-sach/phim-le', { page, limit });
        return normalizeMovieList(raw, 'kkphim');
      }
      if (source === 'ophim') {
        const raw = await fetchOPhim<any>('v1/api/danh-sach/phim-le', { page, limit });
        return normalizeMovieList(raw, 'ophim');
      }
      if (source === 'nguonc') {
        const raw = await fetchNguonC<any>('films/danh-sach/phim-le', { page });
        return normalizeMovieList(raw, 'nguonc');
      }

      const [kk, op] = await Promise.allSettled([
        fetchKKPhim<any>('v1/api/danh-sach/phim-le', { page, limit }),
        fetchOPhim<any>('v1/api/danh-sach/phim-le', { page, limit }),
      ]);
      const kkList = kk.status === 'fulfilled' ? normalizeMovieList(kk.value, 'kkphim').items : [];
      const opList = op.status === 'fulfilled' ? normalizeMovieList(op.value, 'ophim').items : [];

      const map = new Map<string, Movie>();
      for (const m of [...kkList, ...opList]) {
        if (!map.has(m.slug)) map.set(m.slug, m);
      }
      return { status: true, items: Array.from(map.values()) };
    });
  },

  // 4. Hoạt hình / Anime
  async getAnime(page = 1, limit = 24, sourceOverride?: ApiSource): Promise<MovieListResponse> {
    const source = sourceOverride || getActiveApiSource();
    const cacheKey = `anime:${source}:${page}:${limit}`;

    return cachedFetch(cacheKey, async () => {
      if (source === 'kkphim') {
        const raw = await fetchKKPhim<any>('v1/api/danh-sach/hoat-hinh', { page, limit });
        return normalizeMovieList(raw, 'kkphim');
      }
      if (source === 'ophim') {
        const raw = await fetchOPhim<any>('v1/api/danh-sach/hoat-hinh', { page, limit });
        return normalizeMovieList(raw, 'ophim');
      }
      if (source === 'nguonc') {
        const raw = await fetchNguonC<any>('films/danh-sach/hoat-hinh', { page });
        return normalizeMovieList(raw, 'nguonc');
      }

      const [kk, op, nc] = await Promise.allSettled([
        fetchKKPhim<any>('v1/api/danh-sach/hoat-hinh', { page, limit }),
        fetchOPhim<any>('v1/api/danh-sach/hoat-hinh', { page, limit }),
        fetchNguonC<any>('films/danh-sach/hoat-hinh', { page }),
      ]);
      const kkList = kk.status === 'fulfilled' ? normalizeMovieList(kk.value, 'kkphim').items : [];
      const opList = op.status === 'fulfilled' ? normalizeMovieList(op.value, 'ophim').items : [];
      const ncList = nc.status === 'fulfilled' ? normalizeMovieList(nc.value, 'nguonc').items : [];

      const map = new Map<string, Movie>();
      const maxLen = Math.max(kkList.length, opList.length, ncList.length);
      for (let i = 0; i < maxLen; i++) {
        if (kkList[i] && !map.has(kkList[i].slug)) map.set(kkList[i].slug, kkList[i]);
        if (opList[i] && !map.has(opList[i].slug)) map.set(opList[i].slug, opList[i]);
        if (ncList[i] && !map.has(ncList[i].slug)) map.set(ncList[i].slug, ncList[i]);
      }
      
      const merged = Array.from(map.values());
      return { 
        status: true, 
        items: merged,
        pagination: {
          totalItems: merged.length * 20,
          totalItemsPerPage: limit,
          currentPage: page,
          totalPages: 50,
        }
      };
    });
  },

  // 5. TV Shows
  async getTvShows(page = 1, limit = 24, sourceOverride?: ApiSource): Promise<MovieListResponse> {
    const source = sourceOverride || getActiveApiSource();
    const cacheKey = `tvshows:${source}:${page}:${limit}`;

    return cachedFetch(cacheKey, async () => {
      if (source === 'kkphim') {
        const raw = await fetchKKPhim<any>('v1/api/danh-sach/tv-shows', { page, limit });
        return normalizeMovieList(raw, 'kkphim');
      }
      if (source === 'ophim') {
        const raw = await fetchOPhim<any>('v1/api/danh-sach/tv-shows', { page, limit });
        return normalizeMovieList(raw, 'ophim');
      }
      if (source === 'nguonc') {
        const raw = await fetchNguonC<any>('films/danh-sach/tv-shows', { page });
        return normalizeMovieList(raw, 'nguonc');
      }

      const [kk, op, nc] = await Promise.allSettled([
        fetchKKPhim<any>('v1/api/danh-sach/tv-shows', { page, limit }),
        fetchOPhim<any>('v1/api/danh-sach/tv-shows', { page, limit }),
        fetchNguonC<any>('films/danh-sach/tv-shows', { page }),
      ]);
      const kkList = kk.status === 'fulfilled' ? normalizeMovieList(kk.value, 'kkphim').items : [];
      const opList = op.status === 'fulfilled' ? normalizeMovieList(op.value, 'ophim').items : [];
      const ncList = nc.status === 'fulfilled' ? normalizeMovieList(nc.value, 'nguonc').items : [];

      const map = new Map<string, Movie>();
      const maxLen = Math.max(kkList.length, opList.length, ncList.length);
      for (let i = 0; i < maxLen; i++) {
        if (kkList[i] && !map.has(kkList[i].slug)) map.set(kkList[i].slug, kkList[i]);
        if (opList[i] && !map.has(opList[i].slug)) map.set(opList[i].slug, opList[i]);
        if (ncList[i] && !map.has(ncList[i].slug)) map.set(ncList[i].slug, ncList[i]);
      }
      
      const merged = Array.from(map.values());
      return { 
        status: true, 
        items: merged,
        pagination: {
          totalItems: merged.length * 20,
          totalItemsPerPage: limit,
          currentPage: page,
          totalPages: 50,
        }
      };
    });
  },

  // 6. Lọc theo Thể loại
  async getByGenre(genreSlug: string, page = 1, limit = 24, sourceOverride?: ApiSource): Promise<MovieListResponse> {
    const source = sourceOverride || getActiveApiSource();
    const cacheKey = `genre:${genreSlug}:${source}:${page}:${limit}`;

    return cachedFetch(cacheKey, async () => {
      if (source === 'kkphim') {
        const raw = await fetchKKPhim<any>(`v1/api/the-loai/${genreSlug}`, { page, limit });
        return normalizeMovieList(raw, 'kkphim');
      }
      if (source === 'ophim') {
        const raw = await fetchOPhim<any>(`v1/api/the-loai/${genreSlug}`, { page, limit });
        return normalizeMovieList(raw, 'ophim');
      }
      if (source === 'nguonc') {
        const raw = await fetchNguonC<any>(`films/the-loai/${genreSlug}`, { page });
        return normalizeMovieList(raw, 'nguonc');
      }

      const [kk, op] = await Promise.allSettled([
        fetchKKPhim<any>(`v1/api/the-loai/${genreSlug}`, { page, limit }),
        fetchOPhim<any>(`v1/api/the-loai/${genreSlug}`, { page, limit }),
      ]);
      const kkList = kk.status === 'fulfilled' ? normalizeMovieList(kk.value, 'kkphim').items : [];
      const opList = op.status === 'fulfilled' ? normalizeMovieList(op.value, 'ophim').items : [];
      const map = new Map<string, Movie>();
      for (const m of [...kkList, ...opList]) {
        if (!map.has(m.slug)) map.set(m.slug, m);
      }
      return { status: true, items: Array.from(map.values()) };
    });
  },

  // 7. Lọc theo Quốc gia
  async getByCountry(countrySlug: string, page = 1, limit = 24, sourceOverride?: ApiSource): Promise<MovieListResponse> {
    const source = sourceOverride || getActiveApiSource();
    const cacheKey = `country:${countrySlug}:${source}:${page}:${limit}`;

    return cachedFetch(cacheKey, async () => {
      if (source === 'kkphim') {
        const raw = await fetchKKPhim<any>(`v1/api/quoc-gia/${countrySlug}`, { page, limit });
        return normalizeMovieList(raw, 'kkphim');
      }
      if (source === 'ophim') {
        const raw = await fetchOPhim<any>(`v1/api/quoc-gia/${countrySlug}`, { page, limit });
        return normalizeMovieList(raw, 'ophim');
      }
      if (source === 'nguonc') {
        const raw = await fetchNguonC<any>(`films/quoc-gia/${countrySlug}`, { page });
        return normalizeMovieList(raw, 'nguonc');
      }

      const [kk, op] = await Promise.allSettled([
        fetchKKPhim<any>(`v1/api/quoc-gia/${countrySlug}`, { page, limit }),
        fetchOPhim<any>(`v1/api/quoc-gia/${countrySlug}`, { page, limit }),
      ]);
      const kkList = kk.status === 'fulfilled' ? normalizeMovieList(kk.value, 'kkphim').items : [];
      const opList = op.status === 'fulfilled' ? normalizeMovieList(op.value, 'ophim').items : [];
      const map = new Map<string, Movie>();
      for (const m of [...kkList, ...opList]) {
        if (!map.has(m.slug)) map.set(m.slug, m);
      }
      return { status: true, items: Array.from(map.values()) };
    });
  },

  // 8. Tìm kiếm đa nguồn & Diễn viên thông minh (Smart Multi-Source & Cast Search)
  async search(keyword: string, page = 1, limit = 24, sourceOverride?: ApiSource): Promise<MovieListResponse> {
    if (!keyword.trim()) return { status: true, items: [] };
    const kw = keyword.trim();
    const source = sourceOverride || getActiveApiSource();
    const cacheKey = `search:${kw}:${source}:${page}:${limit}`;

    return cachedFetch(cacheKey, async () => {
      // If a specific source is selected, try it first
      if (source !== 'all') {
        let singleResult: MovieListResponse | null = null;
        try {
          if (source === 'kkphim') {
            const raw = await fetchKKPhim<any>('v1/api/tim-kiem', { keyword: kw, page, limit });
            singleResult = normalizeMovieList(raw, 'kkphim');
          } else if (source === 'ophim') {
            const raw = await fetchOPhim<any>('v1/api/tim-kiem', { keyword: kw, page, limit });
            singleResult = normalizeMovieList(raw, 'ophim');
          } else if (source === 'nguonc') {
            const raw = await fetchNguonC<any>('films/search', { keyword: kw, page });
            singleResult = normalizeMovieList(raw, 'nguonc');
          }
        } catch {}

        // If specific source found items, return it!
        if (singleResult && singleResult.items && singleResult.items.length > 0) {
          return singleResult;
        }
        // If 0 items were found (common when searching for actors/directors because upstream only indexes titles),
        // seamlessly fallback to our Smart Actor/Multi-source search below!
      }

      // Smart Aggregator & Cast Search via server proxy
      try {
        const res = await fetch(getFullApiUrl(`/api/proxy/search-all?keyword=${encodeURIComponent(kw)}`));
        if (res.ok) {
          const payload = await res.json();
          if (payload?.items && Array.isArray(payload.items) && payload.items.length > 0) {
            let filtered = payload.items;
            if (source !== 'all') {
              const bySource = payload.items.filter((m: any) => m.source === source);
              if (bySource.length > 0) filtered = bySource;
            }
            return {
              status: true,
              items: filtered.map((m: any) => normalizeMovieItem(m, m.source || 'kkphim')),
              pagination: {
                totalItems: filtered.length,
                totalItemsPerPage: limit,
                currentPage: 1,
                totalPages: Math.max(1, Math.ceil(filtered.length / limit)),
              },
            };
          }
        }
      } catch {}

      // Fallback: parallel client search across all sources
      const [kk, op, nc] = await Promise.allSettled([
        fetchKKPhim<any>('v1/api/tim-kiem', { keyword: kw, limit: 16 }),
        fetchOPhim<any>('v1/api/tim-kiem', { keyword: kw, limit: 16 }),
        fetchNguonC<any>('films/search', { keyword: kw }),
      ]);

      const kkList = kk.status === 'fulfilled' ? normalizeMovieList(kk.value, 'kkphim').items : [];
      const opList = op.status === 'fulfilled' ? normalizeMovieList(op.value, 'ophim').items : [];
      const ncList = nc.status === 'fulfilled' ? normalizeMovieList(nc.value, 'nguonc').items : [];

      const map = new Map<string, Movie>();
      for (const m of [...kkList, ...opList, ...ncList]) {
        if (!map.has(m.slug)) map.set(m.slug, m);
      }

      const merged = Array.from(map.values());
      return {
        status: true,
        items: merged,
        pagination: {
          totalItems: merged.length,
          totalItemsPerPage: limit,
          currentPage: 1,
          totalPages: Math.max(1, Math.ceil(merged.length / limit)),
        },
      };
    });
  },

  // 9. Top Trending (Movies with most views)
  async getTrending(limit = 10, type?: 'series' | 'single'): Promise<MovieListResponse> {
    const source = getActiveApiSource();
    const cacheKey = `trending:${source}:${limit}:${type || 'all'}`;

    return cachedFetch(cacheKey, async () => {
      // Fetch data based on type
      let p1: any, p2: any;
      if (type === 'series') {
        [p1, p2] = await Promise.allSettled([
          this.getSeries(1, 24),
          this.getSeries(2, 24),
        ]);
      } else if (type === 'single') {
        [p1, p2] = await Promise.allSettled([
          this.getSingleMovies(1, 24),
          this.getSingleMovies(2, 24),
        ]);
      } else {
        [p1, p2] = await Promise.allSettled([
          this.getNewUpdated(1, 24),
          this.getNewUpdated(2, 24),
        ]);
      }
      
      let items: Movie[] = [];
      if (p1.status === 'fulfilled') items = [...items, ...p1.value.items];
      if (p2.status === 'fulfilled') items = [...items, ...p2.value.items];

      if (items.length === 0) return { status: false, items: [] };

      // Sort by views
      const sorted = items
        .filter((m, index, self) => self.findIndex(t => t.slug === m.slug) === index) // Unique
        .sort((a, b) => (b.view || 0) - (a.view || 0));
      
      if (sorted[0]?.view === sorted[sorted.length - 1]?.view) {
        // Fallback if APIs don't return view counts: 
        // Pick from page 2 (index 20+) so it doesn't overlap with the start of page 1.
        return {
          status: true,
          items: items.slice(20, 20 + limit),
        };
      }

      return {
        status: true,
        items: sorted.slice(0, limit),
      };
    });
  },

  // 10. Phim Chiếu Rạp
  async getTheaterMovies(page = 1, limit = 24, sourceOverride?: ApiSource): Promise<MovieListResponse> {
    const source = sourceOverride || getActiveApiSource();
    const cacheKey = `theater:${source}:${page}:${limit}`;

    return cachedFetch(cacheKey, async () => {
      if (source === 'kkphim') {
        const raw = await fetchKKPhim<any>('v1/api/danh-sach/phim-chieu-rap', { page, limit });
        return normalizeMovieList(raw, 'kkphim');
      }
      if (source === 'ophim') {
        const raw = await fetchOPhim<any>('v1/api/danh-sach/phim-chieu-rap', { page, limit });
        return normalizeMovieList(raw, 'ophim');
      }
      if (source === 'nguonc') {
        const raw = await fetchNguonC<any>('films/danh-sach/phim-chieu-rap', { page });
        return normalizeMovieList(raw, 'nguonc');
      }

      const [kk, op] = await Promise.allSettled([
        fetchKKPhim<any>('v1/api/danh-sach/phim-chieu-rap', { page, limit }),
        fetchOPhim<any>('v1/api/danh-sach/phim-chieu-rap', { page, limit }),
      ]);
      const kkList = kk.status === 'fulfilled' ? normalizeMovieList(kk.value, 'kkphim').items : [];
      const opList = op.status === 'fulfilled' ? normalizeMovieList(op.value, 'ophim').items : [];
      const map = new Map<string, Movie>();
      for (const m of [...kkList, ...opList]) {
        if (!map.has(m.slug)) map.set(m.slug, m);
      }
      return { status: true, items: Array.from(map.values()) };
    });
  },

  // 11. Chi tiết phim + Danh sách tập (Hỗ trợ đổi nguồn & gộp Server phát)
  async getMovieDetail(slug: string, preferredSource?: ApiSource): Promise<MovieDetailResponse> {
    if (!slug) throw new Error('Mã phim không hợp lệ');
    const cacheKey = `detail:${slug}:${preferredSource || 'any'}`;

    return cachedFetch(cacheKey, async () => {
      let data: any = null;
      let detectedSource: ApiSource = preferredSource || 'kkphim';

      // 1. Try KKPhim first
      if (!preferredSource || preferredSource === 'kkphim' || preferredSource === 'all') {
        try {
          data = await fetchKKPhim<any>(`phim/${slug}`);
          if (data && (data.status === true || data.movie)) {
            detectedSource = 'kkphim';
          }
        } catch {}
      }

      // 2. Try OPhim if KKPhim didn't return
      if ((!data || !data.movie) && (!preferredSource || preferredSource === 'ophim' || preferredSource === 'all')) {
        try {
          data = await fetchOPhim<any>(`phim/${slug}`);
          if (data && (data.status === true || data.movie)) {
            detectedSource = 'ophim';
          }
        } catch {}
      }

      // 3. Try NguonC if still not found
      if ((!data || !data.movie) && (!preferredSource || preferredSource === 'nguonc' || preferredSource === 'all')) {
        try {
          data = await fetchNguonC<any>(`film/${slug}`);
          if (data && (data.status === 'success' || data.movie)) {
            detectedSource = 'nguonc';
          }
        } catch {}
      }

      // 4. General fallback proxy if still not found
      if (!data || !data.movie) {
        try {
          const res = await fetch(getFullApiUrl(`/api/proxy/movie/phim/${slug}`));
          if (res.ok) data = await res.json();
        } catch {}
      }

      if (!data || (!data.status && !data.movie)) {
        throw new Error('Không thể tải thông tin chi tiết phim từ các nguồn Vietsub');
      }

      const rawMovie = data.movie || data;
      const movie = normalizeMovieItem(rawMovie, detectedSource);

      // Parse episodes
      const rawEpisodes = data.episodes || rawMovie.episodes || [];
      const episodes: EpisodeServer[] = Array.isArray(rawEpisodes)
        ? rawEpisodes.map((s: any) => {
            const serverName = s.server_name || s.name || 'Server Vietsub';
            const items = s.server_data || s.items || [];
            return {
              server_name: serverName,
              source: detectedSource,
              server_data: Array.isArray(items)
                ? items.map((ep: any) => ({
                    name: String(ep.name || ep.episode_name || '1'),
                    slug: String(ep.slug || ep.episode_slug || ep.name || '1'),
                    filename: ep.filename || movie.name,
                    link_embed: ep.link_embed || ep.embed || '',
                    link_m3u8: ep.link_m3u8 || ep.m3u8 || ep.link_embed || '',
                  }))
                : [],
            };
          })
        : [];

      return {
        status: true,
        msg: data.msg || 'done',
        movie: {
          ...movie,
          episodes,
        },
        episodes,
      };
    });
  },
};
