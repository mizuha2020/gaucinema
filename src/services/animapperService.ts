import {
  AnimeDetail,
  AnimeEpisode,
  AnimeEpisodesResponse,
  AnimeMediaType,
  AnimeMetadataResponse,
  AnimeSearchResponse,
  AnimeServersResponse,
  AnimeStreamSource,
  AnimeTitleMap,
} from '../types/anime';

const API_BASE = '/api/proxy/animapper';

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    throw new Error(`Animapper request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

export interface AnimeSearchParams {
  title?: string;
  mediaType?: AnimeMediaType;
  limit?: number;
  offset?: number;
  status?: string;
  format?: string;
  season?: string;
  seasonYear?: number;
  genreIds?: string;
  tagIds?: string;
  sortBy?: string;
  sortOrder?: string;
  countryOfOrigin?: string;
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '' && v !== null) usp.append(k, String(v));
  });
  const s = usp.toString();
  return s ? `?${s}` : '';
}

export const animapperService = {
  async search(params: AnimeSearchParams): Promise<AnimeSearchResponse> {
    const query = buildQuery({
      title: params.title,
      mediaType: params.mediaType,
      limit: params.limit ?? 24,
      offset: params.offset ?? 0,
      status: params.status,
      format: params.format,
      season: params.season,
      seasonYear: params.seasonYear,
      genreIds: params.genreIds,
      tagIds: params.tagIds,
      sortBy: params.sortBy,
      sortOrder: params.sortOrder,
      countryOfOrigin: params.countryOfOrigin,
    });
    return getJSON<AnimeSearchResponse>(`/search${query}`);
  },

  async getMetadata(id: number): Promise<AnimeMetadataResponse> {
    return getJSON<AnimeMetadataResponse>(`/metadata?id=${id}`);
  },

  async getEpisodes(
    id: number,
    provider: string,
    server?: string,
    limit = 0,
    offset = 0
  ): Promise<AnimeEpisodesResponse> {
    const query = buildQuery({ id, provider, server, limit, offset });
    return getJSON<AnimeEpisodesResponse>(`/stream/episodes${query}`);
  },

  async getServers(id: number, provider: string): Promise<AnimeServersResponse> {
    return getJSON<AnimeServersResponse>(`/stream/episodes/servers?id=${id}&provider=${provider}`);
  },

  async getSource(
    episodeData: string,
    provider: string,
    server?: string
  ): Promise<AnimeStreamSource> {
    const query = buildQuery({ episodeData, provider, server });
    return getJSON<AnimeStreamSource>(`/stream/source${query}`);
  },
};

export function bestTitle(titles: AnimeTitleMap | undefined): string {
  if (!titles) return 'Không có tiêu đề';
  return titles.vi || titles.en || titles.romaji || titles.ja || 'Không có tiêu đề';
}

export function coverImage(images: {
  coverXl?: string;
  coverLg?: string;
  coverMd?: string;
}): string {
  return images?.coverXl || images?.coverLg || images?.coverMd || '';
}

export function proxiedImage(url?: string): string {
  if (!url) return '';
  return `/api/proxy/image?url=${encodeURIComponent(url)}`;
}

export function proxiedStreamUrl(url: string, referer?: string, origin?: string): string {
  const params = new URLSearchParams();
  // base64-encode the raw URL, then percent-encode it so the proxy can safely
  // detect and decode it (avoids query-string escaping issues with m3u8 urls).
  const encoded = encodeURIComponent(btoa(unescape(encodeURIComponent(url))));
  params.set('url', encoded);
  if (referer) params.set('referer', referer);
  if (origin) params.set('origin', origin);
  return `/api/proxy/animapper-stream?${params.toString()}`;
}

export type { AnimeEpisode };
