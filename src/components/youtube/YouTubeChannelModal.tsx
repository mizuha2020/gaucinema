import React, { useState, useEffect } from 'react';
import { X, Bell, Play, UserCheck, UserPlus, Film, Loader2, Search } from 'lucide-react';
import { YouTubeChannel, YouTubeVideo } from '../../types';
import { youtubeApi } from '../../services/youtubeApi';

interface YouTubeChannelModalProps {
  channel: YouTubeChannel | null;
  channelId?: string;
  channelName?: string;
  isOpen: boolean;
  onClose: () => void;
  onPlayVideo: (video: YouTubeVideo) => void;
}

export const YouTubeChannelModal: React.FC<YouTubeChannelModalProps> = ({
  channel: initialChannel,
  channelId,
  channelName,
  isOpen,
  onClose,
  onPlayVideo,
}) => {
  const [channelData, setChannelData] = useState<YouTubeChannel | null>(initialChannel);
  const [videos, setVideos] = useState<YouTubeVideo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<YouTubeVideo[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setIsLoading(true);
    setSearchQuery('');
    setSearchResults(null);

    const loadChannel = async () => {
      const cId = initialChannel?.id || channelId || '';
      const cName = initialChannel?.title || channelName || '';

      const result = await youtubeApi.getChannelDetails(cId, cName);

      if (isMounted) {
        if (result.channel) {
          setChannelData(result.channel);
          // Check local storage subscription state
          try {
            const savedSubs = JSON.parse(localStorage.getItem('gau_yt_subscriptions') || '[]');
            setIsSubscribed(savedSubs.includes(result.channel.id || result.channel.title));
          } catch {
            setIsSubscribed(false);
          }
        }
        setVideos(result.items);
        setIsLoading(false);
      }
    };

    loadChannel();

    return () => {
      isMounted = false;
    };
  }, [isOpen, initialChannel, channelId, channelName]);

  const displayTitle = channelData?.title || channelName || 'Kênh YouTube';

  // Live in-channel search
  const executeSearch = async (queryText: string) => {
    const qTrim = queryText.trim();
    if (!qTrim) {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const targetChannelId = channelData?.id || channelId || '';
    const targetChannelName = displayTitle;

    const localMatches = videos.filter((vid) =>
      vid.title.toLowerCase().includes(qTrim.toLowerCase()) ||
      (vid.description && vid.description.toLowerCase().includes(qTrim.toLowerCase()))
    );

    try {
      const serverResults = await youtubeApi.searchChannelVideos(targetChannelId, targetChannelName, qTrim);
      if (serverResults && serverResults.length > 0) {
        const seen = new Set<string>();
        const merged: YouTubeVideo[] = [];
        for (const item of [...serverResults, ...localMatches]) {
          if (!seen.has(item.id)) {
            seen.add(item.id);
            merged.push(item);
          }
        }
        setSearchResults(merged);
      } else {
        setSearchResults(localMatches);
      }
    } catch {
      setSearchResults(localMatches);
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(() => {
      executeSearch(searchQuery);
    }, 450);

    return () => clearTimeout(timer);
  }, [searchQuery, channelData?.id, channelId, displayTitle]);

  const toggleSubscribe = () => {
    if (!channelData) return;
    const cKey = channelData.id || channelData.title;
    try {
      const savedSubs: string[] = JSON.parse(localStorage.getItem('gau_yt_subscriptions') || '[]');
      let updated: string[];
      if (savedSubs.includes(cKey)) {
        updated = savedSubs.filter((id) => id !== cKey);
        setIsSubscribed(false);
      } else {
        updated = [...savedSubs, cKey];
        setIsSubscribed(true);
      }
      localStorage.setItem('gau_yt_subscriptions', JSON.stringify(updated));
    } catch {
      setIsSubscribed(!isSubscribed);
    }
  };

  if (!isOpen) return null;

  const displayAvatar = channelData?.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayTitle)}&background=dc2626&color=fff&bold=true`;

  const displayedVideos = searchQuery.trim()
    ? (searchResults !== null
        ? searchResults
        : videos.filter((vid) =>
            vid.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (vid.description && vid.description.toLowerCase().includes(searchQuery.toLowerCase()))
          ))
    : videos;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-[#120a0d] border border-red-900/60 rounded-3xl shadow-2xl overflow-hidden my-auto max-h-[90vh] flex flex-col">
        {/* Banner / Header */}
        <div className="relative h-32 sm:h-44 bg-gradient-to-r from-red-950 via-red-900 to-[#180d11] shrink-0">
          {channelData?.bannerUrl && (
            <img
              src={channelData.bannerUrl}
              alt="Channel Banner"
              className="w-full h-full object-cover opacity-80"
            />
          )}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 z-10 bg-black/60 hover:bg-black/80 text-white p-2 rounded-full backdrop-blur-md transition-all cursor-pointer border border-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Channel Info Section */}
        <div className="px-4 sm:px-8 pb-4 relative shrink-0 border-b border-red-900/40 bg-[#160d10]">
          <div className="flex flex-col sm:flex-row items-center sm:items-end justify-between gap-4 -mt-12 sm:-mt-16 mb-3 text-center sm:text-left">
            {/* Avatar */}
            <div className="relative">
              <img
                src={displayAvatar}
                alt={displayTitle}
                className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-[#120a0d] shadow-xl object-cover bg-black"
              />
            </div>

            {/* Subscribe Action Button */}
            <button
              onClick={toggleSubscribe}
              className={`px-6 py-2.5 rounded-full text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer shadow-lg shrink-0 ${
                isSubscribed
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600'
                  : 'bg-red-600 hover:bg-red-700 text-white shadow-red-600/40'
              }`}
            >
              {isSubscribed ? (
                <>
                  <UserCheck className="w-4 h-4 text-green-400" />
                  <span>Đã đăng ký</span>
                  <Bell className="w-3.5 h-3.5 text-yellow-400 ml-1" />
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  <span>Đăng ký kênh</span>
                </>
              )}
            </button>
          </div>

          <div className="space-y-1">
            <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2 justify-center sm:justify-start">
              <span>{displayTitle}</span>
              <span className="inline-block w-4 h-4 rounded-full bg-red-600 text-white text-[10px] font-bold text-center leading-4" title="Đã xác minh">✓</span>
            </h1>
            <div className="flex items-center justify-center sm:justify-start gap-3 text-xs text-slate-400 font-medium">
              {channelData?.handle && <span>{channelData.handle}</span>}
              {channelData?.subscribers && (
                <>
                  <span>•</span>
                  <span className="text-red-400 font-semibold">{channelData.subscribers}</span>
                </>
              )}
              {channelData?.videoCount && (
                <>
                  <span>•</span>
                  <span>{channelData.videoCount}</span>
                </>
              )}
            </div>
            {channelData?.description && (
              <p className="text-xs text-slate-300 line-clamp-2 max-w-2xl pt-1">
                {channelData.description}
              </p>
            )}
          </div>
        </div>

        {/* Video List / Grid Content & Search bar */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              <Film className="w-4 h-4 text-red-500" />
              <span>Video của kênh ({displayedVideos.length})</span>
            </h2>

            {/* In-channel search bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                executeSearch(searchQuery);
              }}
              className="flex items-center bg-[#1a0f12] border border-red-950 focus-within:border-red-600 rounded-full px-3 py-1.5 transition-colors"
            >
              {isSearching ? (
                <Loader2 className="w-4 h-4 text-red-500 animate-spin mr-2 shrink-0" />
              ) : (
                <button type="submit" className="text-slate-400 hover:text-white mr-2 shrink-0 cursor-pointer" title="Tìm kiếm">
                  <Search className="w-4 h-4" />
                </button>
              )}
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm video trong kênh..."
                className="bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none w-full sm:w-48"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSearchResults(null);
                  }}
                  className="text-slate-400 hover:text-white ml-1.5 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </form>
          </div>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-3">
              <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
              <p className="text-xs text-slate-400">Đang tải danh sách video của kênh...</p>
            </div>
          ) : displayedVideos.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs">
              {searchQuery.trim()
                ? `Không tìm thấy video nào phù hợp với từ khóa "${searchQuery}".`
                : 'Chưa tìm thấy video công khai của kênh này.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayedVideos.map((vid) => (
                <div
                  key={vid.id}
                  onClick={() => {
                    onPlayVideo(vid);
                  }}
                  className="group bg-[#1a0f12] hover:bg-[#241318] border border-red-950 hover:border-red-600/50 rounded-2xl overflow-hidden transition-all duration-300 cursor-pointer flex flex-col shadow-lg"
                >
                  <div className="relative aspect-video overflow-hidden bg-black">
                    <img
                      src={vid.thumbnailUrl}
                      alt={vid.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    {vid.duration && (
                      <span className="absolute bottom-2 right-2 bg-black/80 text-white text-[10px] font-bold px-2 py-0.5 rounded backdrop-blur-sm">
                        {vid.duration}
                      </span>
                    )}
                    <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <div className="w-10 h-10 rounded-full bg-red-600 text-white flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform">
                        <Play className="w-5 h-5 fill-current ml-0.5" />
                      </div>
                    </div>
                  </div>

                  <div className="p-3 flex-1 flex flex-col justify-between space-y-2">
                    <h3 className="text-xs font-bold text-slate-200 group-hover:text-red-400 line-clamp-2 transition-colors">
                      {vid.title}
                    </h3>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-white/5">
                      <span>{vid.publishedAt || 'Mới đây'}</span>
                      {vid.viewCount && <span>{vid.viewCount}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

