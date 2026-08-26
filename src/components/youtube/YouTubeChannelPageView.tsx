import React, { useState, useEffect } from 'react';
import {
  X,
  ArrowLeft,
  Bell,
  Play,
  UserCheck,
  UserPlus,
  Film,
  Flame,
  Radio,
  Smartphone,
  Info,
  Search,
  Loader2,
  Compass,
  ThumbsUp,
  Calendar,
  Globe,
  MoreVertical,
  ChevronDown,
  Users,
} from 'lucide-react';
import { YouTubeChannel, YouTubeVideo, UserProfile, Account } from '../../types';
import { youtubeApi } from '../../services/youtubeApi';
import { firestoreStorage } from '../../services/firestoreStorage';
import { YouTubeChannelBioModal } from './YouTubeChannelBioModal';

interface YouTubeChannelPageViewProps {
  channel: YouTubeChannel | null;
  channelId?: string;
  channelName?: string;
  currentAccount?: Account | null;
  activeProfile?: UserProfile | null;
  onBack: () => void;
  onPlayVideo: (video: YouTubeVideo) => void;
}

export const YouTubeChannelPageView: React.FC<YouTubeChannelPageViewProps> = ({
  channel: initialChannel,
  channelId,
  channelName,
  currentAccount,
  activeProfile,
  onBack,
  onPlayVideo,
}) => {
  const [channelData, setChannelData] = useState<YouTubeChannel | null>(initialChannel);
  const [videos, setVideos] = useState<YouTubeVideo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [activeTab, setActiveTab] = useState<'home' | 'videos' | 'shorts' | 'live' | 'about'>('home');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isBioModalOpen, setIsBioModalOpen] = useState(false);
  const [channelSearchQuery, setChannelSearchQuery] = useState('');
  const [channelSearchResults, setChannelSearchResults] = useState<YouTubeVideo[] | null>(null);
  const [isSearchingVideos, setIsSearchingVideos] = useState(false);

  // Re-trigger state cleanup immediately on route / channel parameter change
  useEffect(() => {
    let isMounted = true;
    // Strict state isolation: immediately reset videos and set loading
    setVideos([]);
    setChannelSearchResults(null);
    setChannelSearchQuery('');
    setIsSearchOpen(false);
    setIsLoading(true);
    if (initialChannel) {
      setChannelData(initialChannel);
    }

    const loadChannel = async () => {
      const cId = initialChannel?.id || channelId || '';
      const cName = initialChannel?.title || channelName || '';

      const result = await youtubeApi.getChannelDetails(cId, cName);

      if (isMounted) {
        if (result.channel) {
          setChannelData(result.channel);
          const channelKey = result.channel.id || result.channel.title;

          // Check subscription status from Firestore per profile
          if (currentAccount?.id && activeProfile?.id) {
            try {
              const subs = await firestoreStorage.getYoutubeSubscriptions(currentAccount.id, activeProfile.id);
              if (isMounted) {
                setIsSubscribed(subs.includes(channelKey) || (result.channel.id ? subs.includes(result.channel.id) : false));
              }
            } catch {
              // Fallback to localStorage
              try {
                const savedSubs = JSON.parse(localStorage.getItem(`gau_yt_subs_${activeProfile.id}`) || localStorage.getItem('gau_yt_subscriptions') || '[]');
                if (isMounted) setIsSubscribed(savedSubs.includes(channelKey));
              } catch {
                if (isMounted) setIsSubscribed(false);
              }
            }
          } else {
            try {
              const savedSubs = JSON.parse(localStorage.getItem('gau_yt_subscriptions') || '[]');
              setIsSubscribed(savedSubs.includes(channelKey));
            } catch {
              setIsSubscribed(false);
            }
          }
        }
        setVideos(result.items || []);
        setIsLoading(false);
      }
    };

    loadChannel();

    return () => {
      isMounted = false;
    };
  }, [initialChannel?.id, initialChannel?.title, channelId, channelName, currentAccount?.id, activeProfile?.id]);

  const displayTitle = channelData?.title || channelName || 'Kênh YouTube';
  const displayAvatar =
    channelData?.avatarUrl ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(displayTitle)}&background=dc2626&color=fff&bold=true`;

  // Perform live server/network search inside the channel
  const executeChannelSearch = async (queryText: string) => {
    const qTrim = queryText.trim();
    if (!qTrim) {
      setChannelSearchResults(null);
      setIsSearchingVideos(false);
      return;
    }

    setIsSearchingVideos(true);
    const targetChannelId = channelData?.id || channelId || '';
    const targetChannelName = displayTitle;

    // Instant local matches as initial baseline
    const localFiltered = videos.filter((vid) =>
      vid.title.toLowerCase().includes(qTrim.toLowerCase()) ||
      (vid.description && vid.description.toLowerCase().includes(qTrim.toLowerCase()))
    );

    try {
      const serverResults = await youtubeApi.searchChannelVideos(targetChannelId, targetChannelName, qTrim);
      if (serverResults && serverResults.length > 0) {
        // Merge without duplicates
        const seen = new Set<string>();
        const merged: YouTubeVideo[] = [];
        for (const item of [...serverResults, ...localFiltered]) {
          if (!seen.has(item.id)) {
            seen.add(item.id);
            merged.push(item);
          }
        }
        setChannelSearchResults(merged);
      } else {
        setChannelSearchResults(localFiltered);
      }
    } catch {
      setChannelSearchResults(localFiltered);
    } finally {
      setIsSearchingVideos(false);
    }
  };

  // Debounced search trigger when typing
  useEffect(() => {
    if (!channelSearchQuery.trim()) {
      setChannelSearchResults(null);
      setIsSearchingVideos(false);
      return;
    }

    const timer = setTimeout(() => {
      executeChannelSearch(channelSearchQuery);
    }, 450);

    return () => clearTimeout(timer);
  }, [channelSearchQuery, channelData?.id, channelId, displayTitle]);

  const toggleSubscribe = async () => {
    if (!channelData) return;
    const cKey = channelData.id || channelData.title;
    const newStatus = !isSubscribed;
    setIsSubscribed(newStatus);

    // Save to Firestore per profile
    if (currentAccount?.id && activeProfile?.id) {
      try {
        await firestoreStorage.toggleYoutubeSubscription(
          currentAccount.id,
          activeProfile.id,
          cKey,
          channelData.title,
          channelData.avatarUrl
        );
      } catch (e) {
        console.warn('Failed to sync subscription to Firestore:', e);
      }
    }

    // LocalStorage fallback cache
    try {
      const storageKey = activeProfile?.id ? `gau_yt_subs_${activeProfile.id}` : 'gau_yt_subscriptions';
      const savedSubs: string[] = JSON.parse(localStorage.getItem(storageKey) || '[]');
      let updated: string[];
      if (savedSubs.includes(cKey)) {
        updated = savedSubs.filter((id) => id !== cKey);
      } else {
        updated = [...savedSubs, cKey];
      }
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch {
      // Ignore
    }
  };

  // Filter videos based on active tab and search query
  const filteredVideos = channelSearchQuery.trim()
    ? (channelSearchResults !== null
        ? channelSearchResults
        : videos.filter((vid) =>
            vid.title.toLowerCase().includes(channelSearchQuery.toLowerCase()) ||
            (vid.description && vid.description.toLowerCase().includes(channelSearchQuery.toLowerCase()))
          ))
    : videos.filter((vid) => {
        if (activeTab === 'live') {
          return vid.duration === 'LIVE' || (vid.viewCount && String(vid.viewCount).includes('đang xem'));
        }
        if (activeTab === 'shorts') {
          return vid.category === 'shorts' || (vid.durationSeconds && vid.durationSeconds <= 60);
        }
        return true;
      });

  const liveVideos = videos.filter(
    (v) => v.duration === 'LIVE' || (v.viewCount && String(v.viewCount).includes('đang xem'))
  );
  const featuredVideo = videos.length > 0 ? videos[0] : null;

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white animate-fade-in pb-20 pt-14 w-full max-w-full overflow-hidden">
      {/* Channel Header Navigator */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-[#0f0f0f]/95 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto pl-2 pr-3 sm:px-4 h-14 flex items-center gap-1.5 sm:gap-2.5">
          <button
            onClick={onBack}
            title="Quay lại"
            className="w-10 h-10 shrink-0 rounded-full hover:bg-white/10 active:bg-white/15 flex items-center justify-center transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <img
            src={displayAvatar}
            alt={displayTitle}
            className="w-8 h-8 rounded-full object-cover border border-white/15 shrink-0"
            referrerPolicy="no-referrer"
          />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="text-sm font-bold text-white truncate">{displayTitle}</p>
            {channelData?.subscribers && (
              <p className="text-[11px] text-slate-400 truncate">
                {channelData.subscribers}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Banner / Header */}
      <div className="w-full max-w-full overflow-hidden">
        <div className="w-full h-28 sm:h-44 md:h-56 lg:h-64 relative bg-zinc-900 overflow-hidden flex items-center justify-center">
          {channelData?.bannerUrl ? (
            <img
              src={channelData.bannerUrl}
              alt="Channel Banner"
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-r from-red-950/80 via-neutral-900 to-black flex items-center justify-center">
              <div className="text-center px-4">
                <h2 className="text-lg sm:text-2xl font-black text-white/90 tracking-wide drop-shadow-md truncate max-w-md">
                  {displayTitle}
                </h2>
                <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5 drop-shadow font-medium">
                  Kênh YouTube chính thức
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Channel Metadata & Actions Container */}
      <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 pt-3 pb-4 sm:py-6 w-full min-w-0">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-3 sm:gap-6 -mt-8 sm:-mt-14 md:-mt-18 mb-3 sm:mb-6 relative z-10 w-full min-w-0">
          {/* Avatar with Live / Verified Pill */}
          <div className="relative shrink-0 flex flex-col items-center">
            <img
              src={displayAvatar}
              alt={displayTitle}
              className="w-16 h-16 sm:w-28 sm:h-28 md:w-32 md:h-32 rounded-full border-2 sm:border-4 border-[#0f0f0f] shadow-2xl object-cover bg-black"
              referrerPolicy="no-referrer"
            />
            {liveVideos.length > 0 && (
              <span className="absolute -bottom-2 bg-red-600 text-white text-[9px] sm:text-[10px] font-black px-2 sm:px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-md animate-pulse border-2 border-[#0f0f0f]">
                Trực tiếp
              </span>
            )}
          </div>

          {/* Info & Dynamic Handle */}
          <div className="flex-1 text-center sm:text-left space-y-1.5 sm:space-y-2 w-full min-w-0">
            <h1 className="text-lg sm:text-2xl md:text-3xl font-black text-white flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2">
              <span className="truncate max-w-[85vw] sm:max-w-xl">{displayTitle}</span>
              <span
                className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-600 text-white text-[10px] font-bold shrink-0"
                title="Đã xác minh"
              >
                ✓
              </span>
            </h1>

            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5 text-xs sm:text-sm text-slate-400 font-medium">
              <span className="text-slate-300 font-semibold truncate max-w-[200px]">
                {channelData?.handle
                  ? channelData.handle.startsWith('@')
                    ? channelData.handle
                    : `@${channelData.handle}`
                  : `@${displayTitle.toLowerCase().replace(/[^a-z0-9]/g, '')}`}
              </span>
              <span className="text-slate-600">•</span>
              <span className="text-slate-300 font-semibold">{channelData?.subscribers || 'Nhiều người đăng ký'}</span>
              <span className="text-slate-600">•</span>
              <span>{videos.length} video</span>
            </div>

            {/* Description Snippet with xem thêm */}
            {channelData?.description && (
              <div className="text-xs sm:text-sm text-slate-300 max-w-3xl leading-relaxed mx-auto sm:mx-0">
                <p className="line-clamp-1">
                  {channelData.description}
                  <button
                    onClick={() => setIsBioModalOpen(true)}
                    className="text-white font-bold ml-1 hover:underline cursor-pointer inline-flex items-center"
                  >
                    ...xem thêm
                  </button>
                </p>
              </div>
            )}

            {/* Action Buttons row */}
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1.5 w-full">
              <button
                onClick={toggleSubscribe}
                className={`flex-1 sm:flex-initial px-4 sm:px-5 py-2 rounded-full text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-lg ${
                  isSubscribed
                    ? 'bg-neutral-800 hover:bg-neutral-700 text-slate-200 border border-neutral-700'
                    : 'bg-red-600 hover:bg-red-700 text-white shadow-red-600/40'
                }`}
              >
                <Bell className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                <span>{isSubscribed ? 'Đã đăng ký' : 'Đăng ký'}</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-0.5 shrink-0" />
              </button>

              <button
                onClick={() => alert(`Tham gia hội viên kênh ${displayTitle}`)}
                className="flex-1 sm:flex-initial px-4 py-2 rounded-full bg-neutral-800 hover:bg-neutral-700 text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer text-slate-200 border border-neutral-700"
              >
                <span className="text-yellow-400 text-sm">⭐</span>
                <span>Tham gia</span>
              </button>

              <button
                onClick={() => alert(`Cộng đồng kênh ${displayTitle}`)}
                className="hidden sm:flex px-4 py-2 rounded-full bg-neutral-800 hover:bg-neutral-700 text-xs sm:text-sm font-bold items-center justify-center gap-1.5 transition-colors cursor-pointer text-slate-200 border border-neutral-700"
              >
                <Users className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                <span>Cộng đồng</span>
              </button>
            </div>
          </div>
        </div>

        {/* Tab Navigation & YouTube-style Search Button */}
        <div className="sticky top-14 z-30 -mx-3.5 px-3.5 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 bg-[#0f0f0f]/95 backdrop-blur-md border-b border-white/10 flex items-center justify-between gap-1 overflow-hidden">
          <div className="flex items-center gap-1 sm:gap-3 overflow-x-auto scrollbar-none flex-1 py-0.5 max-w-full">
            {[
              { id: 'home', label: 'Trang Chủ', icon: Compass },
              { id: 'videos', label: 'Video', icon: Film },
              { id: 'shorts', label: 'Shorts', icon: Smartphone },
              { id: 'live', label: 'Trực Tiếp', icon: Radio },
              { id: 'about', label: 'Giới thiệu', icon: Info },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-1 sm:gap-1.5 py-2.5 sm:py-3 px-2.5 sm:px-3 text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap border-b-2 shrink-0 ${
                    isActive
                      ? 'border-white text-white'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-red-500' : 'text-slate-400'}`} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* YouTube Search icon toggle & input form */}
          <div className="flex items-center pl-4 pr-2">
            {isSearchOpen ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  executeChannelSearch(channelSearchQuery);
                }}
                className="flex items-center bg-neutral-900 border border-neutral-700 focus-within:border-red-500 rounded-full pl-3 pr-2 py-1 max-w-xs animate-fade-in transition-colors"
              >
                {isSearchingVideos ? (
                  <Loader2 className="w-4 h-4 text-red-500 animate-spin mr-2 shrink-0" />
                ) : (
                  <button type="submit" className="text-slate-400 hover:text-white mr-2 shrink-0 cursor-pointer" title="Tìm kiếm">
                    <Search className="w-4 h-4" />
                  </button>
                )}
                <input
                  type="text"
                  autoFocus
                  value={channelSearchQuery}
                  onChange={(e) => setChannelSearchQuery(e.target.value)}
                  placeholder={`Tìm trong ${displayTitle}...`}
                  className="bg-transparent text-xs sm:text-sm text-white focus:outline-none w-32 sm:w-48 placeholder-slate-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    setIsSearchOpen(false);
                    setChannelSearchQuery('');
                    setChannelSearchResults(null);
                  }}
                  className="p-1 hover:bg-white/10 rounded-full text-slate-400 hover:text-white cursor-pointer"
                  title="Đóng tìm kiếm"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </form>
            ) : (
              <button
                onClick={() => setIsSearchOpen(true)}
                className="p-2.5 rounded-full hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
                title="Tìm kiếm trong kênh"
              >
                <Search className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Search status notification if searching */}
        {channelSearchQuery.trim() && (
          <div className="py-3 flex items-center justify-between text-xs text-slate-400 border-b border-white/5 bg-neutral-900/30 px-3 rounded-xl mt-2">
            <div className="flex items-center gap-2">
              {isSearchingVideos ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 text-red-500 animate-spin" />
                  <span className="text-slate-300">Đang truy vấn YouTube tìm video của kênh "{displayTitle}"...</span>
                </>
              ) : (
                <span>
                  Kết quả tìm kiếm cho <strong className="text-white">"{channelSearchQuery}"</strong> trong {displayTitle} ({filteredVideos.length} video)
                </span>
              )}
            </div>
            <button
              onClick={() => {
                setChannelSearchQuery('');
                setChannelSearchResults(null);
              }}
              className="text-red-400 hover:text-red-300 underline font-semibold cursor-pointer"
            >
              Xóa bộ lọc
            </button>
          </div>
        )}

        {/* Tab Content Display */}
        {isLoading ? (
          <div className="space-y-6 mt-6">
            {/* Featured video skeleton */}
            <div className="bg-neutral-900/60 border border-neutral-800/80 rounded-3xl p-4 sm:p-6 animate-pulse grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-7 aspect-video bg-neutral-800 rounded-2xl" />
              <div className="lg:col-span-5 flex flex-col justify-center space-y-3">
                <div className="w-24 h-4 bg-neutral-800 rounded-full" />
                <div className="w-3/4 h-6 bg-neutral-800 rounded-lg" />
                <div className="w-1/2 h-4 bg-neutral-800 rounded-md" />
                <div className="w-full h-12 bg-neutral-800/60 rounded-xl" />
              </div>
            </div>

            {/* Video grid skeleton cards */}
            <div className="space-y-3">
              <div className="w-36 h-5 bg-neutral-800 rounded-md animate-pulse" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="bg-neutral-900/80 border border-neutral-800/80 rounded-2xl overflow-hidden animate-pulse">
                    <div className="aspect-video bg-neutral-800" />
                    <div className="p-3.5 space-y-2.5">
                      <div className="w-full h-4 bg-neutral-800 rounded" />
                      <div className="w-2/3 h-3 bg-neutral-800/60 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : activeTab === 'about' && !channelSearchQuery ? (
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-3xl p-6 sm:p-8 space-y-6 max-w-4xl mt-6">
            <h2 className="text-lg font-bold text-white">Giới thiệu về {displayTitle}</h2>
            <div className="space-y-4 text-sm text-slate-300 leading-relaxed">
              <p className="whitespace-pre-line">
                {channelData?.description ||
                  `Chào mừng bạn đến với kênh chính thức của ${displayTitle}. Nơi cập nhật những nội dung giải trí, video âm nhạc, trận đấu đỉnh cao và phát sóng trực tiếp mới nhất mỗi ngày.`}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-white/10">
                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <Globe className="w-4 h-4 text-red-500" />
                  <span>Kênh YouTube Đã Xác Minh</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <Calendar className="w-4 h-4 text-red-500" />
                  <span>Tham gia từ YouTube Creator Community</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <ThumbsUp className="w-4 h-4 text-red-500" />
                  <span>{channelData?.subscribers || 'Kênh YouTube xác minh'}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <Film className="w-4 h-4 text-red-500" />
                  <span>{videos.length} video công khai</span>
                </div>
              </div>
            </div>
          </div>
        ) : channelSearchQuery.trim() ? (
          /* Search results matching user screenshot (vertical list layout like YouTube channel search) */
          <div className="space-y-3 mt-6">
            <h3 className="text-sm font-bold text-slate-300">
              Video phù hợp ({filteredVideos.length})
            </h3>
            {filteredVideos.length === 0 ? (
              <div className="text-center py-20 text-slate-400 text-sm">
                Không tìm thấy video nào phù hợp với từ khóa "{channelSearchQuery}".
              </div>
            ) : (
              <div className="space-y-3">
                {filteredVideos.map((vid) => (
                  <div
                    key={vid.id}
                    onClick={() => onPlayVideo(vid)}
                    className="group flex flex-col sm:flex-row gap-4 bg-neutral-900/60 hover:bg-neutral-900 border border-neutral-800/80 hover:border-neutral-700 p-3 sm:p-4 rounded-2xl transition-all cursor-pointer shadow-md"
                  >
                    {/* Thumbnail */}
                    <div className="relative w-full sm:w-64 aspect-video shrink-0 overflow-hidden rounded-xl bg-black">
                      <img
                        src={vid.thumbnailUrl}
                        alt={vid.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      {vid.duration && (
                        <span
                          className={`absolute bottom-2 right-2 text-white text-[10px] font-bold px-2 py-0.5 rounded backdrop-blur-sm ${
                            vid.duration === 'LIVE' ? 'bg-red-600 animate-pulse' : 'bg-black/80'
                          }`}
                        >
                          {vid.duration}
                        </span>
                      )}
                    </div>

                    {/* Metadata & Description */}
                    <div className="flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-sm sm:text-base font-bold text-white group-hover:text-red-400 transition-colors line-clamp-2 leading-snug">
                            {vid.title}
                          </h4>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              alert(`Tùy chọn video: ${vid.title}`);
                            }}
                            className="p-1 hover:bg-white/10 rounded-full text-slate-400 hover:text-white shrink-0"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-400 mt-1.5">
                          <span>{vid.viewCount || '590 N lượt xem'}</span>
                          <span>•</span>
                          <span>{vid.publishedAt || '3 tháng trước'}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <div className="w-5 h-5 rounded-full bg-red-600 flex items-center justify-center text-[10px] font-bold text-white">
                            {displayTitle.charAt(0)}
                          </div>
                          <span className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                            {displayTitle}
                            <span className="w-3 h-3 rounded-full bg-red-600 text-white text-[9px] flex items-center justify-center font-bold">✓</span>
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-slate-400 line-clamp-2 mt-2 leading-relaxed">
                        {vid.description || `Xem trọn bộ nội dung đặc sắc từ ${displayTitle} với chất lượng cao không quảng cáo.`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : activeTab === 'home' ? (
          <div className="space-y-8 mt-6">
            {/* Featured Spotlight Video */}
            {featuredVideo && (
              <div
                onClick={() => onPlayVideo(featuredVideo)}
                className="bg-neutral-900/80 border border-neutral-800 rounded-3xl overflow-hidden shadow-2xl hover:border-red-600/50 transition-all cursor-pointer group grid grid-cols-1 lg:grid-cols-12 gap-0"
              >
                <div className="lg:col-span-7 relative aspect-video overflow-hidden bg-black">
                  <img
                    src={featuredVideo.thumbnailUrl}
                    alt={featuredVideo.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  {featuredVideo.duration && (
                    <span className="absolute bottom-3 right-3 bg-black/80 text-white text-xs font-bold px-2.5 py-1 rounded backdrop-blur-sm">
                      {featuredVideo.duration}
                    </span>
                  )}
                  <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <div className="w-12 h-12 rounded-full bg-red-600 text-white flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform">
                      <Play className="w-6 h-6 fill-current ml-0.5" />
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-5 p-6 sm:p-8 flex flex-col justify-center space-y-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-red-500 uppercase tracking-wider">
                    <Flame className="w-4 h-4" />
                    <span>Video nổi bật của kênh</span>
                  </div>
                  <h2 className="text-lg sm:text-xl font-bold text-white group-hover:text-red-400 transition-colors leading-snug">
                    {featuredVideo.title}
                  </h2>
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span>{featuredVideo.publishedAt || 'Mới đây'}</span>
                    {featuredVideo.viewCount && (
                      <>
                        <span>•</span>
                        <span>{featuredVideo.viewCount}</span>
                      </>
                    )}
                  </div>
                  <p className="text-xs text-slate-300 line-clamp-3 leading-relaxed">
                    {featuredVideo.description || `Xem ngay video nổi bật mới nhất từ ${displayTitle} với chất lượng cao và âm thanh sống động.`}
                  </p>
                </div>
              </div>
            )}

            {/* Live Streams Section */}
            {liveVideos.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Radio className="w-5 h-5 text-red-500 animate-pulse" />
                  <h3 className="text-base sm:text-lg font-bold text-white">Đang phát trực tiếp (LIVE)</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {liveVideos.map((vid) => (
                    <div
                      key={vid.id}
                      onClick={() => onPlayVideo(vid)}
                      className="group bg-neutral-900 hover:bg-neutral-800 border border-red-900/50 hover:border-red-500 rounded-2xl overflow-hidden transition-all duration-300 cursor-pointer flex flex-col shadow-xl"
                    >
                      <div className="relative aspect-video overflow-hidden bg-black">
                        <img
                          src={vid.thumbnailUrl}
                          alt={vid.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          referrerPolicy="no-referrer"
                        />
                        <span className="absolute top-2 left-2 bg-red-600 text-white text-[10px] font-black px-2 py-0.5 rounded animate-pulse flex items-center gap-1 shadow-md">
                          <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                          <span>LIVE</span>
                        </span>
                      </div>
                      <div className="p-3.5 flex-1 flex flex-col justify-between space-y-2">
                        <h4 className="text-xs sm:text-sm font-bold text-white group-hover:text-red-400 line-clamp-2">
                          {vid.title}
                        </h4>
                        <div className="flex items-center justify-between text-[11px] text-slate-400">
                          <span className="text-red-400 font-semibold">{vid.viewCount || 'Đang xem'}</span>
                          <span>{vid.publishedAt || 'Trực tiếp'}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* All Channel Videos */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <Film className="w-5 h-5 text-red-500" />
                  <span>Tất cả video từ {displayTitle}</span>
                </h3>
              </div>

              {videos.length === 0 ? (
                <div className="text-center py-16 text-slate-400 text-xs sm:text-sm">
                  Chưa có video nào trong kênh này.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {videos.map((vid) => (
                    <div
                      key={vid.id}
                      onClick={() => onPlayVideo(vid)}
                      className="group bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-red-600/50 rounded-2xl overflow-hidden transition-all duration-300 cursor-pointer flex flex-col shadow-lg"
                    >
                      <div className="relative aspect-video overflow-hidden bg-black">
                        <img
                          src={vid.thumbnailUrl}
                          alt={vid.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          referrerPolicy="no-referrer"
                        />
                        {vid.duration && (
                          <span className="absolute bottom-2 right-2 bg-black/80 text-white text-[10px] font-bold px-2 py-0.5 rounded">
                            {vid.duration}
                          </span>
                        )}
                      </div>
                      <div className="p-3.5 flex-1 flex flex-col justify-between space-y-2">
                        <h4 className="text-xs sm:text-sm font-bold text-white group-hover:text-red-400 line-clamp-2">
                          {vid.title}
                        </h4>
                        <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-white/5">
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
        ) : (
          /* Videos, Shorts, Live tabs */
          <div className="space-y-4 mt-6">
            <h3 className="text-base font-bold text-white capitalize">
              Danh mục: {activeTab === 'videos' ? 'Tất cả Video' : activeTab === 'shorts' ? 'Shorts' : 'Trực tiếp / Live'}
            </h3>
            {filteredVideos.length === 0 ? (
              <div className="text-center py-16 text-slate-400 text-xs sm:text-sm">
                Không có video nào trong danh mục này.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredVideos.map((vid) => (
                  <div
                    key={vid.id}
                    onClick={() => onPlayVideo(vid)}
                    className="group bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-red-600/50 rounded-2xl overflow-hidden transition-all duration-300 cursor-pointer flex flex-col shadow-lg"
                  >
                    <div className="relative aspect-video overflow-hidden bg-black">
                      <img
                        src={vid.thumbnailUrl}
                        alt={vid.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        referrerPolicy="no-referrer"
                      />
                      {vid.duration && (
                        <span className="absolute bottom-2 right-2 bg-black/80 text-white text-[10px] font-bold px-2 py-0.5 rounded">
                          {vid.duration}
                        </span>
                      )}
                    </div>
                    <div className="p-3.5 flex-1 flex flex-col justify-between space-y-2">
                      <h4 className="text-xs sm:text-sm font-bold text-white group-hover:text-red-400 line-clamp-2">
                        {vid.title}
                      </h4>
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>{vid.publishedAt || 'Mới đây'}</span>
                        {vid.viewCount && <span>{vid.viewCount}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Channel Bio Full Modal */}
      {isBioModalOpen && channelData && (
        <YouTubeChannelBioModal
          channel={channelData}
          onClose={() => setIsBioModalOpen(false)}
        />
      )}
    </div>
  );
};
