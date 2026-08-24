import React, { useState, useEffect } from 'react';
import { YouTubeVideo, YouTubeChannel } from '../../types';
import {
  getYouTubeEmbedUrl,
  formatViews,
  youtubeApi,
} from '../../services/youtubeApi';
import { YouTubeChannelModal } from './YouTubeChannelModal';
import { YouTubeShareModal } from './YouTubeShareModal';
import {
  X,
  ShieldCheck,
  Heart,
  ThumbsUp,
  ThumbsDown,
  Youtube,
  ExternalLink,
  MessageSquare,
  Send,
  Loader2,
  Bell,
  UserPlus,
  UserCheck,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Radio,
  Share2,
  Download,
  Bookmark,
  MoreHorizontal,
} from 'lucide-react';

interface YouTubePlayerModalProps {
  video: YouTubeVideo;
  onClose: () => void;
  onSelectRelatedVideo: (v: YouTubeVideo) => void;
  onToggleFavorite?: (v: YouTubeVideo) => void;
  isFavorite?: boolean;
  onOpenChannel?: (channelName: string, channelId?: string) => void;
  onShowToast?: (msg: string) => void;
}

export const YouTubePlayerModal: React.FC<YouTubePlayerModalProps> = ({
  video,
  onClose,
  onSelectRelatedVideo,
  onToggleFavorite,
  isFavorite = false,
  onOpenChannel,
  onShowToast,
}) => {
  const [relatedVideos, setRelatedVideos] = useState<YouTubeVideo[]>([]);
  const [isLoadingRelated, setIsLoadingRelated] = useState(true);
  const [relatedFilter, setRelatedFilter] = useState<'all' | 'channel' | 'related'>('all');
  const [liked, setLiked] = useState(false);
  const [disliked, setDisliked] = useState(false);
  const [likeCount, setLikeCount] = useState<number>(
    typeof video.likeCount === 'number' ? video.likeCount : 15800
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isDescExpanded, setIsDescExpanded] = useState(false);
  const [channelAvatar, setChannelAvatar] = useState<string>(
    video.channelAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(video.channelTitle || 'Channel')}&background=FF0000&color=fff&bold=true`
  );

  const [selectedChannelForModal, setSelectedChannelForModal] = useState<YouTubeChannel | null>(null);
  const [isChannelModalOpen, setIsChannelModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  const handleOpenChannelClick = (cName: string, cId?: string) => {
    if (onOpenChannel) {
      onOpenChannel(cName, cId);
    } else {
      setSelectedChannelForModal({
        id: cId || 'channel_custom',
        title: cName,
        avatarUrl: channelAvatar,
      });
      setIsChannelModalOpen(true);
    }
  };

  const [comments, setComments] = useState<
    { id: string; user: string; avatar: string; text: string; time: string; likes: number }[]
  >([]);
  const [newComment, setNewComment] = useState('');

  // Keyboard Shortcuts (Space / K: play/pause toggle notice, F: fullscreen, M: mute toggle notice)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.code === 'KeyF') {
        const playerElem = document.getElementById('youtube-iframe-player');
        if (playerElem) {
          if (!document.fullscreenElement) {
            playerElem.requestFullscreen?.();
          } else {
            document.exitFullscreen?.();
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Load comments
  useEffect(() => {
    try {
      const savedComments = localStorage.getItem(`gau_yt_comments_${video.id}`);
      if (savedComments) {
        setComments(JSON.parse(savedComments));
      } else {
        const defaultComments = [
          {
            id: 'c1',
            user: 'Nguyễn Văn Minh',
            avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=100',
            text: 'Video quá chất lượng! Xem mượt mà không có quảng cáo làm phiền.',
            time: '2 giờ trước',
            likes: 42,
          },
          {
            id: 'c2',
            user: 'Trần Hoàng Nam',
            avatar: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&q=80&w=100',
            text: 'Âm thanh với hình ảnh nét căng. Cảm ơn Gấu YouTube đã cập nhật!',
            time: '5 giờ trước',
            likes: 18,
          },
        ];
        setComments(defaultComments);
        localStorage.setItem(`gau_yt_comments_${video.id}`, JSON.stringify(defaultComments));
      }
    } catch {
      setComments([]);
    }
  }, [video.id]);

  const saveCommentsToStorage = (updatedComments: typeof comments) => {
    setComments(updatedComments);
    try {
      localStorage.setItem(`gau_yt_comments_${video.id}`, JSON.stringify(updatedComments));
    } catch {
      // Ignore
    }
  };

  // Fetch channel avatar & related videos
  useEffect(() => {
    let isMounted = true;
    setIsLoadingRelated(true);

    const loadDetails = async () => {
      try {
        const channelRes = await youtubeApi.getChannelDetails(video.channelId || '', video.channelTitle);
        if (isMounted && channelRes.channel?.avatarUrl) {
          setChannelAvatar(channelRes.channel.avatarUrl);
        }
      } catch {
        // Fallback
      }

      const cleanTitle = video.title.replace(/\[.*?\]|\(.*?\)/g, '').replace(/\s+/g, ' ').trim();
      const keywords = cleanTitle.split(' ').slice(0, 5).join(' ');
      const topicQuery = keywords || video.channelTitle || '';
      const channelQuery = video.channelTitle || '';

      const safeSearch = async (q: string): Promise<YouTubeVideo[]> => {
        try {
          return await youtubeApi.search(q);
        } catch {
          return [];
        }
      };

      try {
        const [topicItems, channelItems] = await Promise.all([
          topicQuery ? safeSearch(topicQuery) : Promise.resolve([] as YouTubeVideo[]),
          channelQuery && channelQuery !== topicQuery
            ? safeSearch(channelQuery)
            : Promise.resolve([] as YouTubeVideo[]),
        ]);

        const seen = new Set<string>([video.id]);
        const merged: YouTubeVideo[] = [];
        const takeFrom = (list: YouTubeVideo[], limit: number) => {
          let taken = 0;
          for (const item of list) {
            if (taken >= limit || merged.length >= 15) break;
            if (!item?.id || seen.has(item.id)) continue;
            seen.add(item.id);
            merged.push(item);
            taken++;
          }
        };

        takeFrom(topicItems, 9);
        takeFrom(channelItems, 6);
        takeFrom(topicItems, 99);

        if (isMounted) {
          if (merged.length > 0) {
            setRelatedVideos(merged);
            setIsLoadingRelated(false);
          } else {
            const fallback = await youtubeApi.getTrending('all');
            setRelatedVideos(fallback.filter((f) => f.id !== video.id).slice(0, 10));
            setIsLoadingRelated(false);
          }
        }
      } catch {
        if (isMounted) {
          const fallback = await youtubeApi.getTrending('all');
          setRelatedVideos(fallback.filter((f) => f.id !== video.id).slice(0, 10));
          setIsLoadingRelated(false);
        }
      }
    };

    loadDetails();

    try {
      const savedSubs: string[] = JSON.parse(localStorage.getItem('gau_yt_subscriptions') || '[]');
      const channelKey = video.channelId || video.channelTitle;
      setIsSubscribed(savedSubs.includes(channelKey));
    } catch {
      setIsSubscribed(false);
    }

    return () => {
      isMounted = false;
    };
  }, [video.id, video.title, video.channelTitle, video.channelId]);

  const toggleSubscribe = () => {
    const channelKey = video.channelId || video.channelTitle;
    try {
      const savedSubs: string[] = JSON.parse(localStorage.getItem('gau_yt_subscriptions') || '[]');
      let updated: string[];
      if (savedSubs.includes(channelKey)) {
        updated = savedSubs.filter((id) => id !== channelKey);
        setIsSubscribed(false);
        onShowToast?.(`Đã hủy đăng ký kênh ${video.channelTitle}`);
      } else {
        updated = [...savedSubs, channelKey];
        setIsSubscribed(true);
        onShowToast?.(`Đã đăng ký kênh ${video.channelTitle}!`);
      }
      localStorage.setItem('gau_yt_subscriptions', JSON.stringify(updated));
    } catch {
      setIsSubscribed(!isSubscribed);
    }
  };

  const handleToggleLike = () => {
    if (liked) {
      setLiked(false);
      setLikeCount((prev) => prev - 1);
    } else {
      setLiked(true);
      if (disliked) setDisliked(false);
      setLikeCount((prev) => prev + 1);
      onShowToast?.('Đã thích video này!');
    }
  };

  const handleToggleDislike = () => {
    if (disliked) {
      setDisliked(false);
    } else {
      setDisliked(true);
      if (liked) {
        setLiked(false);
        setLikeCount((prev) => prev - 1);
      }
    }
  };

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    const updated = [
      {
        id: Date.now().toString(),
        user: 'Bạn',
        avatar: 'https://ui-avatars.com/api/?name=User&background=dc2626&color=fff&bold=true',
        text: newComment.trim(),
        time: 'Vừa xong',
        likes: 0,
      },
      ...comments,
    ];
    saveCommentsToStorage(updated);
    setNewComment('');
    onShowToast?.('Đã gửi bình luận!');
  };

  const filteredRelatedVideos = relatedVideos.filter((v) => {
    if (relatedFilter === 'channel') {
      return v.channelTitle?.toLowerCase() === video.channelTitle?.toLowerCase();
    }
    return true;
  });

  const isLiveStream = video.duration === 'LIVESTREAM' || video.publishedAt?.includes('đang phát trực tiếp') || video.durationSeconds === 999999;
  const embedUrl = getYouTubeEmbedUrl(video.id, true);

  return (
    <div className="fixed inset-0 z-[100] bg-[#0F0F0F] text-[#F1F1F1] font-sans flex flex-col overflow-y-auto animate-fade-in select-none">
      {/* Top Header Bar */}
      <div className="sticky top-0 z-50 bg-[#0F0F0F]/95 backdrop-blur-md px-4 py-2 border-b border-[#272727] flex items-center justify-between gap-4 h-[56px]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 cursor-pointer" onClick={onClose}>
            <div className="w-8 h-8 rounded-full bg-[#FF0000] flex items-center justify-center shrink-0 shadow-lg shadow-red-600/30">
              <Youtube className="w-5 h-5 text-white fill-current" />
            </div>
            <span className="font-extrabold text-base tracking-tight text-white hidden sm:inline">
              Gấu <span className="text-red-500">YouTube</span>
            </span>
          </div>

          <div className="hidden md:flex items-center gap-1.5 bg-red-950/40 border border-red-900/60 text-red-400 px-3 py-1 rounded-full text-xs font-semibold">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>0 Quảng Cáo</span>
          </div>

          {isLiveStream && (
            <div className="flex items-center gap-1.5 bg-red-600 text-white px-2.5 py-0.5 rounded-full text-[11px] font-bold animate-pulse">
              <Radio className="w-3 h-3" />
              <span>TRỰC TIẾP (LIVE)</span>
            </div>
          )}
        </div>

        {/* Video Title Indicator */}
        <div className="flex-1 max-w-xl hidden lg:block text-center truncate text-xs text-slate-300 font-medium">
          {video.title}
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#272727] hover:bg-red-600 text-slate-200 hover:text-white transition-all cursor-pointer text-xs font-bold"
        >
          <X className="w-4 h-4" />
          <span>Thoát</span>
        </button>
      </div>

      {/* Main Container - 2 Column Layout (70% Left / 30% Right) */}
      <div className="max-w-[1700px] w-full mx-auto p-3 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
        {/* Primary Left Column (~70% / 8 cols) */}
        <div className="lg:col-span-8 space-y-4">
          {/* Main 16:9 Player Container */}
          <div
            id="youtube-iframe-player"
            className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black shadow-2xl border border-[#272727]"
          >
            <iframe
              src={embedUrl}
              title={video.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className="w-full h-full border-0"
            />
          </div>

          {/* Video Title Header */}
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-white leading-snug tracking-tight">
            {video.title}
          </h1>

          {/* Channel Info & Action Buttons Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-1 border-b border-[#272727] pb-4">
            {/* Channel Info + Subscribe Pill */}
            <div className="flex items-center gap-3">
              <div
                onClick={() => handleOpenChannelClick(video.channelTitle, video.channelId)}
                className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-[#272727] overflow-hidden flex items-center justify-center shrink-0 cursor-pointer border border-white/10 hover:opacity-80 transition-opacity"
              >
                <img
                  src={channelAvatar}
                  alt={video.channelTitle}
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="min-w-0">
                <h3
                  onClick={() => handleOpenChannelClick(video.channelTitle, video.channelId)}
                  className="text-sm sm:text-base font-bold text-white hover:text-red-400 cursor-pointer transition-colors truncate flex items-center gap-1"
                >
                  <span>{video.channelTitle}</span>
                  <span className="w-3.5 h-3.5 rounded-full bg-red-600 text-white text-[9px] font-bold flex items-center justify-center shrink-0">✓</span>
                </h3>
                <p className="text-xs text-[#AAAAAA] font-medium truncate">
                  1.2M người đăng ký
                </p>
              </div>

              <button
                onClick={toggleSubscribe}
                className={`ml-2 px-4 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                  isSubscribed
                    ? 'bg-[#272727] hover:bg-[#3F3F3F] text-white border border-white/20'
                    : 'bg-white hover:bg-slate-200 text-black font-extrabold shadow-md'
                }`}
              >
                {isSubscribed ? (
                  <>
                    <UserCheck className="w-3.5 h-3.5 text-green-400" />
                    <span>Đã đăng ký</span>
                    <Bell className="w-3 h-3 text-yellow-400 ml-0.5" />
                  </>
                ) : (
                  <>
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Đăng ký</span>
                  </>
                )}
              </button>
            </div>

            {/* Action Buttons Group */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
              {/* Like / Dislike Split Button */}
              <div className="flex items-center bg-[#272727] hover:bg-[#3F3F3F] rounded-full overflow-hidden shrink-0 border border-white/5">
                <button
                  onClick={handleToggleLike}
                  className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold transition-all cursor-pointer ${
                    liked ? 'text-white bg-red-600/40' : 'text-slate-200 hover:text-white'
                  }`}
                >
                  <ThumbsUp className={`w-4 h-4 ${liked ? 'fill-current' : ''}`} />
                  <span>{likeCount.toLocaleString('vi-VN')}</span>
                </button>
                <div className="w-[1px] h-4 bg-white/20" />
                <button
                  onClick={handleToggleDislike}
                  className={`px-3 py-2 text-xs transition-all cursor-pointer ${
                    disliked ? 'text-white bg-red-600/40' : 'text-slate-200 hover:text-white'
                  }`}
                  title="Không thích"
                >
                  <ThumbsDown className={`w-4 h-4 ${disliked ? 'fill-current' : ''}`} />
                </button>
              </div>

              {/* Share Button */}
              <button
                onClick={() => setIsShareModalOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-[#272727] hover:bg-[#3F3F3F] text-slate-200 hover:text-white rounded-full transition-all shrink-0 border border-white/5 text-xs font-bold cursor-pointer"
              >
                <Share2 className="w-4 h-4" />
                <span>Chia sẻ</span>
              </button>

              {/* Download Button */}
              <button
                onClick={() => onShowToast?.('Đã bắt đầu tải xuống video cho xem offline!')}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-[#272727] hover:bg-[#3F3F3F] text-slate-200 hover:text-white rounded-full transition-all shrink-0 border border-white/5 text-xs font-bold cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Tải xuống</span>
              </button>

              {/* Favorite / Save Button */}
              {onToggleFavorite && (
                <button
                  onClick={() => onToggleFavorite(video)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold transition-all cursor-pointer shrink-0 border border-white/5 ${
                    isFavorite
                      ? 'bg-red-600 text-white'
                      : 'bg-[#272727] hover:bg-[#3F3F3F] text-slate-200 hover:text-white'
                  }`}
                >
                  <Heart className={`w-4 h-4 ${isFavorite ? 'fill-current' : ''}`} />
                  <span>{isFavorite ? 'Đã lưu' : 'Lưu'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Collapsible Gray Description Card (#272727) */}
          <div
            onClick={() => setIsDescExpanded(!isDescExpanded)}
            className="bg-[#272727] hover:bg-[#323232] rounded-2xl p-4 transition-all cursor-pointer space-y-2 border border-white/5"
          >
            <div className="flex items-center gap-3 text-xs font-bold text-slate-200">
              <span>{formatViews(video.viewCount)}</span>
              <span>•</span>
              <span>{video.publishedAt || '2 ngày trước'}</span>
              <span className="text-red-400 bg-red-950/60 px-2 py-0.5 rounded text-[11px]">
                #{video.category || 'Trending'}
              </span>
            </div>

            <p className={`text-xs text-slate-300 whitespace-pre-line leading-relaxed ${isDescExpanded ? '' : 'line-clamp-2'}`}>
              {video.description || `Thưởng thức nội dung "${video.title}" với chất lượng sắc nét 0 quảng cáo trên Gấu YouTube VN.`}
            </p>

            <button className="text-xs font-bold text-slate-400 hover:text-white flex items-center gap-1 pt-1">
              {isDescExpanded ? (
                <>
                  <span>Ẩn bớt</span>
                  <ChevronUp className="w-3.5 h-3.5" />
                </>
              ) : (
                <>
                  <span>...xem thêm</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>

          {/* Comments Section */}
          <div className="pt-4 space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <MessageSquare className="w-4 h-4 text-red-500" />
              <span>{comments.length} Bình luận</span>
            </div>

            {/* Comment Input */}
            <form onSubmit={handleAddComment} className="flex gap-3 items-center">
              <img
                src="https://ui-avatars.com/api/?name=You&background=FF0000&color=fff&bold=true"
                alt="User Avatar"
                className="w-8 h-8 rounded-full border border-red-500/50 shrink-0"
              />
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Viết bình luận của bạn..."
                className="flex-1 bg-[#121212] text-xs text-white px-4 py-2.5 rounded-full border border-white/10 focus:border-red-500 focus:outline-none transition-all placeholder:text-[#AAAAAA]"
              />
              <button
                type="submit"
                disabled={!newComment.trim()}
                className="bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white p-2 rounded-full cursor-pointer transition-all shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>

            {/* Comments List */}
            <div className="space-y-3 pt-2">
              {comments.map((c) => (
                <div key={c.id} className="flex gap-3 text-xs bg-[#181818] p-3 rounded-2xl border border-white/5">
                  <img
                    src={c.avatar}
                    alt={c.user}
                    className="w-8 h-8 rounded-full object-cover shrink-0"
                  />
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-200">{c.user}</span>
                      <span className="text-[10px] text-[#AAAAAA]">{c.time}</span>
                    </div>
                    <p className="text-slate-300 leading-normal">{c.text}</p>
                    <div className="flex items-center gap-3 text-[11px] text-[#AAAAAA] pt-1">
                      <button className="flex items-center gap-1 hover:text-white cursor-pointer">
                        <ThumbsUp className="w-3 h-3" />
                        <span>{c.likes > 0 ? c.likes : ''}</span>
                      </button>
                      <button className="hover:text-white cursor-pointer">Phản hồi</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Secondary Right Column (~30% / 4 cols) - Up Next / Recommended Videos */}
        <div className="lg:col-span-4 space-y-4">
          {/* Top Filter Chips */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setRelatedFilter('all')}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer shrink-0 ${
                relatedFilter === 'all'
                  ? 'bg-white text-black'
                  : 'bg-[#272727] text-white hover:bg-[#3F3F3F]'
              }`}
            >
              Tất cả
            </button>
            <button
              onClick={() => setRelatedFilter('channel')}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer shrink-0 ${
                relatedFilter === 'channel'
                  ? 'bg-white text-black'
                  : 'bg-[#272727] text-white hover:bg-[#3F3F3F]'
              }`}
            >
              Từ kênh này
            </button>
          </div>

          <div className="flex items-center justify-between pb-1 border-b border-[#272727]">
            <h2 className="text-xs font-bold text-white flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-red-500" />
              <span>Video tiếp theo</span>
            </h2>
          </div>

          {isLoadingRelated ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-2">
              <Loader2 className="w-6 h-6 text-red-500 animate-spin" />
              <p className="text-xs text-[#AAAAAA]">Đang tải video gợi ý...</p>
            </div>
          ) : filteredRelatedVideos.length === 0 ? (
            <div className="text-xs text-[#AAAAAA] text-center py-8">
              Không tìm thấy video gợi ý cùng kênh.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRelatedVideos.map((rel) => (
                <div
                  key={rel.id}
                  onClick={() => onSelectRelatedVideo(rel)}
                  className="group flex gap-2.5 bg-[#181818] hover:bg-[#272727] p-2 rounded-xl cursor-pointer transition-all border border-transparent hover:border-white/10"
                >
                  {/* Thumbnail Box */}
                  <div className="relative w-36 sm:w-40 aspect-video rounded-lg overflow-hidden bg-black shrink-0">
                    <img
                      src={rel.thumbnailUrl}
                      alt={rel.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    {rel.duration && (
                      <span className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded backdrop-blur-sm">
                        {rel.duration}
                      </span>
                    )}
                  </div>

                  {/* Video Details */}
                  <div className="flex flex-col justify-between min-w-0 flex-1 py-0.5">
                    <h3 className="text-xs font-bold text-slate-200 group-hover:text-red-400 line-clamp-2 leading-snug transition-colors">
                      {rel.title}
                    </h3>
                    <div className="text-[11px] text-[#AAAAAA] space-y-0.5">
                      <p className="truncate font-medium hover:text-slate-200">{rel.channelTitle}</p>
                      <p className="text-[10px] text-[#AAAAAA]">
                        {formatViews(rel.viewCount)} • {rel.publishedAt || '2 ngày trước'}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Share Modal */}
      {isShareModalOpen && (
        <YouTubeShareModal
          video={video}
          onClose={() => setIsShareModalOpen(false)}
          onShowToast={(msg) => onShowToast?.(msg)}
        />
      )}

      {/* Channel Modal */}
      {isChannelModalOpen && (
        <YouTubeChannelModal
          channel={selectedChannelForModal}
          isOpen={isChannelModalOpen}
          onClose={() => setIsChannelModalOpen(false)}
          onPlayVideo={(relVid) => {
            setIsChannelModalOpen(false);
            onSelectRelatedVideo(relVid);
          }}
        />
      )}
    </div>
  );
};
