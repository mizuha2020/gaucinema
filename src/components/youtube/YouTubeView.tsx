import React, { useEffect, useState, useCallback, useRef } from 'react';
import { YouTubeVideo, YouTubeChannel, UserProfile, Account } from '../../types';
import { youtubeApi, formatViews } from '../../services/youtubeApi';
import { firestoreStorage } from '../../services/firestoreStorage';
import { YouTubeVideoCard } from './YouTubeVideoCard';
import { YouTubePlayerModal } from './YouTubePlayerModal';
import { YouTubeChannelPageView } from './YouTubeChannelPageView';
import { YouTubeShareModal } from './YouTubeShareModal';
import {
  Play,
  Flame,
  Smartphone,
  Heart,
  Youtube,
  User,
  ChevronRight,
  Loader2,
  Sparkles,
  RefreshCw,
  Trash2,
  History,
  Bookmark,
} from 'lucide-react';

// Vietnam category tabs / filter chips
export const VIETNAM_TOPIC_PILLS = [
  { id: 'all', label: 'Tất cả' },
  { id: 'music_vn', label: 'Âm nhạc' },
  { id: 'news_vn', label: 'Tin tức' },
  { id: 'comedy_vn', label: 'Giải trí' },
  { id: 'gaming_vn', label: 'Trò chơi' },
  { id: 'review_phim', label: 'Phim ảnh' },
  { id: 'podcast_vn', label: 'Podcast' },
  { id: 'food_vn', label: 'Ẩm thực' },
  { id: 'tech_vn', label: 'Công nghệ' },
  { id: 'live_vn', label: 'Trực tiếp' },
];

const KEYWORD_STOPWORDS = new Set([
  'official', 'music', 'video', 'videos', 'mv', 'lyrics', 'lyric', 'audio',
  'visualizer', 'teaser', 'trailer', 'full', 'hd', '4k', 'live', 'shorts',
  'short', 'tiktok', 'remix', 'cover', 'beat', 'karaoke', 'version', 'part',
  'episode', 'season', 'new', 'update', 'the', 'and', 'with', 'for',
  'và', 'của', 'có', 'không', 'những', 'cho', 'với', 'tôi', 'bạn', 'anh',
  'em', 'là', 'một', 'các', 'này', 'đó', 'đã', 'sẽ', 'mới', 'nhất', 'hay',
  'hot', 'trend', 'viral', 'hôm', 'nay', 'tuần', 'xem', 'khi', 'về', 'từ',
]);

interface HomeSource {
  kind: 'channel' | 'search';
  channelId?: string;
  name?: string;
  query?: string;
}

export function extractHomeSources(
  history: YouTubeVideo[],
  favorites: YouTubeVideo[],
  subscribedChannelIds: string[]
): HomeSource[] {
  const channelScores = new Map<string, { id: string; name: string; score: number }>();
  const bump = (rawId: string | undefined, name: string, score: number) => {
    const trimmedName = (name || '').trim();
    const key = rawId || (trimmedName ? `name:${trimmedName.toLowerCase()}` : '');
    if (!key || key === 'channel_custom') return;
    const cur = channelScores.get(key);
    if (cur) cur.score += score;
    else channelScores.set(key, { id: rawId || '', name: trimmedName, score });
  };

  history.forEach((v, i) => bump(v.channelId, v.channelTitle, i < 10 ? 1 : 0.5));
  favorites.forEach((v) => bump(v.channelId, v.channelTitle, 1.5));
  subscribedChannelIds.forEach((id) => bump(id, '', 0.75));

  const wordCounts = new Map<string, number>();
  [...history, ...favorites].forEach((v) => {
    (v.title || '')
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length >= 3 && !KEYWORD_STOPWORDS.has(w) && !/^\d+$/.test(w))
      .forEach((w) => wordCounts.set(w, (wordCounts.get(w) || 0) + 1));
  });

  const topKeywords = [...wordCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([w]) => w);

  const sources: HomeSource[] = [...channelScores.values()]
    .filter((c) => c.score >= 0.7)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((c) => ({
      kind: 'channel' as const,
      ...(c.id ? { channelId: c.id } : { name: c.name }),
    }));

  if (topKeywords.length >= 2) {
    sources.push({ kind: 'search', query: topKeywords.slice(0, 5).join(' ') });
  }

  return sources;
}

async function fetchHomeSource(source: HomeSource): Promise<YouTubeVideo[]> {
  try {
    if (source.kind === 'channel') {
      const res = await youtubeApi.getChannelDetails(source.channelId, source.name);
      return res.items;
    }
    const res = await youtubeApi.searchFull(source.query || '');
    return res.items;
  } catch {
    return [];
  }
}

function interleaveVideos(groups: YouTubeVideo[][]): YouTubeVideo[] {
  const out: YouTubeVideo[] = [];
  const seen = new Set<string>();
  const maxLen = groups.reduce((m, g) => Math.max(m, g.length), 0);
  for (let i = 0; i < maxLen; i++) {
    for (const g of groups) {
      const v = g[i];
      if (v && !seen.has(v.id)) {
        seen.add(v.id);
        out.push(v);
      }
    }
  }
  return out;
}

const favsKey = (profileId?: string | null) => `gau_yt_favs_${profileId || 'default'}`;
const histKey = (profileId?: string | null) => `gau_yt_hist_${profileId || 'default'}`;
const subsKey = (profileId?: string | null) => `gau_yt_subs_${profileId || 'default'}`;

interface YouTubeViewProps {
  currentAccount?: Account | null;
  activeProfile: UserProfile | null;
  searchQuery?: string;
  activeCategory?: string;
  onChannelViewChange?: (isOpen: boolean) => void;
  onShowToast?: (msg: string) => void;
}

export const YouTubeView: React.FC<YouTubeViewProps> = ({
  currentAccount,
  activeProfile,
  searchQuery = '',
  activeCategory = 'all',
  onChannelViewChange,
  onShowToast,
}) => {
  const [videos, setVideos] = useState<YouTubeVideo[]>([]);
  const [channels, setChannels] = useState<YouTubeChannel[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [nextToken, setNextToken] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<YouTubeVideo | null>(null);
  const [selectedChannelView, setSelectedChannelView] = useState<YouTubeChannel | null>(null);
  const [shareVideoTarget, setShareVideoTarget] = useState<YouTubeVideo | null>(null);

  const [selectedVnTopic, setSelectedVnTopic] = useState<string>('all');

  const [favorites, setFavorites] = useState<YouTubeVideo[]>(() => {
    try {
      const saved = localStorage.getItem(favsKey(activeProfile?.id));
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [history, setHistory] = useState<YouTubeVideo[]>(() => {
    try {
      const saved = localStorage.getItem(histKey(activeProfile?.id));
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [subscriptions, setSubscriptions] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(subsKey(activeProfile?.id)) || localStorage.getItem('gau_yt_subscriptions');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const profileId = activeProfile?.id;
  const accountId = currentAccount?.id;

  useEffect(() => {
    let isMounted = true;

    const loadProfileData = async () => {
      try {
        const localFavs = JSON.parse(localStorage.getItem(favsKey(profileId)) || '[]');
        const localHist = JSON.parse(localStorage.getItem(histKey(profileId)) || '[]');
        const localSubs = JSON.parse(localStorage.getItem(subsKey(profileId)) || localStorage.getItem('gau_yt_subscriptions') || '[]');
        if (isMounted) {
          setFavorites(localFavs);
          setHistory(localHist);
          setSubscriptions(localSubs);
        }
      } catch {}

      if (accountId && profileId) {
        try {
          const [cloudFavs, cloudHist, cloudSubs] = await Promise.all([
            firestoreStorage.getYoutubeFavorites(accountId, profileId).catch(() => [] as YouTubeVideo[]),
            firestoreStorage.getYoutubeHistory(accountId, profileId).catch(() => [] as YouTubeVideo[]),
            firestoreStorage.getYoutubeSubscriptions(accountId, profileId).catch(() => [] as string[]),
          ]);

          if (isMounted) {
            if (cloudFavs.length > 0) {
              setFavorites(cloudFavs);
              localStorage.setItem(favsKey(profileId), JSON.stringify(cloudFavs));
            }
            if (cloudHist.length > 0) {
              setHistory(cloudHist);
              localStorage.setItem(histKey(profileId), JSON.stringify(cloudHist));
            }
            if (cloudSubs.length > 0) {
              setSubscriptions(cloudSubs);
              localStorage.setItem(subsKey(profileId), JSON.stringify(cloudSubs));
            }
          }
        } catch (e) {
          console.warn('Error syncing profile YouTube data from Firestore:', e);
        }
      }
    };

    loadProfileData();

    return () => {
      isMounted = false;
    };
  }, [accountId, profileId]);

  const favoritesRef = useRef<YouTubeVideo[]>(favorites);
  const historyRef = useRef<YouTubeVideo[]>(history);
  const subscriptionsRef = useRef<string[]>(subscriptions);
  useEffect(() => {
    favoritesRef.current = favorites;
    historyRef.current = history;
    subscriptionsRef.current = subscriptions;
  }, [favorites, history, subscriptions]);

  const homeSourcesRef = useRef<HomeSource[]>([]);
  const homeCursorRef = useRef(0);
  const opGenRef = useRef(0);

  interface FeedCacheEntry {
    videos: YouTubeVideo[];
    channels: YouTubeChannel[];
    nextToken: string | null;
  }
  const feedCacheRef = useRef<Map<string, FeedCacheEntry>>(new Map());

  const toggleFavorite = useCallback(
    async (v: YouTubeVideo) => {
      const exists = favoritesRef.current.some((item) => item.id === v.id);
      const updated = exists
        ? favoritesRef.current.filter((item) => item.id !== v.id)
        : [v, ...favoritesRef.current];

      setFavorites(updated);
      try {
        localStorage.setItem(favsKey(profileId), JSON.stringify(updated));
      } catch {}

      if (exists) {
        onShowToast?.('Đã xóa khỏi danh sách video đã lưu');
      } else {
        onShowToast?.('Đã lưu video thành công!');
      }

      if (accountId && profileId) {
        try {
          await firestoreStorage.toggleYoutubeFavorite(accountId, profileId, v);
        } catch (e) {
          console.warn('Failed to sync favorite to Firestore:', e);
        }
      }
    },
    [accountId, profileId, onShowToast]
  );

  const isFavorite = useCallback(
    (videoId: string) => {
      return favorites.some((f) => f.id === videoId);
    },
    [favorites]
  );

  const addToHistory = useCallback(
    async (v: YouTubeVideo) => {
      const filtered = historyRef.current.filter((item) => item.id !== v.id);
      const updated = [v, ...filtered].slice(0, 60);

      setHistory(updated);
      try {
        localStorage.setItem(histKey(profileId), JSON.stringify(updated));
      } catch {}

      if (accountId && profileId) {
        try {
          await firestoreStorage.saveYoutubeHistory(accountId, profileId, v);
        } catch (e) {
          console.warn('Failed to sync history to Firestore:', e);
        }
      }
    },
    [accountId, profileId]
  );

  const removeFromHistory = useCallback(
    async (videoId: string, e?: React.MouseEvent) => {
      e?.stopPropagation();
      const updated = historyRef.current.filter((item) => item.id !== videoId);
      setHistory(updated);
      try {
        localStorage.setItem(histKey(profileId), JSON.stringify(updated));
      } catch {}

      onShowToast?.('Đã xóa video khỏi lịch sử xem');

      if (accountId && profileId) {
        try {
          await firestoreStorage.removeYoutubeHistoryItem(accountId, profileId, videoId);
        } catch (e) {
          console.warn('Failed to remove history from Firestore:', e);
        }
      }
    },
    [accountId, profileId, onShowToast]
  );

  useEffect(() => {
    if (searchQuery || isLoading) return;
    if (activeCategory === 'saved' || activeCategory === 'watch_later' || activeCategory === 'liked') setVideos(favoritesRef.current);
    else if (activeCategory === 'history') setVideos(historyRef.current);
  }, [favorites, history, activeCategory, searchQuery, isLoading]);

  const effectiveCategory = activeCategory === 'trending' && selectedVnTopic !== 'all' ? selectedVnTopic : activeCategory;

  const fetchVideos = useCallback(
    async (opts?: { force?: boolean }) => {
      if (!searchQuery && (activeCategory === 'saved' || activeCategory === 'watch_later' || activeCategory === 'liked' || activeCategory === 'history')) {
        setChannels([]);
        setNextToken(null);
        setVideos(activeCategory === 'history' ? historyRef.current : favoritesRef.current);
        setIsLoading(false);
        return;
      }

      const cacheKey = searchQuery ? `q:${searchQuery}` : effectiveCategory;
      if (!opts?.force) {
        const cached = feedCacheRef.current.get(cacheKey);
        if (cached) {
          setChannels(cached.channels);
          setNextToken(cached.nextToken);
          setVideos(cached.videos);
          setIsLoading(false);
          return;
        }
      }

      const gen = ++opGenRef.current;
      setIsLoading(true);
      try {
        if (searchQuery) {
          const res = await youtubeApi.searchFull(searchQuery);
          if (gen !== opGenRef.current) return;
          setVideos(res.items);
          setChannels(res.channels);
          setNextToken(res.nextToken || null);
          return;
        }

        if (opts?.force) feedCacheRef.current.delete(cacheKey);

        let result: FeedCacheEntry;
        if (effectiveCategory === 'home') {
          const subs = subscriptionsRef.current;
          const sources = extractHomeSources(historyRef.current, favoritesRef.current, subs);
          homeSourcesRef.current = sources;
          homeCursorRef.current = 0;

          if (sources.length === 0) {
            const page = await youtubeApi.getTrendingPage('all');
            if (gen !== opGenRef.current) return;
            result = { videos: page.items, channels: [], nextToken: page.nextToken };
            if (page.items.length === 0) {
              const legacy = await youtubeApi.getTrending('all');
              if (gen !== opGenRef.current) return;
              result = { videos: legacy, channels: [], nextToken: null };
            }
          } else {
            const first = sources.slice(0, 3);
            homeCursorRef.current = first.length;
            const groups = await Promise.all(first.map((s) => fetchHomeSource(s)));
            if (gen !== opGenRef.current) return;
            const merged = interleaveVideos(groups);
            if (merged.length > 0) {
              result = { videos: merged, channels: [], nextToken: null };
            } else {
              homeSourcesRef.current = [];
              const page = await youtubeApi.getTrendingPage('all');
              if (gen !== opGenRef.current) return;
              result = { videos: page.items, channels: [], nextToken: page.nextToken };
            }
          }
        } else {
          const page = await youtubeApi.getTrendingPage(effectiveCategory === 'trending' ? 'all' : effectiveCategory);
          if (gen !== opGenRef.current) return;
          if (page.items.length > 0) {
            result = { videos: page.items, channels: [], nextToken: page.nextToken };
          } else {
            const legacy = await youtubeApi.getTrending(effectiveCategory === 'trending' ? 'all' : effectiveCategory);
            if (gen !== opGenRef.current) return;
            result = { videos: legacy, channels: [], nextToken: null };
          }
        }

        if (gen !== opGenRef.current) return;
        feedCacheRef.current.set(cacheKey, result);
        setVideos(result.videos);
        setChannels(result.channels);
        setNextToken(result.nextToken);
      } catch (e) {
        console.error('Failed to fetch YouTube videos:', e);
      } finally {
        if (gen === opGenRef.current) setIsLoading(false);
      }
    },
    [searchQuery, effectiveCategory, activeCategory]
  );

  useEffect(() => {
    if (searchQuery) {
      setSelectedChannelView(null);
    }
    fetchVideos();
  }, [fetchVideos, searchQuery, effectiveCategory]);

  const loadMoreVideos = useCallback(async () => {
    if (isLoadingMore) return;
    const gen = ++opGenRef.current;

    const appendById = (prev: YouTubeVideo[], incoming: YouTubeVideo[]): YouTubeVideo[] => {
      const seen = new Set(prev.map((item) => item.id));
      return [...prev, ...incoming.filter((item) => !seen.has(item.id))];
    };

    setIsLoadingMore(true);
    try {
      if (effectiveCategory === 'home' && !searchQuery && !nextToken) {
        const sources = homeSourcesRef.current;
        if (homeCursorRef.current < sources.length) {
          const src = sources[homeCursorRef.current++];
          const items = await fetchHomeSource(src);
          if (gen !== opGenRef.current) return;
          setVideos((prev) => appendById(prev, items));
          return;
        }
        const page = await youtubeApi.getTrendingPage('all');
        if (gen !== opGenRef.current) return;
        setNextToken(page.nextToken);
        setVideos((prev) => appendById(prev, page.items));
        return;
      }

      if (!nextToken) return;

      if (searchQuery) {
        const res = await youtubeApi.searchFull(searchQuery, nextToken);
        if (gen !== opGenRef.current) return;
        setVideos((prev) => appendById(prev, res.items));
        setChannels((prev) => {
          const seen = new Set(prev.map((c) => c.id));
          return [...prev, ...res.channels.filter((c) => !seen.has(c.id))];
        });
        setNextToken(res.nextToken || null);
      } else {
        const res = await youtubeApi.getTrendingPage(
          effectiveCategory === 'home' ? 'all' : effectiveCategory,
          nextToken
        );
        if (gen !== opGenRef.current) return;
        setVideos((prev) => appendById(prev, res.items));
        setNextToken(res.nextToken);
      }
    } catch (e) {
      console.error('Failed to load more YouTube videos:', e);
      if (gen === opGenRef.current) setNextToken(null);
    } finally {
      setIsLoadingMore(false);
    }
  }, [nextToken, isLoadingMore, searchQuery, effectiveCategory]);

  useEffect(() => {
    if (searchQuery || isLoading) return;
    if (activeCategory === 'saved' || activeCategory === 'history') return;
    if (videos.length > 0) {
      const cacheKey = effectiveCategory;
      feedCacheRef.current.set(cacheKey, { videos, channels, nextToken });
    }
  }, [videos, channels, nextToken, isLoading, effectiveCategory, activeCategory, searchQuery]);

  useEffect(() => {
    if (isLoading) return;
    if (activeCategory === 'saved' || activeCategory === 'history') return;
    if (!nextToken && !(effectiveCategory === 'home' && !searchQuery)) return;

    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMoreVideos();
      },
      { rootMargin: '600px 0px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMoreVideos, nextToken, isLoading, effectiveCategory, activeCategory, searchQuery]);

  useEffect(() => {
    setSelectedChannelView(null);
  }, [activeCategory, selectedVnTopic]);

  useEffect(() => {
    onChannelViewChange?.(Boolean(selectedChannelView));
  }, [selectedChannelView, onChannelViewChange]);

  const handleOpenVideo = (v: YouTubeVideo) => {
    setSelectedVideo(v);
    addToHistory(v);
  };

  const handleOpenChannel = (channel: YouTubeChannel) => {
    setSelectedChannelView(channel);
  };

  const handleOpenChannelByName = (channelName: string, channelId?: string) => {
    setSelectedChannelView({
      id: channelId || 'channel_custom',
      title: channelName,
    });
    if (selectedVideo) {
      setSelectedVideo(null);
    }
  };

  const heroVideo = videos.length > 0 ? videos[0] : null;
  const mainGridVideos = videos.length > 1 ? videos.slice(1) : videos;

  const playerModal = selectedVideo ? (
    <YouTubePlayerModal
      video={selectedVideo}
      onClose={() => setSelectedVideo(null)}
      onSelectRelatedVideo={(rel) => {
        setSelectedVideo(rel);
        addToHistory(rel);
      }}
      onToggleFavorite={toggleFavorite}
      isFavorite={isFavorite(selectedVideo.id)}
      onOpenChannel={handleOpenChannelByName}
      onShowToast={onShowToast}
    />
  ) : null;

  if (selectedChannelView) {
    return (
      <>
        <YouTubeChannelPageView
          channel={selectedChannelView}
          currentAccount={currentAccount}
          activeProfile={activeProfile}
          onBack={() => setSelectedChannelView(null)}
          onPlayVideo={handleOpenVideo}
        />
        {playerModal}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F0F0F] text-[#FFFFFF] font-sans pb-24 pt-4">
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 space-y-6">
        {/* Search Results Header */}
        {searchQuery && (
          <div className="flex items-center justify-between gap-4 border-b border-[#272727] pb-3">
            <h2 className="text-base sm:text-lg font-bold text-white truncate">
              Kết quả cho <span className="text-[#FF0000]">&quot;{searchQuery}&quot;</span>
            </h2>
            <span className="text-xs text-[#AAAAAA] shrink-0 font-medium">
              {isLoading ? 'Đang tải...' : `${videos.length} video`}
            </span>
          </div>
        )}

        {/* Filter Chips Bar */}
        {!searchQuery && (activeCategory === 'home' || activeCategory === 'trending' || activeCategory === 'all') && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none pt-1">
            {VIETNAM_TOPIC_PILLS.map((pill) => {
              const isSelected = selectedVnTopic === pill.id;
              return (
                <button
                  key={pill.id}
                  onClick={() => setSelectedVnTopic(pill.id)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-white text-black font-bold scale-[1.02]'
                      : 'bg-[#272727] text-[#AAAAAA] hover:bg-[#3F3F3F] hover:text-white'
                  }`}
                >
                  {pill.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Search Results - Channels Section */}
        {!isLoading && searchQuery && channels.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <User className="w-4 h-4 text-[#FF0000]" />
              <span>Kênh liên quan</span>
            </h3>

            <div className="divide-y divide-[#272727] rounded-2xl border border-[#272727] bg-[#181818] overflow-hidden">
              {channels.map((chan) => (
                <div
                  key={chan.id || chan.title}
                  onClick={() => handleOpenChannel(chan)}
                  className="group flex items-center gap-4 px-4 py-3.5 hover:bg-[#272727] transition-colors cursor-pointer"
                >
                  <img
                    src={chan.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(chan.title)}&background=FF0000&color=fff&bold=true`}
                    alt={chan.title}
                    className="w-12 h-12 sm:w-14 sm:h-14 rounded-full object-cover border border-white/10 shrink-0"
                  />

                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-sm font-bold text-white truncate">
                        {chan.title}
                      </h4>
                      <span className="w-3.5 h-3.5 rounded-full bg-neutral-600 text-white text-[9px] font-bold flex items-center justify-center shrink-0">✓</span>
                    </div>

                    <p className="text-[11px] text-[#AAAAAA] font-medium truncate">
                      {[chan.subscribers, chan.videoCount].filter(Boolean).join(' • ') || 'Kênh YouTube'}
                    </p>

                    {chan.description && (
                      <p className="text-[11px] text-[#AAAAAA] line-clamp-1 hidden sm:block">
                        {chan.description}
                      </p>
                    )}
                  </div>

                  <ChevronRight className="w-4 h-4 text-[#AAAAAA] group-hover:text-[#FF0000] shrink-0 transition-colors" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Hero Featured Banner for Home / Trending */}
        {heroVideo && !searchQuery && (activeCategory === 'home' || activeCategory === 'trending' || activeCategory === 'all') && selectedVnTopic === 'all' && (
          <div className="group relative rounded-3xl overflow-hidden border border-[#272727] bg-[#181818] shadow-2xl transition-all">
            <div className="relative aspect-video md:aspect-[21/9] w-full bg-black overflow-hidden">
              <img
                src={heroVideo.thumbnailUrl}
                alt={heroVideo.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 opacity-80"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0F0F0F] via-[#0F0F0F]/40 to-transparent" />

              <div
                onClick={() => handleOpenVideo(heroVideo)}
                className="absolute inset-0 flex items-center justify-center cursor-pointer"
              >
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-[#FF0000] text-white flex items-center justify-center shadow-2xl shadow-red-600/60 group-hover:scale-110 transition-transform">
                  <Play className="w-8 h-8 sm:w-10 sm:h-10 fill-current ml-1" />
                </div>
              </div>

              <div className="absolute bottom-4 left-4 right-4 sm:bottom-6 sm:left-6 sm:right-6 space-y-2 pointer-events-none">
                <span className="bg-[#FF0000] text-white text-[10px] sm:text-xs font-black uppercase px-3 py-1 rounded-full tracking-wider shadow-lg">
                  {activeCategory === 'home' ? 'GỢI Ý DÀNH CHO BẠN' : 'NỔI BẬT HÔM NAY'}
                </span>
                <h2 className="text-lg sm:text-2xl font-black text-white line-clamp-2 drop-shadow-md">
                  {heroVideo.title}
                </h2>
                <div className="flex items-center gap-3 text-xs text-slate-300 font-medium">
                  <span className="font-bold text-red-400">{heroVideo.channelTitle}</span>
                  <span>•</span>
                  <span>{formatViews(heroVideo.viewCount)}</span>
                  {heroVideo.duration && (
                    <>
                      <span>•</span>
                      <span>{heroVideo.duration}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Section Title */}
        {!searchQuery && (
          <div className="flex items-center justify-between border-b border-[#272727] pb-3">
            <div className="flex items-center gap-2">
              {activeCategory === 'home' ? (
                <Sparkles className="w-5 h-5 text-[#FF0000]" />
              ) : activeCategory === 'saved' || activeCategory === 'liked' || activeCategory === 'watch_later' ? (
                <Heart className="w-5 h-5 text-[#FF0000] fill-current" />
              ) : activeCategory === 'history' ? (
                <History className="w-5 h-5 text-[#FF0000]" />
              ) : (
                <Flame className="w-5 h-5 text-[#FF0000]" />
              )}
              <h3 className="text-base sm:text-lg font-bold text-white">
                {activeCategory === 'saved' || activeCategory === 'watch_later' || activeCategory === 'liked'
                  ? `Video Đã Lưu (${favorites.length})`
                  : activeCategory === 'history'
                  ? `Lịch Sử Xem (${history.length})`
                  : activeCategory === 'home'
                  ? 'Dành Cho Bạn'
                  : selectedVnTopic !== 'all'
                  ? VIETNAM_TOPIC_PILLS.find((p) => p.id === selectedVnTopic)?.label || 'Thịnh hành'
                  : 'Video Thịnh Hành'}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              {!isLoading && !searchQuery && activeCategory !== 'saved' && activeCategory !== 'history' && (
                <button
                  onClick={() => fetchVideos({ force: true })}
                  title="Làm mới"
                  className="p-1.5 rounded-full text-[#AAAAAA] hover:text-white hover:bg-[#272727] transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              )}
              <span className="text-xs text-[#AAAAAA]">
                {isLoading ? 'Đang tải...' : `${videos.length} video`}
              </span>
            </div>
          </div>
        )}

        {/* Grid of Video Cards using YouTubeVideoCard Component */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
              <div
                key={i}
                className="bg-[#272727] rounded-xl overflow-hidden animate-pulse h-64"
              />
            ))}
          </div>
        ) : videos.length === 0 ? (
          <div className="text-center py-16 bg-[#181818] rounded-2xl border border-[#272727] p-8">
            <Youtube className="w-12 h-12 text-[#FF0000] mx-auto mb-3 opacity-60" />
            <h4 className="text-base font-bold text-white mb-1">
              {activeCategory === 'saved'
                ? 'Bạn chưa lưu video nào'
                : activeCategory === 'history'
                ? 'Lịch sử xem đang trống'
                : 'Chưa tìm thấy video nào'}
            </h4>
            <p className="text-xs text-[#AAAAAA]">
              {activeCategory === 'saved'
                ? 'Bấm nút Lưu trên bất kỳ video nào để giữ lại tại đây!'
                : activeCategory === 'history'
                ? 'Video bạn thưởng thức sẽ tự động hiển thị trong lịch sử.'
                : 'Thử tìm kiếm nội dung khác hoặc quay lại trang chủ.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-6">
            {((!searchQuery && (activeCategory === 'home' || activeCategory === 'trending' || activeCategory === 'all') && selectedVnTopic === 'all')
              ? mainGridVideos
              : videos
            ).map((v) => (
              <YouTubeVideoCard
                key={v.id}
                video={v}
                onSelectVideo={handleOpenVideo}
                onOpenChannel={handleOpenChannelByName}
                onToggleFavorite={toggleFavorite}
                isFavorite={isFavorite(v.id)}
                onShareVideo={(v) => setShareVideoTarget(v)}
                onShowToast={onShowToast}
              />
            ))}
          </div>
        )}

        {/* Infinite Scroll Sentinel */}
        {!isLoading && videos.length > 0 && activeCategory !== 'saved' && activeCategory !== 'history' && (
          <div ref={sentinelRef} className="flex items-center justify-center min-h-[3.5rem] py-4">
            {isLoadingMore ? (
              <div className="flex items-center gap-2 text-xs text-[#AAAAAA] font-medium">
                <Loader2 className="w-4 h-4 text-[#FF0000] animate-spin" />
                <span>Đang tải thêm video...</span>
              </div>
            ) : !nextToken && effectiveCategory !== 'home' ? (
              <span className="text-[11px] text-[#AAAAAA]">Đã hiển thị hết danh sách</span>
            ) : null}
          </div>
        )}
      </div>

      {/* Share Modal */}
      {shareVideoTarget && (
        <YouTubeShareModal
          video={shareVideoTarget}
          onClose={() => setShareVideoTarget(null)}
          onShowToast={(msg) => onShowToast?.(msg)}
        />
      )}

      {/* Video Player Modal */}
      {playerModal}
    </div>
  );
};
