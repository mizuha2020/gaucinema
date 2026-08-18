export interface Category {
  id: string;
  name: string;
  slug: string;
}

export interface Country {
  id: string;
  name: string;
  slug: string;
}

export interface MovieEpisode {
  name: string;
  slug: string;
  filename: string;
  link_embed: string;
  link_m3u8: string;
}

export type ApiSource = 'all' | 'kkphim' | 'ophim' | 'nguonc';

export interface EpisodeServer {
  server_name: string;
  server_data: MovieEpisode[];
  source?: ApiSource;
}

export interface Movie {
  _id?: string;
  id?: string;
  name: string;
  origin_name: string;
  slug: string;
  content?: string;
  type?: 'single' | 'series' | 'hoathinh' | 'tvshows' | string;
  status?: string;
  poster_url: string;
  thumb_url: string;
  is_copyright?: boolean;
  sub_docquyen?: boolean;
  chieurap?: boolean;
  trailer_url?: string;
  time?: string;
  episode_current?: string;
  episode_total?: string;
  quality?: string;
  lang?: string;
  notify?: string;
  showtimes?: string;
  year?: number;
  view?: number;
  actor?: string[];
  director?: string[];
  category?: Category[];
  country?: Country[];
  episodes?: EpisodeServer[];
  created?: { time: string };
  modified?: { time: string };
  source?: ApiSource;
  sourceLabel?: string;
}

export interface MovieDetailResponse {
  status: boolean;
  msg: string;
  movie: Movie;
  episodes: EpisodeServer[];
}

export interface MovieListPagination {
  totalItems: number;
  totalItemsPerPage: number;
  currentPage: number;
  totalPages: number;
}

export interface MovieListResponse {
  status: boolean;
  items: Movie[];
  pagination?: MovieListPagination;
  titlePage?: string;
  breadCrumb?: Array<{ name: string; slug?: string; isCurrent?: boolean }>;
}

export interface UserProfile {
  id: string;
  name: string;
  avatar: string;
  color: string;
  isKid?: boolean;
  pin?: string;
  isPrimary?: boolean;
  createdAt?: number;
}

export type AccountRole = 'admin' | 'user';

export interface Account {
  id: string; // usually username or uid
  username: string;
  password?: string;
  role: AccountRole;
  displayName: string;
  status: 'active' | 'blocked';
  createdAt: number;
  updatedAt?: number;
  profilesCount?: number;
}

export interface CustomAvatar {
  id: string;
  url: string;
  name: string;
  addedBy?: string;
  createdAt: number;
}

export interface WatchHistoryItem {
  id: string;
  movieSlug: string;
  movieName: string;
  movieOriginName?: string;
  movieThumb: string;
  moviePoster?: string;
  episodeName: string;
  episodeSlug: string;
  serverName: string;
  linkM3u8: string;
  currentTime: number;
  duration: number;
  progressPercent: number;
  updatedAt: number;
}

export interface MyListItem {
  movieSlug: string;
  movieName: string;
  movieOriginName?: string;
  movieThumb: string;
  moviePoster?: string;
  year?: number;
  quality?: string;
  lang?: string;
  episode_current?: string;
  addedAt: number;
}

export type NavTab = 'home' | 'series' | 'single' | 'cinema' | 'anime' | 'tv-shows' | 'filter' | 'my-list' | 'history' | 'tv-live';
