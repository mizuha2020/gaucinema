import { TMDB_API_KEY, TMDB_BASE_URL, tmdbFetch } from '../services/movieApi';
import type { Movie } from '../types';

const cache = new Map<string, string>();

export function isValidImdb(id: unknown): id is string {
  return typeof id === 'string' && /^tt\d{7,8}$/.test(id.trim());
}

function cacheKeyFor(movie: Pick<Movie, 'slug' | 'name' | 'origin_name' | 'year'>): string {
  const m = movie as any;
  return String(
    m?.slug || `${m?.origin_name || ''}|${m?.name || ''}|${m?.year || ''}`
  ).toLowerCase();
}

async function externalIds(tmdbId: string, type: 'tv' | 'movie', signal?: AbortSignal): Promise<string> {
  const paths = type === 'tv' ? ['tv', 'movie'] : ['movie', 'tv'];
  void type;
  for (const ty of paths) {
    try {
      // Ưu tiên backend proxy (có Bearer server-side), fallback direct TMDB trong tmdbFetch
      const j: any = await tmdbFetch(`${ty}/${tmdbId}/external_ids`, {});
      void signal;
      const id = j?.imdb_id ? String(j.imdb_id).trim() : '';
      if (isValidImdb(id)) return id;
    } catch {
      // thử type còn lại
    }
    // Fallback fetch trực tiếp (tmdbFetch đã thử, nhưng retry direct ở đây cho chắc khi proxy fail)
    try {
      const r = await fetch(`${TMDB_BASE_URL}/${ty}/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`, {
        headers: { Accept: 'application/json' },
        signal: signal as any,
      });
      if (!r.ok) continue;
      const j = await r.json().catch(() => null);
      const id = j?.imdb_id ? String(j.imdb_id).trim() : '';
      if (isValidImdb(id)) return id;
    } catch {
      // ignore
    }
  }
  return '';
}

function scoreCandidate(c: any, wantYear?: number): number {
  let s = 0;
  const pop = Number(c?.popularity) || 0;
  s += Math.min(pop, 100) / 100; // 0..1 ưu tiên nổi tiếng
  const vc = Number(c?.vote_count) || 0;
  if (vc > 20) s += 0.5;
  if (wantYear) {
    const d = String(c?.first_air_date || c?.release_date || '').slice(0, 4);
    const y = parseInt(d, 10);
    if (y === wantYear) s += 3;
    else if (Math.abs(y - wantYear) === 1) s += 1;
    else if (isFinite(y)) s -= 1;
  }
  return s;
}

async function searchTmdbForImdb(
  queries: string[],
  year: number | undefined,
  signal?: AbortSignal
): Promise<{ tmdbId: string; type: 'tv' | 'movie' } | null> {
  const tried = new Set<string>();
  for (const q of queries) {
    const query = String(q || '').trim();
    if (!query || tried.has(query.toLowerCase())) continue;
    tried.add(query.toLowerCase());
    for (const kind of ['tv', 'movie'] as const) {
      const endpoint = kind === 'tv' ? 'search/tv' : 'search/movie';
      let results: any[] = [];
      try {
        const j: any = await tmdbFetch(endpoint, { query, page: 1, language: 'vi-VN' } as any);
        if (Array.isArray(j?.results)) results = j.results;
      } catch {
        continue;
      }
      if (results.length === 0) continue;
      // Lọc sơ bộ theo năm nếu có (cho phép lệch 1 năm), nhưng không loại hết nếu không khớp
      let pool = results.slice(0, 10);
      if (year) {
        const matched = pool.filter((c) => {
          const d = String(c?.first_air_date || c?.release_date || '').slice(0, 4);
          const y = parseInt(d, 10);
          return isFinite(y) && Math.abs(y - year) <= 1;
        });
        if (matched.length > 0) pool = matched;
      }
      pool.sort((a, b) => scoreCandidate(b, year) - scoreCandidate(a, year));
      const best = pool[0];
      if (best?.id) return { tmdbId: String(best.id), type: kind };
    }
    if (signal?.aborted) return null;
  }
  return null;
}

/**
 * Resolve imdb_id cho skip-intro với 3 tầng:
 * 1) movie.imdb.id trực tiếp (nguồn KKPhim/OPhim có sẵn)
 * 2) movie.tmdb.id -> TMDB external_ids
 * 3) TMDB search theo origin_name/name (+year) -> external_ids (fix phim thiếu cả 2 id như Hồ Tâm)
 */
export async function resolveImdbId(
  movie: Pick<Movie, 'slug' | 'name' | 'origin_name' | 'year'> & { imdb?: any; tmdb?: any },
  signal?: AbortSignal
): Promise<string> {
  const direct = (movie as any)?.imdb?.id ? String((movie as any).imdb.id).trim() : '';
  if (isValidImdb(direct)) return direct;

  const key = cacheKeyFor(movie as any);
  if (key && cache.has(key)) return cache.get(key)!;

  const tmdbId = (movie as any)?.tmdb?.id ? String((movie as any).tmdb.id).trim() : '';
  const t = String((movie as any)?.tmdb?.type || '').toLowerCase();
  if (/^\d+$/.test(tmdbId)) {
    const preferred = t === 'movie' ? 'movie' : 'tv';
    const id = await externalIds(tmdbId, preferred as any, signal);
    if (isValidImdb(id)) {
      if (key) cache.set(key, id);
      return id;
    }
  }

  // Tầng 3: search TMDB theo tên (phim Hoa ngữ: origin_name chính xác hơn name Việt)
  const year = Number((movie as any)?.year) > 1900 ? Number((movie as any).year) : undefined;
  const queries = [
    (movie as any)?.origin_name,
    (movie as any)?.name,
  ].filter((q) => typeof q === 'string' && q.trim().length >= 2) as string[];
  if (queries.length === 0) return '';

  const found = await searchTmdbForImdb(queries, year, signal);
  if (!found) return '';
  const imdb = await externalIds(found.tmdbId, found.type, signal);
  if (isValidImdb(imdb)) {
    if (key) cache.set(key, imdb);
    return imdb;
  }
  return '';
}
