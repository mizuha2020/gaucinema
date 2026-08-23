import React, { useEffect, useState, useCallback, useRef } from 'react';
import { YouTubeVideo, YouTubeChannel, UserProfile, Account } from '../../types';
import { youtubeApi, formatViews, extractYouTubeId } from '../../services/youtubeApi';
import { firestoreStorage } from '../../services/firestoreStorage';
import { YouTubePlayerModal } from './YouTubePlayerModal';
import { YouTubeChannelPageView } from './YouTubeChannelPageView';
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
  Compass,
} from 'lucide-react';

// Vietnam category tabs / pills
export const VIETNAM_TOPIC_PILLS = [
  { id: 'all', label: 'Tất cả' },
  { id: 'music_vn', label: 'Âm nhạc Việt' },
  { id: 'news_vn', label: 'Tin tức 24h' },
  { id: 'comedy_vn', label: 'Hài & Giải trí' },
  { id: 'gaming_vn', label: 'Gaming VN' },
  { id: 'review_phim', label: 'Review Phim' },
  { id: 'podcast_vn', label: 'Podcast & Talk' },
  { id: 'food_vn', label: 'Ẩm thực & Du lịch' },
  { id: 'tech_vn', label: 'Công nghệ' },
  { id: 'kids_vn', label: 'Thiếu nhi' },
  { id: 'live_vn', label: 'Trực tiếp' },
];

// ---------------- Personalization (Trang chủ "Dành Cho Bạn") ----------------

// Từ phổ biến/quảng cáo không mang tín hiệu sở thích
const KEYWORD_STOPWORDS = new Set([
  'official', 'music', 'video', 'videos', 'mv', 'lyrics', 'lyric', 'audio',
  'visualizer', 'teaser', 'trailer', 'full', 'hd', '4k', 'live', 'shorts',
  'short', 'tiktok', 'remix', 'cover', 'beat', 'karaoke', 'version', 'part',
  'episode', 'season', 'new', 'update', 'the', 'and', 'and', 'with', 'for',
  'và', 'của', 'có', 'không', 'những', 'cho', 'với', 'tôi', 'bạn', 'anh',
  'em', 'là', 'một', 'các', 'này', 'đó', 'đã', 'sẽ', 'mới', 'nhất', 'hay',
  'hot', 'trend', 'viral', 'hôm', 'nay', 'tuần', 'xem', 'khi', 'về', 'từ',
  'nào', 'gì', 'siêu', 'cực',
]);

interface HomeSource {
  kind: 'channel' | 'search';
  channelId?: string;
  name?: string;
  query?: string;
}

// Chấm điểm kênh theo lịch sử xem / đã lưu / đăng ký và trích từ khóa từ tiêu đề
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

// Trộn đều các nhóm nguồn theo kiểu round-robin, loại trùng nhau giữa các nguồn
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

// Trả về key storage theo hồ sơ
const favsKey = (profileId?: string | null) => `gau_yt_favs_${profileId || 'default'}`;
const histKey = (profileId?: string | null) => `gau_yt_hist_${profileId || 'default'}`;
const subsKey = (profileId?: string | null) => `gau_yt_subs_${profileId || 'default'}`;

interface YouTubeViewProps {
  currentAccount?: Account | null;
  activeProfile: UserProfile | null;
  searchQuery?: string;
  activeCategory?: string;
  onChannelViewChange?: (isOpen: boolean) => void;
}

export const YouTubeView: React.FC<YouTubeViewProps> = ({
  currentAccount,
  activeProfile,
  searchQuery = '',
  activeCategory = 'all',
  onChannelViewChange,
}) => {
  const [videos, setVideos] = useState<YouTubeVideo[]>([]);
  const [channels, setChannels] = useState<YouTubeChannel[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [nextToken, setNextToken] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<YouTubeVideo | null>(null);
  const [selectedChannelView, setSelectedChannelView] = useState<YouTubeChannel | null>(null);

  // Selected Vietnam subcategory pill
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

  // Load from Firestore per profile on mount / profile change + Auto migrate localStorage
  useEffect(() => {
    let isMounted = true;

    const loadProfileData = async () => {
      // 1. Initial local load
      try {
        const localFavs = JSON.parse(localStorage.getItem(favsKey(profileId)) || '[]');
        const localHist = JSON.parse(localStorage.getItem(histKey(profileId)) || '[]');
        const localSubs = JSON.parse(localStorage.getItem(subsKey(profileId)) || localStorage.getItem('gau_yt_subscriptions') || '[]');
        if (isMounted) {
          setFavorites(localFavs);
          setHistory(localHist);
          setSubscriptions(localSubs);
        }
      } catch {
        // Ignore
      }

      // 2. Fetch from Firestore if logged in
      if (accountId && profileId) {
        try {
          const [cloudFavs, cloudHist, cloudSubs] = await Promise.all([
            firestoreStorage.getYoutubeFavorites(accountId, profileId).catch(() => [] as YouTubeVideo[]),
            firestoreStorage.getYoutubeHistory(accountId, profileId).catch(() => [] as YouTubeVideo[]),
            firestoreStorage.getYoutubeSubscriptions(accountId, profileId).catch(() => [] as string[]),
          ]);

          if (isMounted) {
            // If cloud has data, update state & cache
            if (cloudFavs.length > 0) {
              setFavorites(cloudFavs);
              localStorage.setItem(favsKey(profileId), JSON.stringify(cloudFavs));
            } else {
              // Auto migrate from localStorage to Firestore if cloud is empty
              const localFavs = JSON.parse(localStorage.getItem(favsKey(profileId)) || '[]');
              for (const item of localFavs.slice(0, 20)) {
                await firestoreStorage.toggleYoutubeFavorite(accountId, profileId, item).catch(() => {});
              }
            }

            if (cloudHist.length > 0) {
              setHistory(cloudHist);
              localStorage.setItem(histKey(profileId), JSON.stringify(cloudHist));
            } else {
              // Auto migrate history
              const localHist = JSON.parse(localStorage.getItem(histKey(profileId)) || '[]');
              for (const item of localHist.slice(0, 20)) {
                await firestoreStorage.saveYoutubeHistory(accountId, profileId, item).catch(() => {});
              }
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

  // Keep refs for home source generator
  const favoritesRef = useRef<YouTubeVideo[]>(favorites);
  const historyRef = useRef<YouTubeVideo[]>(history);
  const subscriptionsRef = useRef<string[]>(subscriptions);
  useEffect(() => {
    favoritesRef.current = favorites;
    historyRef.current = history;
    subscriptionsRef.current = subscriptions;
  }, [favorites, history, subscriptions]);

  // Home feed personalization queue
  const homeSourcesRef = useRef<HomeSource[]>([]);
  const homeCursorRef = useRef(0);
  const opGenRef = useRef(0);

  // Cache feed per tab / topic in session
  interface FeedCacheEntry {
    videos: YouTubeVideo[];
    channels: YouTubeChannel[];
    nextToken: string | null;
  }
  const feedCacheRef = useRef<Map<string, FeedCacheEntry>>(new Map());

  // Toggle favorite with Firestore + localStorage
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

      if (accountId && profileId) {
        try {
          await firestoreStorage.toggleYoutubeFavorite(accountId, profileId, v);
        } catch (e) {
          console.warn('Failed to sync favorite to Firestore:', e);
        }
      }
    },
    [accountId, profileId]
  );

  const isFavorite = useCallback(
    (videoId: string) => {
      return favorites.some((f) => f.id === videoId);
    },
    [favorites]
  );

  // Add to watch history with Firestore + localStorage
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

  // Remove single item from watch history
  const removeFromHistory = useCallback(
    async (videoId: string, e?: React.MouseEvent) => {
      e?.stopPropagation();
      const updated = historyRef.current.filter((item) => item.id !== videoId);
      setHistory(updated);
      try {
        localStorage.setItem(histKey(profileId), JSON.stringify(updated));
      } catch {}

      if (accountId && profileId) {
        try {
          await firestoreStorage.removeYoutubeHistoryItem(accountId, profileId, videoId);
        } catch (e) {
          console.warn('Failed to remove history from Firestore:', e);
        }
      }
    },
    [accountId, profileId]
  );

  // Tab Đã lưu / Lịch sử cập nhật ngay khi dữ liệu thay đổi
  useEffect(() => {
    if (searchQuery || isLoading) return;
    if (activeCategory === 'saved') setVideos(favoritesRef.current);
    else if (activeCategory === 'history') setVideos(historyRef.current);
  }, [favorites, history, activeCategory, searchQuery, isLoading]);

  // Compute category key considering selected Vietnam topic
  const effectiveCategory = activeCategory === 'trending' && selectedVnTopic !== 'all' ? selectedVnTopic : activeCategory;

  // Fetch videos based on searchQuery or effectiveCategory
  const fetchVideos = useCallback(
    async (opts?: { force?: boolean }) => {
      // Tab dữ liệu local (Đã lưu / Lịch sử)
      if (!searchQuery && (activeCategory === 'saved' || activeCategory === 'history')) {
        setChannels([]);
        setNextToken(null);
        setVideos(activeCategory === 'saved' ? favoritesRef.current : historyRef.current);
        setIsLoading(false);
        return;
      }

      // Cache hit trong phiên
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
            // Chưa có dữ liệu người dùng -> dùng thịnh hành làm mặc định (ưu tiên Việt Nam)
            const page = await youtubeApi.getTrendingPage('all');
            if (gen !== opGenRef.current) return;
            result = { videos: page.items, channels: [], nextToken: page.nextToken };
            if (page.items.length === 0) {
              const legacy = await youtubeApi.getTrending('all');
              if (gen !== opGenRef.current) return;
              result = { videos: legacy, channels: [], nextToken: null };
            }
          } else {
            // Trang đầu: lấy song song 3 nguồn mạnh nhất
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
          // Categories: all, music_vn, news_vn, comedy_vn, gaming_vn, review_phim, podcast_vn, food_vn, tech_vn, kids_vn, live_vn, etc.
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

  // Load the next page and append (dedupe by id)
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

  // Update active cache
  useEffect(() => {
    if (searchQuery || isLoading) return;
    if (activeCategory === 'saved' || activeCategory === 'history') return;
    if (videos.length > 0) {
      const cacheKey = effectiveCategory;
      feedCacheRef.current.set(cacheKey, { videos, channels, nextToken });
    }
  }, [videos, channels, nextToken, isLoading, effectiveCategory, activeCategory, searchQuery]);

  // Infinite scroll
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
  const shortsVideos = videos.filter((v) => v.isShort || v.category === 'shorts');

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
    <div className="min-h-screen bg-[#0a0608] text-white font-sans pb-24 pt-28">
      <div className="max-w-5xl mx-auto px-3 sm:px-6 lg:px-8 space-y-6">
        {/* Search Results Header */}
        {searchQuery && (
          <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-3">
            <h2 className="text-base sm:text-lg font-bold text-white truncate">
              Kết quả cho <span className="text-red-400">&quot;{searchQuery}&quot;</span>
            </h2>
            <span className="text-xs text-slate-400 shrink-0 font-medium">
              {isLoading ? 'Đang tải...' : `${videos.length} video`}
            </span>
          </div>
        )}

        {/* Vietnam Category Pills Navigation (Visible when not in search, saved, or history) */}
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
                      ? 'bg-red-600 text-white shadow-md shadow-red-600/30 font-bold scale-[1.02]'
                      : 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white border border-white/5'
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
              <User className="w-4 h-4 text-red-500" />
              <span>Kênh liên quan</span>
            </h3>

            <div className="divide-y divide-white/5 rounded-2xl border border-white/5 bg-[#100b0d] overflow-hidden">
              {channels.map((chan) => (
                <div
                  key={chan.id || chan.title}
                  onClick={() => handleOpenChannel(chan)}
                  className="group flex items-center gap-4 px-4 py-3.5 hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <img
                    src={chan.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(chan.title)}&background=dc2626&color=fff&bold=true`}
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

                    <p className="text-[11px] text-slate-400 font-medium truncate">
                      {[chan.subscribers, chan.videoCount].filter(Boolean).join(' • ') || 'Kênh YouTube'}
                    </p>

                    {chan.description && (
                      <p className="text-[11px] text-slate-500 line-clamp-1 hidden sm:block">
                        {chan.description}
                      </p>
                    )}
                  </div>

                  <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-red-400 shrink-0 transition-colors" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Hero Featured Video */}
        {heroVideo && !searchQuery && (activeCategory === 'home' || activeCategory === 'trending' || activeCategory === 'all') && selectedVnTopic === 'all' && (
          <div className="group relative rounded-3xl overflow-hidden border border-red-900/60 bg-[#140c0f] shadow-2xl transition-all">
            <div className="relative aspect-video md:aspect-[21/9] w-full bg-black overflow-hidden">
              <img
                src={heroVideo.thumbnailUrl}
                alt={heroVideo.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 opacity-80"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0a0608] via-[#0a0608]/40 to-transparent" />

              {/* Play Overlay Button */}
              <div
                onClick={() => handleOpenVideo(heroVideo)}
                className="absolute inset-0 flex items-center justify-center cursor-pointer"
              >
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-red-600/90 text-white flex items-center justify-center shadow-2xl shadow-red-600/60 group-hover:scale-110 transition-transform">
                  <Play className="w-8 h-8 sm:w-10 sm:h-10 fill-current ml-1" />
                </div>
              </div>

              {/* Video Title info on bottom */}
              <div className="absolute bottom-4 left-4 right-4 sm:bottom-6 sm:left-6 sm:right-6 space-y-2 pointer-events-none">
                <span className="bg-red-600 text-white text-[10px] sm:text-xs font-black uppercase px-3 py-1 rounded-full tracking-wider shadow-lg">
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

        {/* YouTube Shorts Vertical Carousel Section */}
        {shortsVideos.length > 0 && activeCategory !== 'saved' && activeCategory !== 'history' && selectedVnTopic === 'all' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-white flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-red-500" />
                <span>YouTube Shorts</span>
              </h3>
              <span className="text-xs text-slate-400 font-medium">Clip ngắn hài hước & xu hướng</span>
            </div>

            <div className="flex items-center gap-3 overflow-x-auto pb-3 scrollbar-none">
              {shortsVideos.map((s) => (
                <div
                  key={s.id}
                  onClick={() => handleOpenVideo(s)}
                  className="group relative w-40 sm:w-48 aspect-[9/16] rounded-2xl overflow-hidden bg-black border border-red-900/50 hover:border-red-500 cursor-pointer shrink-0 shadow-lg hover:scale-105 transition-all"
                >
                  <img
                    src={s.thumbnailUrl}
                    alt={s.title}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                  <div className="absolute top-2 right-2 bg-red-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                    SHORTS
                  </div>
                  <div className="absolute bottom-3 left-3 right-3 space-y-1">
                    <p className="text-xs font-bold text-white line-clamp-2 leading-snug">
                      {s.title}
                    </p>
                    <p className="text-[10px] text-slate-300 truncate">{s.channelTitle}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Main Grid Header */}
        {!searchQuery && (
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              {activeCategory === 'home' ? (
                <Sparkles className="w-5 h-5 text-red-500" />
              ) : activeCategory === 'saved' ? (
                <Heart className="w-5 h-5 text-red-500 fill-current" />
              ) : (
                <Flame className="w-5 h-5 text-red-500" />
              )}
              <h3 className="text-lg font-bold text-white">
                {activeCategory === 'saved'
                  ? `Video Đã Lưu (${favorites.length})`
                  : activeCategory === 'history'
                  ? `Lịch Sử Xem (${history.length})`
                  : activeCategory === 'home'
                  ? 'Dành Cho Bạn'
                  : selectedVnTopic !== 'all'
                  ? VIETNAM_TOPIC_PILLS.find((p) => p.id === selectedVnTopic)?.label || 'Xu hướng Việt Nam'
                  : 'Video Xu Hướng Việt Nam'}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              {!isLoading && !searchQuery && activeCategory !== 'saved' && activeCategory !== 'history' && (
                <button
                  onClick={() => fetchVideos({ force: true })}
                  title="Làm mới danh sách"
                  className="p-1.5 rounded-full text-slate-400 hover:text-red-400 hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              )}
              <span className="text-xs text-slate-400">
                {isLoading ? 'Đang tải...' : `${videos.length} video`}
              </span>
            </div>
          </div>
        )}

        {/* Videos Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div
                key={i}
                className="bg-[#140c0f] border border-red-900/20 rounded-2xl overflow-hidden animate-pulse h-60"
              />
            ))}
          </div>
        ) : videos.length === 0 ? (
          <div className="text-center py-16 bg-[#140c0f] rounded-3xl border border-red-900/30 p-8">
            <Youtube className="w-12 h-12 text-red-600 mx-auto mb-3 opacity-60" />
            <h4 className="text-base font-bold text-white mb-1">
              {activeCategory === 'saved'
                ? 'Bạn chưa lưu video nào'
                : activeCategory === 'history'
                ? 'Lịch sử xem đang trống'
                : 'Chưa có video nào'}
            </h4>
            <p className="text-xs text-slate-400">
              {activeCategory === 'saved'
                ? 'Nhấn vào biểu tượng trái tim trên bất kỳ video nào để lưu vào hồ sơ cá nhân của bạn!'
                : activeCategory === 'history'
                ? 'Các video bạn xem sẽ được lưu lại tự động theo từng hồ sơ tại đây.'
                : 'Hãy thử tìm kiếm bằng từ khóa hoặc dán link YouTube bất kỳ ở phía trên!'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
            {((!searchQuery && (activeCategory === 'home' || activeCategory === 'trending' || activeCategory === 'all') && selectedVnTopic === 'all')
              ? mainGridVideos
              : videos
            ).map((v) => (
              <div
                key={v.id}
                className="group relative bg-[#120d0f] hover:bg-[#1a1113] border border-white/5 hover:border-red-600/60 rounded-2xl overflow-hidden transition-all duration-300 shadow-lg flex flex-col justify-between"
              >
                {/* Thumbnail */}
                <div
                  onClick={() => handleOpenVideo(v)}
                  className="relative aspect-video w-full bg-black overflow-hidden cursor-pointer"
                >
                  <img
                    src={v.thumbnailUrl}
                    alt={v.title}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors" />

                  {/* Play Hover Button */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                    <div className="w-12 h-12 rounded-full bg-red-600 text-white flex items-center justify-center shadow-xl shadow-red-600/50">
                      <Play className="w-6 h-6 fill-current ml-0.5" />
                    </div>
                  </div>

                  {/* Duration Badge */}
                  {v.duration && (
                    <span
                      className={`absolute bottom-2 right-2 text-white text-[11px] font-bold px-2 py-0.5 rounded-md ${
                        v.duration === 'LIVE'
                          ? 'bg-red-600 shadow-md shadow-red-600/40 uppercase tracking-wide'
                          : 'bg-black/85'
                      }`}
                    >
                      {v.duration}
                    </span>
                  )}
                </div>

                {/* Info Card */}
                <div className="p-3.5 flex flex-col flex-1 justify-between gap-3">
                  <div className="space-y-1">
                    <h4
                      onClick={() => handleOpenVideo(v)}
                      className="text-xs sm:text-sm font-bold text-slate-100 hover:text-red-400 line-clamp-2 leading-snug transition-colors cursor-pointer"
                    >
                      {v.title}
                    </h4>
                    <p
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenChannelByName(v.channelTitle, v.channelId);
                      }}
                      className="text-[11px] text-slate-400 hover:text-red-400 font-medium truncate cursor-pointer transition-colors flex items-center gap-1"
                    >
                      <span>{v.channelTitle}</span>
                      <span className="text-[10px] text-red-500">✓</span>
                    </p>
                  </div>

                  {/* Footer Stats & Actions */}
                  <div className="flex items-center justify-between pt-2 border-t border-white/5 text-[11px] text-slate-400">
                    <span>{formatViews(v.viewCount)}</span>
                    <div className="flex items-center gap-1">
                      {activeCategory === 'history' && (
                        <button
                          onClick={(e) => removeFromHistory(v.id, e)}
                          className="p-1.5 rounded-full text-slate-500 hover:text-red-400 hover:bg-white/5 transition-all cursor-pointer"
                          title="Xóa khỏi lịch sử xem"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(v);
                        }}
                        className={`p-1.5 rounded-full transition-all cursor-pointer ${
                          isFavorite(v.id)
                            ? 'text-red-500 bg-red-600/20'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800'
                        }`}
                        title={isFavorite(v.id) ? 'Bỏ lưu' : 'Lưu video'}
                      >
                        <Heart
                          className={`w-4 h-4 ${isFavorite(v.id) ? 'fill-current' : ''}`}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Infinite scroll sentinel */}
        {!isLoading && videos.length > 0 && activeCategory !== 'saved' && activeCategory !== 'history' && (
          <div ref={sentinelRef} className="flex items-center justify-center min-h-[3.5rem] py-4">
            {isLoadingMore ? (
              <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
                <Loader2 className="w-4 h-4 text-red-500 animate-spin" />
                <span>Đang tải thêm video...</span>
              </div>
            ) : !nextToken && effectiveCategory !== 'home' ? (
              <span className="text-[11px] text-slate-600">Bạn đã xem hết video rồi</span>
            ) : null}
          </div>
        )}
      </div>

      {/* Video Player Modal */}
      {playerModal}
    </div>
  );
};
