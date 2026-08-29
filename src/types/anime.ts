// Types for the AniMapper API (https://animapper.net) used by Gấu Anime.

export type AnimeMediaType = 'ANIME' | 'MANGA';

export interface AnimeImages {
  coverXl?: string;
  coverLg?: string;
  coverMd?: string;
  coverColor?: string;
  bannerUrl?: string;
}

export interface AnimeSearchResult {
  id: number;
  mediaType: AnimeMediaType;
  titles: { en?: string; ja?: string; vi?: string; romaji?: string };
  images: AnimeImages;
  status?: string;
  season?: string;
  seasonYear?: number;
  startDate?: string;
  format?: string;
}

export interface AnimeSearchResponse {
  success: boolean;
  results: AnimeSearchResult[];
  total: number;
  limit: number;
  offset: number;
  hasNextPage: boolean;
}

export interface AnimeTitleMap {
  en?: string;
  ja?: string;
  vi?: string;
  romaji?: string;
}

export interface AnimeGenre {
  id: number;
  name: string;
}

export interface AnimeStudio {
  id: number;
  name: string;
  isAnimationStudio?: boolean;
  isMain?: boolean;
}

export interface AnimeTag {
  id: number;
  name: string;
  description?: string;
}

export interface AnimeTrailer {
  site?: string;
  trailerId?: string;
  thumbnail?: string;
}

export interface AnimeUnit {
  id: number;
  unitKind?: string;
  seasonNumber?: number;
  number?: number;
  absoluteNumber?: number;
  releaseDate?: string;
  durationMinutes?: number;
  imageUrl?: string;
  titles?: AnimeTitleMap;
  descriptions?: AnimeTitleMap;
  seasonName?: string;
  externalIds?: Array<{ source: string; externalKey: string | null; externalInt: number }>;
}

export interface AnimeProviderMapping {
  providerMediaId: string;
  similarity?: number;
  mappingType?: string;
}

export interface AnimeDetail {
  id: number;
  mediaType: AnimeMediaType;
  format?: string;
  status?: string;
  source?: string;
  countryOfOrigin?: string;
  startDate?: string;
  endDate?: string;
  season?: string;
  seasonYear?: number;
  totalUnits?: number;
  unitDurationMin?: number;
  hashtag?: string;
  createdAt?: number;
  updatedAt?: number;
  titles: AnimeTitleMap;
  descriptions?: AnimeTitleMap;
  images: AnimeImages;
  trailer?: AnimeTrailer;
  relations?: Array<{ relatedMediaId: number; relationType: string }>;
  genres?: AnimeGenre[];
  studios?: AnimeStudio[];
  tags?: AnimeTag[];
  externalIds?: Array<{ source: string; externalKey: string | null; externalInt: number }>;
  units?: AnimeUnit[];
  streamingProviders: Record<string, AnimeProviderMapping>;
}

export interface AnimeMetadataResponse {
  success: boolean;
  result: AnimeDetail;
}

export interface AnimeEpisode {
  episodeNumber: string;
  episodeId: string;
  server: string;
}

export interface AnimeEpisodesResponse {
  provider: string;
  limit: number;
  offset: number;
  total: number;
  hasNextPage: boolean;
  episodes: AnimeEpisode[];
}

export interface AnimeServersResponse {
  provider: string;
  servers: string[];
}

export type AnimeStreamType = 'HLS' | 'EMBED' | 'DIRECT';

export interface AnimeStreamSource {
  server: string;
  type: AnimeStreamType;
  corsProxyRequired: boolean;
  proxyHeaders?: { Referer?: string; Origin?: string } | null;
  url: string;
}

export const ANIME_PROVIDERS = ['ANIMEVIETSUB', 'ANIMETVN', 'NINIYO'] as const;
export type AnimeProvider = (typeof ANIME_PROVIDERS)[number];
