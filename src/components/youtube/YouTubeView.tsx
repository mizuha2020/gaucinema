import React, { useEffect, useState, useCallback, useRef } from 'react';
import { YouTubeVideo, YouTubeChannel, UserProfile, Account } from '../../types';
import { youtubeApi, formatViews, CURATED_CHANNELS } from '../../services/youtubeApi';
import { youtubeSubscriptionService } from '../../services/youtubeSubscriptionService';
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
  selectedVnTopic?: string;
  selectedChannel?: YouTubeChannel | null;
  onClearSelectedChannel?: () => void;
  onSelectVnTopic?: (topicId: string) => void;
  onChannelViewChange?: (isOpen: boolean) => void;
  onShowToast?: (msg: string) => void;
}

export const YouTubeView: React.FC<YouTubeViewProps> = ({
  currentAccount,
  activeProfile,
  searchQuery = '',
  activeCategory = 'all',
  selectedVnTopic = 'all',
  selectedChannel = null,
  onClearSelectedChannel,
  onSelectVnTopic,
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
  const [selectedChannelView, setSelectedChannelView] = useState<YouTubeChannel | null>(selectedChannel);
  const [shareVideoTarget, setShareVideoTarget] = useState<YouTubeVideo | null>(null);

  useEffect(() => {
    if (selectedChannel) {
      setSelectedChannelView(selectedChannel);
    }
  }, [selectedChannel]);

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

  const effectiveCategory = selectedVnTopic !== 'all' ? selectedVnTopic : activeCategory;

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
            // Multi-topic blended recommendation mix for Home
            const [allPage, musicItems, gamingItems, comedyItems] = await Promise.all([
              youtubeApi.getTrendingPage('all').catch(() => ({ items: [], nextToken: null })),
              youtubeApi.getTrending('music_vn').catch(() => []),
              youtubeApi.getTrending('gaming_vn').catch(() => []),
              youtubeApi.getTrending('comedy_vn').catch(() => []),
            ]);
            if (gen !== opGenRef.current) return;
            const merged = interleaveVideos([
              allPage.items,
              musicItems,
              gamingItems,
              comedyItems,
            ]);
            result = {
              videos: merged.length > 0 ? merged : allPage.items,
              channels: [],
              nextToken: allPage.nextToken,
            };
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
        } else if (effectiveCategory === 'subscriptions') {
          const subChans = youtubeSubscriptionService.getSubscribedChannels(profileId);
          if (subChans.length > 0) {
            const groups = await Promise.all(
              subChans.slice(0, 6).map((c) =>
                youtubeApi
                  .getChannelDetails(c.id, c.title)
                  .then((res) => res.items)
                  .catch(() => [])
              )
            );
            if (gen !== opGenRef.current) return;
            const merged = interleaveVideos(groups);
            if (merged.length > 0) {
              result = { videos: merged, channels: subChans, nextToken: null };
            } else {
              const page = await youtubeApi.getTrendingPage('all');
              if (gen !== opGenRef.current) return;
              result = { videos: page.items, channels: subChans, nextToken: page.nextToken };
            }
          } else {
            const page = await youtubeApi.getTrendingPage('all');
            if (gen !== opGenRef.current) return;
            result = { videos: page.items, channels: [], nextToken: page.nextToken };
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
      currentAccount={currentAccount}
      activeProfile={activeProfile}
    />
  ) : null;

  if (selectedChannelView) {
    return (
      <>
        <YouTubeChannelPageView
          key={selectedChannelView.id || selectedChannelView.title}
          channel={selectedChannelView}
          currentAccount={currentAccount}
          activeProfile={activeProfile}
          onBack={() => {
            setSelectedChannelView(null);
            onClearSelectedChannel?.();
          }}
          onPlayVideo={handleOpenVideo}
        />
        {playerModal}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F0F0F] text-[#FFFFFF] font-sans pb-24 pt-2 w-full min-w-0 overflow-x-hidden">
      <div className="max-w-[1800px] mx-auto px-2 sm:px-6 space-y-4 sm:space-y-6 w-full min-w-0">
        {/* Search Results Header */}
        {searchQuery && (
          <div className="flex items-center justify-between gap-4 border-b border-[#272727] pb-3 px-1">
            <h2 className="text-base sm:text-lg font-bold text-white truncate">
              Kết quả cho <span className="text-[#FF0000]">&quot;{searchQuery}&quot;</span>
            </h2>
            <span className="text-xs text-[#AAAAAA] shrink-0 font-medium">
              {isLoading ? 'Đang tải...' : `${videos.length} video`}
            </span>
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
              {channels.map((chan, idx) => (
                <div
                  key={`${chan.id || chan.title || 'chan'}-${idx}`}
                  onClick={() => handleOpenChannel(chan)}
                  className="group flex items-center gap-4 px-4 py-3.5 hover:bg-[#272727] transition-colors cursor-pointer"
                >
                  <img
                    src={chan.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(chan.title)}&background=FF0000&color=fff&bold=true`}
                    alt={chan.title}
                    className="w-12 h-12 sm:w-14 sm:h-14 rounded-full object-cover border border-white/10 shrink-0"
                    referrerPolicy="no-referrer"
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

        {/* Hero Featured Card for Home / Trending */}
        {heroVideo && !searchQuery && (activeCategory === 'home' || activeCategory === 'trending' || activeCategory === 'all') && selectedVnTopic === 'all' && (
          <div className="group relative rounded-2xl sm:rounded-3xl overflow-hidden border border-[#272727] bg-[#181818] shadow-xl transition-all max-w-full min-w-0">
            <div className="flex flex-col md:flex-row items-stretch">
              {/* Thumbnail Container (Controlled Height to prevent huge layout shifting) */}
              <div
                onClick={() => handleOpenVideo(heroVideo)}
                className="relative aspect-video max-h-[220px] sm:max-h-[340px] md:max-h-none md:w-3/5 lg:w-2/3 bg-black overflow-hidden cursor-pointer shrink-0"
              >
                <img
                  src={heroVideo.thumbnailUrl}
                  alt={heroVideo.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 opacity-90"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent md:hidden" />

                {/* Badge on Mobile Thumbnail */}
                <div className="absolute top-2.5 left-2.5 md:hidden z-10">
                  <span className="bg-[#FF0000] text-white text-[9px] font-black uppercase px-2 py-0.5 rounded-full tracking-wider shadow-lg">
                    {activeCategory === 'home' ? 'GỢI Ý DÀNH CHO BẠN' : 'NỔI BẬT HÔM NAY'}
                  </span>
                </div>

                {/* Play Button */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-10 h-10 sm:w-16 sm:h-16 rounded-full bg-[#FF0000] text-white flex items-center justify-center shadow-xl shadow-red-600/50 group-hover:scale-110 transition-transform">
                    <Play className="w-5 h-5 sm:w-8 sm:h-8 fill-current ml-0.5" />
                  </div>
                </div>

                {/* Duration Badge */}
                {heroVideo.duration && (
                  <div className="absolute bottom-2.5 right-2.5 bg-black/85 text-white text-[11px] sm:text-xs font-semibold px-2 py-0.5 rounded tracking-wide font-mono z-10">
                    {heroVideo.duration}
                  </div>
                )}
              </div>

              {/* Metadata Container */}
              <div className="p-3.5 sm:p-6 md:w-2/5 lg:w-1/3 flex flex-col justify-between gap-2.5 bg-[#181818] min-w-0">
                <div className="space-y-1.5">
                  <div className="hidden md:block">
                    <span className="bg-[#FF0000] text-white text-xs font-black uppercase px-3 py-1 rounded-full tracking-wider shadow-md">
                      {activeCategory === 'home' ? 'GỢI Ý DÀNH CHO BẠN' : 'NỔI BẬT HÔM NAY'}
                    </span>
                  </div>

                  <h2
                    onClick={() => handleOpenVideo(heroVideo)}
                    className="text-sm sm:text-lg lg:text-xl font-bold text-white line-clamp-2 leading-snug cursor-pointer hover:text-red-400 transition-colors"
                    title={heroVideo.title}
                  >
                    {heroVideo.title}
                  </h2>

                  {heroVideo.description && (
                    <p className="text-xs text-[#AAAAAA] line-clamp-2 hidden lg:block leading-relaxed">
                      {heroVideo.description}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#272727]">
                  <div className="flex items-center gap-2 min-w-0">
                    <img
                      src={heroVideo.channelAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(heroVideo.channelTitle)}&background=FF0000&color=fff&bold=true`}
                      alt={heroVideo.channelTitle}
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-full object-cover border border-white/10 shrink-0"
                      referrerPolicy="no-referrer"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">{heroVideo.channelTitle}</p>
                      <p className="text-[10px] sm:text-[11px] text-[#AAAAAA] font-medium">{formatViews(heroVideo.viewCount)}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleOpenVideo(heroVideo)}
                    className="bg-white hover:bg-slate-200 text-black text-xs font-bold px-3 py-1.5 sm:px-4 sm:py-2 rounded-full transition-all cursor-pointer shrink-0 flex items-center gap-1 shadow"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>Xem ngay</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Subscriptions Horizontal Channels Bar */}
        {!searchQuery && activeCategory === 'subscriptions' && (
          <div className="space-y-4 bg-[#181818] p-4 rounded-2xl border border-[#272727]">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Youtube className="w-4 h-4 text-[#FF0000]" />
                <span>Kênh đã đăng ký ({youtubeSubscriptionService.getSubscribedChannels(profileId).length})</span>
              </h3>
            </div>

            {youtubeSubscriptionService.getSubscribedChannels(profileId).length > 0 ? (
              <div className="flex items-center gap-4 overflow-x-auto pb-2 scrollbar-none">
                {youtubeSubscriptionService.getSubscribedChannels(profileId).map((chan, idx) => (
                  <button
                    key={`${chan.id || chan.title || 'sub'}-${idx}`}
                    onClick={() => handleOpenChannel(chan)}
                    className="flex flex-col items-center gap-1.5 min-w-[72px] max-w-[84px] group cursor-pointer shrink-0"
                  >
                    <div className="relative">
                      <img
                        src={chan.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(chan.title)}&background=FF0000&color=fff&bold=true`}
                        alt={chan.title}
                        className="w-12 h-12 rounded-full object-cover border-2 border-red-600/60 group-hover:border-red-500 transition-all shadow-md group-hover:scale-105"
                        referrerPolicy="no-referrer"
                      />
                      <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-red-600 border-2 border-[#181818]" />
                    </div>
                    <span className="text-[11px] font-semibold text-slate-200 group-hover:text-white truncate w-full text-center">
                      {chan.title}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-[#AAAAAA]">
                  Bạn chưa đăng ký kênh nào. Hãy bấm <strong>Đăng ký</strong> các kênh nổi bật dưới đây để xem video mới nhất:
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {CURATED_CHANNELS.slice(0, 6).map((pop, idx) => (
                    <div
                      key={`${pop.id || 'curated'}-${idx}`}
                      className="bg-[#222222] p-3 rounded-xl border border-[#333333] flex flex-col items-center text-center gap-2"
                    >
                      <img
                        src={pop.avatarUrl}
                        alt={pop.title}
                        className="w-10 h-10 rounded-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                      <span className="text-xs font-bold text-white truncate w-full">{pop.title}</span>
                      <button
                        onClick={async () => {
                          await youtubeSubscriptionService.toggleSubscribe(currentAccount, activeProfile, pop);
                          fetchVideos({ force: true });
                          onShowToast?.(`Đã đăng ký ${pop.title}!`);
                        }}
                        className="w-full bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold py-1 px-2 rounded-full transition-colors cursor-pointer"
                      >
                        Đăng ký
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Section Title */}
        {!searchQuery && (
          <div className="flex items-center justify-between border-b border-[#272727] pb-3">
            <div className="flex items-center gap-2">
              {activeCategory === 'home' ? (
                <Sparkles className="w-5 h-5 text-[#FF0000]" />
              ) : activeCategory === 'subscriptions' ? (
                <Youtube className="w-5 h-5 text-[#FF0000]" />
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
                  : activeCategory === 'subscriptions'
                  ? `Video Từ Kênh Đã Đăng Ký`
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
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 sm:gap-4 lg:gap-5">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
              <div
                key={i}
                className="bg-[#272727] rounded-xl overflow-hidden animate-pulse h-60 sm:h-64"
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
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-x-3 gap-y-6 sm:gap-x-4 sm:gap-y-6 lg:gap-x-4 lg:gap-y-8">
            {((!searchQuery && (activeCategory === 'home' || activeCategory === 'trending' || activeCategory === 'all') && selectedVnTopic === 'all')
              ? mainGridVideos
              : videos
            ).map((v, idx) => (
              <YouTubeVideoCard
                key={`${v.id || 'yt'}-${idx}`}
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
