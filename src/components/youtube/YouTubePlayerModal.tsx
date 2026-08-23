import React, { useState, useEffect } from 'react';
import { YouTubeVideo, YouTubeChannel } from '../../types';
import {
  getYouTubeEmbedUrl,
  formatViews,
  youtubeApi,
} from '../../services/youtubeApi';
import { YouTubeChannelModal } from './YouTubeChannelModal';
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
} from 'lucide-react';

interface YouTubePlayerModalProps {
  video: YouTubeVideo;
  onClose: () => void;
  onSelectRelatedVideo: (v: YouTubeVideo) => void;
  onToggleFavorite?: (v: YouTubeVideo) => void;
  isFavorite?: boolean;
  onOpenChannel?: (channelName: string, channelId?: string) => void;
}

export const YouTubePlayerModal: React.FC<YouTubePlayerModalProps> = ({
  video,
  onClose,
  onSelectRelatedVideo,
  onToggleFavorite,
  isFavorite = false,
  onOpenChannel,
}) => {
  const [relatedVideos, setRelatedVideos] = useState<YouTubeVideo[]>([]);
  const [isLoadingRelated, setIsLoadingRelated] = useState(true);
  const [liked, setLiked] = useState(false);
  const [disliked, setDisliked] = useState(false);
  const [likeCount, setLikeCount] = useState<number>(
    typeof video.likeCount === 'number' ? video.likeCount : 15800
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isDescExpanded, setIsDescExpanded] = useState(false);
  const [channelAvatar, setChannelAvatar] = useState<string>(
    video.channelAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(video.channelTitle || 'Channel')}&background=dc2626&color=fff&bold=true`
  );

  const [selectedChannelForModal, setSelectedChannelForModal] = useState<YouTubeChannel | null>(null);
  const [isChannelModalOpen, setIsChannelModalOpen] = useState(false);

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

  // Load comments from localStorage or defaults on video change
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
            text: 'Âm thanh với hình ảnh nét căng. Cảm ơn app đã tổng hợp rất hay!',
            time: '5 giờ trước',
            likes: 18,
          },
          {
            id: 'c3',
            user: 'Lê Thu Thảo',
            avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=100',
            text: 'Đang tìm nội dung này thì thấy ngay. Rất tuyệt vời!',
            time: '1 ngày trước',
            likes: 9,
          },
        ];
        setComments(defaultComments);
        localStorage.setItem(`gau_yt_comments_${video.id}`, JSON.stringify(defaultComments));
      }
    } catch {
      setComments([]);
    }
  }, [video.id]);

  // Save comments to localStorage when updated
  const saveCommentsToStorage = (updatedComments: typeof comments) => {
    setComments(updatedComments);
    try {
      localStorage.setItem(`gau_yt_comments_${video.id}`, JSON.stringify(updatedComments));
    } catch {
      // Ignore
    }
  };

  // Fetch accurate channel avatar & related videos
  useEffect(() => {
    let isMounted = true;
    setIsLoadingRelated(true);

    const loadDetails = async () => {
      // 1. Fetch channel details for accurate logo avatar
      try {
        const channelRes = await youtubeApi.getChannelDetails(video.channelId || '', video.channelTitle);
        if (isMounted && channelRes.channel?.avatarUrl) {
          setChannelAvatar(channelRes.channel.avatarUrl);
        }
      } catch {
        // Fallback
      }

      // 2. Fetch related videos
      const cleanTitle = video.title.replace(/\[.*?\]|\(.*?\)/g, '').trim();
      const keywords = cleanTitle.split(' ').slice(0, 4).join(' ');
      const searchQuery = video.channelTitle ? `${video.channelTitle}` : keywords;

      try {
        const searchRes = await youtubeApi.searchFull(searchQuery);
        if (isMounted) {
          let items = searchRes.items.filter((item) => item.id !== video.id);
          if (items.length < 5) {
            const titleRes = await youtubeApi.search(keywords);
            const additional = titleRes.filter(
              (item) => item.id !== video.id && !items.some((i) => i.id === item.id)
            );
            items = [...items, ...additional];
          }
          setRelatedVideos(items.slice(0, 15));
          setIsLoadingRelated(false);
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

    // Check subscription status
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
      } else {
        updated = [...savedSubs, channelKey];
        setIsSubscribed(true);
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
  };

  const isLiveStream = video.duration === 'LIVESTREAM' || video.publishedAt?.includes('đang phát trực tiếp') || video.durationSeconds === 999999;
  const embedUrl = getYouTubeEmbedUrl(video.id, true);

  return (
    <div className="fixed inset-0 z-[100] bg-[#0f0f0f] text-[#f1f1f1] font-sans flex flex-col overflow-y-auto animate-fade-in">
      {/* Top Header Bar - Authentic YouTube Style */}
      <div className="sticky top-0 z-50 bg-[#0f0f0f]/95 backdrop-blur-md px-4 py-2.5 border-b border-[#272727] flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 cursor-pointer" onClick={onClose}>
            <div className="w-8 h-8 rounded-full bg-red-600 flex items-center justify-center shrink-0 shadow-lg shadow-red-600/30">
              <Youtube className="w-5 h-5 text-white fill-current" />
            </div>
            <span className="font-extrabold text-base tracking-tight text-white hidden sm:inline">
              Gấu <span className="text-red-500">Player</span>
            </span>
          </div>

          <div className="hidden md:flex items-center gap-1.5 bg-red-950/40 border border-red-900/60 text-red-400 px-3 py-1 rounded-full text-xs font-semibold">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Tự động loại bỏ 100% quảng cáo</span>
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

      {/* Main Container - YouTube Layout */}
      <div className="max-w-[1700px] w-full mx-auto p-3 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
        {/* Left 8 Columns: Video Player, Channel Info, Description & Comments */}
        <div className="lg:col-span-8 space-y-4">
          {/* Main Player Box with Native YouTube Controls */}
          <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black shadow-2xl border border-[#272727]">
            <iframe
              src={embedUrl}
              title={video.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className="w-full h-full border-0"
            />
          </div>

          {/* Video Title */}
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-white leading-snug tracking-tight">
            {video.title}
          </h1>

          {/* Channel Row & Action Buttons */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-1 border-b border-[#272727] pb-4">
            {/* Channel Info + Subscribe */}
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
                <p className="text-xs text-slate-400 font-medium truncate">
                  Kênh đã xác minh
                </p>
              </div>

              <button
                onClick={toggleSubscribe}
                className={`ml-2 px-4 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                  isSubscribed
                    ? 'bg-[#272727] hover:bg-[#3f3f3f] text-slate-200 border border-slate-700'
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

            {/* Action Buttons Row */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
              {/* Like / Dislike Group */}
              <div className="flex items-center bg-[#272727] hover:bg-[#323232] rounded-full overflow-hidden shrink-0 border border-white/5">
                <button
                  onClick={handleToggleLike}
                  className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold transition-all cursor-pointer ${
                    liked ? 'text-red-400 bg-red-950/40' : 'text-slate-200 hover:text-white'
                  }`}
                >
                  <ThumbsUp className={`w-4 h-4 ${liked ? 'fill-current' : ''}`} />
                  <span>{likeCount.toLocaleString('vi-VN')}</span>
                </button>
                <div className="w-[1px] h-4 bg-slate-700" />
                <button
                  onClick={handleToggleDislike}
                  className={`px-3 py-2 text-xs transition-all cursor-pointer ${
                    disliked ? 'text-red-400 bg-red-950/40' : 'text-slate-200 hover:text-white'
                  }`}
                  title="Không thích"
                >
                  <ThumbsDown className={`w-4 h-4 ${disliked ? 'fill-current' : ''}`} />
                </button>
              </div>

              {/* Favorite / Save */}
              {onToggleFavorite && (
                <button
                  onClick={() => onToggleFavorite(video)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold transition-all cursor-pointer shrink-0 border border-white/5 ${
                    isFavorite
                      ? 'bg-red-600 text-white'
                      : 'bg-[#272727] hover:bg-[#3f3f3f] text-slate-200 hover:text-white'
                  }`}
                >
                  <Heart className={`w-4 h-4 ${isFavorite ? 'fill-current' : ''}`} />
                  <span>{isFavorite ? 'Đã lưu' : 'Lưu'}</span>
                </button>
              )}

              {/* Open Original YouTube */}
              <a
                href={`https://youtube.com/watch?v=${video.id}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 px-3.5 py-2 bg-[#272727] hover:bg-[#3f3f3f] text-slate-300 hover:text-white rounded-full transition-all shrink-0 border border-white/5 text-xs font-bold"
                title="Mở trên trang YouTube gốc"
              >
                <ExternalLink className="w-4 h-4" />
                <span>YouTube</span>
              </a>
            </div>
          </div>

          {/* Collapsible Description Box */}
          <div
            onClick={() => setIsDescExpanded(!isDescExpanded)}
            className="bg-[#272727]/80 hover:bg-[#323232] rounded-2xl p-4 transition-all cursor-pointer space-y-2 border border-white/5"
          >
            <div className="flex items-center gap-3 text-xs font-bold text-slate-200">
              <span>{formatViews(video.viewCount)}</span>
              <span>•</span>
              <span>{video.publishedAt || 'Mới đây'}</span>
              <span className="text-red-400 bg-red-950/60 px-2 py-0.5 rounded text-[11px]">
                {video.category || 'Mới nhất'}
              </span>
            </div>

            <p className={`text-xs text-slate-300 whitespace-pre-line leading-relaxed ${isDescExpanded ? '' : 'line-clamp-2'}`}>
              {video.description || `Xem video "${video.title}" chuẩn độ phân giải cao trên Gấu YouTube Player.`}
            </p>

            <button className="text-xs font-bold text-slate-400 hover:text-white flex items-center gap-1 pt-1">
              {isDescExpanded ? (
                <>
                  <span>Ẩn bớt</span>
                  <ChevronUp className="w-3.5 h-3.5" />
                </>
              ) : (
                <>
                  <span>Hiện thêm</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>

          {/* Dynamic Comments Section (Persisted in localStorage) */}
          <div className="pt-4 space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <MessageSquare className="w-4 h-4 text-red-500" />
              <span>{comments.length} Bình luận</span>
            </div>

            {/* Input Comment */}
            <form onSubmit={handleAddComment} className="flex gap-3 items-center">
              <img
                src="https://ui-avatars.com/api/?name=You&background=dc2626&color=fff&bold=true"
                alt="User Avatar"
                className="w-8 h-8 rounded-full border border-red-500/50 shrink-0"
              />
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Viết bình luận của bạn..."
                className="flex-1 bg-[#272727] text-xs text-white px-4 py-2.5 rounded-full border border-white/10 focus:border-red-500 focus:outline-none transition-all placeholder:text-slate-500"
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
                      <span className="text-[10px] text-slate-500">{c.time}</span>
                    </div>
                    <p className="text-slate-300 leading-normal">{c.text}</p>
                    <div className="flex items-center gap-3 text-[11px] text-slate-400 pt-1">
                      <button className="flex items-center gap-1 hover:text-red-400 cursor-pointer">
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

        {/* Right 4 Columns: DYNAMIC RELEVANT RECOMMENDED VIDEOS */}
        <div className="lg:col-span-4 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-[#272727]">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-red-500" />
              <span>Video liên quan & Gợi ý</span>
            </h2>
            <span className="text-[11px] text-red-400 font-medium">Trực tiếp từ YouTube</span>
          </div>

          {isLoadingRelated ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-2">
              <Loader2 className="w-6 h-6 text-red-500 animate-spin" />
              <p className="text-xs text-slate-400">Đang tìm video liên quan...</p>
            </div>
          ) : relatedVideos.length === 0 ? (
            <div className="text-xs text-slate-400 text-center py-8">
              Không có video gợi ý thêm.
            </div>
          ) : (
            <div className="space-y-3">
              {relatedVideos.map((rel) => (
                <div
                  key={rel.id}
                  onClick={() => onSelectRelatedVideo(rel)}
                  className="group flex gap-3 bg-[#181818] hover:bg-[#272727] p-2 rounded-xl cursor-pointer transition-all border border-transparent hover:border-red-900/40"
                >
                  {/* Thumbnail Box */}
                  <div className="relative w-36 sm:w-40 aspect-video rounded-lg overflow-hidden bg-black shrink-0">
                    <img
                      src={rel.thumbnailUrl}
                      alt={rel.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    {rel.duration && (
                      <span className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] font-bold px-1.5 py-0.5 rounded backdrop-blur-sm">
                        {rel.duration}
                      </span>
                    )}
                  </div>

                  {/* Video Details */}
                  <div className="flex flex-col justify-between min-w-0 flex-1 py-0.5">
                    <h3 className="text-xs font-bold text-slate-200 group-hover:text-red-400 line-clamp-2 leading-snug transition-colors">
                      {rel.title}
                    </h3>
                    <div className="text-[11px] text-slate-400 space-y-0.5">
                      <p className="truncate font-medium hover:text-slate-200">{rel.channelTitle}</p>
                      <p className="text-[10px] text-slate-500">
                        {formatViews(rel.viewCount)} • {rel.publishedAt || 'Mới đây'}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

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
