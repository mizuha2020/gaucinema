import React, { useEffect, useState, useCallback } from 'react';
import { YouTubeVideo, YouTubeChannel, UserProfile, Account } from '../../types';
import { youtubeApi, formatViews, extractYouTubeId } from '../../services/youtubeApi';
import { YouTubePlayerModal } from './YouTubePlayerModal';
import { YouTubeChannelPageView } from './YouTubeChannelPageView';
import {
  Play,
  Flame,
  Music,
  Gamepad2,
  Smartphone,
  Sparkles,
  ShieldCheck,
  Search,
  Plus,
  Heart,
  Clock,
  Tv,
  Youtube,
  Film,
  Layers,
  ArrowRight,
  User,
  UserPlus,
  UserCheck,
  ExternalLink,
} from 'lucide-react';

interface YouTubeViewProps {
  currentAccount?: Account | null;
  activeProfile: UserProfile | null;
  searchQuery?: string;
  activeCategory?: string;
}

export const YouTubeView: React.FC<YouTubeViewProps> = ({
  currentAccount,
  activeProfile,
  searchQuery = '',
  activeCategory = 'all',
}) => {
  const [videos, setVideos] = useState<YouTubeVideo[]>([]);
  const [channels, setChannels] = useState<YouTubeChannel[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedVideo, setSelectedVideo] = useState<YouTubeVideo | null>(null);

  const [selectedChannelView, setSelectedChannelView] = useState<YouTubeChannel | null>(null);

  const [favorites, setFavorites] = useState<YouTubeVideo[]>(() => {
    try {
      const key = `gau_yt_favs_${activeProfile?.id || 'default'}`;
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [history, setHistory] = useState<YouTubeVideo[]>(() => {
    try {
      const key = `gau_yt_hist_${activeProfile?.id || 'default'}`;
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Reload saved storage when profile changes
  useEffect(() => {
    if (!activeProfile) return;
    try {
      const favKey = `gau_yt_favs_${activeProfile.id}`;
      const histKey = `gau_yt_hist_${activeProfile.id}`;
      const favSaved = localStorage.getItem(favKey);
      const histSaved = localStorage.getItem(histKey);
      if (favSaved) setFavorites(JSON.parse(favSaved));
      else setFavorites([]);
      if (histSaved) setHistory(JSON.parse(histSaved));
      else setHistory([]);
    } catch {
      // Ignore
    }
  }, [activeProfile]);

  // Persist favorites
  const toggleFavorite = (v: YouTubeVideo) => {
    setFavorites((prev) => {
      const exists = prev.some((item) => item.id === v.id);
      let updated: YouTubeVideo[];
      if (exists) {
        updated = prev.filter((item) => item.id !== v.id);
      } else {
        updated = [v, ...prev];
      }
      try {
        const key = `gau_yt_favs_${activeProfile?.id || 'default'}`;
        localStorage.setItem(key, JSON.stringify(updated));
      } catch {
        // Ignore
      }
      return updated;
    });
  };

  const isFavorite = (videoId: string) => {
    return favorites.some((f) => f.id === videoId);
  };

  // Add to watch history
  const addToHistory = useCallback(
    (v: YouTubeVideo) => {
      setHistory((prev) => {
        const filtered = prev.filter((item) => item.id !== v.id);
        const updated = [v, ...filtered].slice(0, 50);
        try {
          const key = `gau_yt_hist_${activeProfile?.id || 'default'}`;
          localStorage.setItem(key, JSON.stringify(updated));
        } catch {
          // Ignore
        }
        return updated;
      });
    },
    [activeProfile]
  );

  // Fetch videos based on searchQuery or activeCategory
  const fetchVideos = useCallback(async () => {
    setIsLoading(true);
    try {
      if (searchQuery) {
        const res = await youtubeApi.searchFull(searchQuery);
        setVideos(res.items);
        setChannels(res.channels);
      } else {
        setChannels([]);
        if (activeCategory === 'saved') {
          setVideos(favorites);
        } else if (activeCategory === 'history') {
          setVideos(history);
        } else {
          const res = await youtubeApi.getTrending(activeCategory);
          setVideos(res);
        }
      }
    } catch (e) {
      console.error('Failed to fetch YouTube videos:', e);
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, activeCategory, favorites, history]);

  useEffect(() => {
    if (searchQuery) {
      setSelectedChannelView(null);
    }
    fetchVideos();
  }, [fetchVideos, searchQuery]);

  useEffect(() => {
    setSelectedChannelView(null);
  }, [activeCategory]);

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
      setSelectedVideo(null); // close player modal when opening channel page
    }
  };

  const heroVideo = videos.length > 0 ? videos[0] : null;
  const mainGridVideos = videos.length > 1 ? videos.slice(1) : videos;

  const shortsVideos = videos.filter((v) => v.isShort || v.category === 'shorts');

  if (selectedChannelView) {
    return (
      <YouTubeChannelPageView
        channel={selectedChannelView}
        onBack={() => setSelectedChannelView(null)}
        onPlayVideo={handleOpenVideo}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0608] text-white font-sans pb-24 pt-28">
      {/* Container */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 space-y-8">
        {/* Search Results - Channels Section */}
        {searchQuery && channels.length > 0 && (
          <div className="space-y-4 bg-gradient-to-r from-red-950/40 via-[#180f12] to-[#120a0d] border border-red-900/60 rounded-3xl p-4 sm:p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                <User className="w-5 h-5 text-red-500" />
                <span>Kênh YouTube Tìm Thấy</span>
              </h3>
              <span className="text-xs text-slate-400 font-medium">{channels.length} kênh</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {channels.map((chan) => (
                <div
                  key={chan.id || chan.title}
                  onClick={() => handleOpenChannel(chan)}
                  className="group bg-[#140c0f] hover:bg-[#201015] border border-red-900/40 hover:border-red-500/80 rounded-2xl p-4 transition-all duration-300 cursor-pointer flex items-center gap-4 shadow-lg"
                >
                  <img
                    src={chan.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(chan.title)}&background=dc2626&color=fff&bold=true`}
                    alt={chan.title}
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover border-2 border-red-600/50 group-hover:scale-105 transition-transform shrink-0"
                  />

                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-sm sm:text-base font-bold text-white group-hover:text-red-400 truncate">
                        {chan.title}
                      </h4>
                      <span className="w-4 h-4 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">✓</span>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
                      {chan.subscribers && <span className="text-red-400 font-semibold">{chan.subscribers}</span>}
                      {chan.videoCount && <span>• {chan.videoCount}</span>}
                    </div>

                    {chan.description && (
                      <p className="text-xs text-slate-300 line-clamp-1">
                        {chan.description}
                      </p>
                    )}
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenChannel(chan);
                    }}
                    className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 shrink-0 shadow-md shadow-red-600/30"
                  >
                    <span>Xem Kênh</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Hero Featured Video (if available and not searching) */}
        {heroVideo && !searchQuery && activeCategory === 'all' && (
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
                  NỔI BẬT HÔM NAY
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
        {shortsVideos.length > 0 && activeCategory !== 'saved' && activeCategory !== 'history' && (
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
        <div className="flex items-center justify-between border-b border-red-900/30 pb-3">
          <div className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-red-500" />
            <h3 className="text-lg font-black text-white">
              {searchQuery
                ? `Kết quả tìm kiếm cho: "${searchQuery}"`
                : activeCategory === 'saved'
                ? `Video Đã Lưu (${favorites.length})`
                : activeCategory === 'history'
                ? `Lịch Sử Xem (${history.length})`
                : `Video Xu Hướng - ${activeCategory.toUpperCase()}`}
            </h3>
          </div>
          <span className="text-xs text-slate-400">
            {isLoading ? 'Đang tải...' : `${videos.length} video`}
          </span>
        </div>

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
            <h4 className="text-base font-bold text-white mb-1">Chưa có video nào</h4>
            <p className="text-xs text-slate-400">
              Hãy thử tìm kiếm bằng từ khóa hoặc dán link YouTube bất kỳ ở phía trên!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
            {mainGridVideos.map((v) => (
              <div
                key={v.id}
                className="group relative bg-[#140c0f] hover:bg-[#1f1015] border border-red-900/30 hover:border-red-600/70 rounded-2xl overflow-hidden transition-all duration-300 shadow-xl flex flex-col justify-between"
              >
                {/* Thumbnail */}
                <div
                  onClick={() => handleOpenVideo(v)}
                  className="relative aspect-video w-full bg-black overflow-hidden cursor-pointer"
                >
                  <img
                    src={v.thumbnailUrl}
                    alt={v.title}
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
                    <span className="absolute bottom-2 right-2 bg-black/85 text-white text-[11px] font-bold px-2 py-0.5 rounded-md">
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

                  {/* Footer Stats & Favorite Button */}
                  <div className="flex items-center justify-between pt-2 border-t border-red-900/30 text-[11px] text-slate-400">
                    <span>{formatViews(v.viewCount)}</span>
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
            ))}
          </div>
        )}
      </div>

      {/* Video Player Modal */}
      {selectedVideo && (
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
      )}
    </div>
  );
};
