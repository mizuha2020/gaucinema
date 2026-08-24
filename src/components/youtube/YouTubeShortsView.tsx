import React, { useState, useRef } from 'react';
import { YouTubeVideo, YouTubeChannel } from '../../types';
import {
  ThumbsUp,
  ThumbsDown,
  MessageCircle,
  Share2,
  Volume2,
  VolumeX,
  Play,
  Pause,
  Music,
  CheckCircle2,
  ChevronUp,
  ChevronDown,
  X,
  Send,
  Sparkles,
} from 'lucide-react';

interface YouTubeShortsViewProps {
  shortsList: YouTubeVideo[];
  onSelectChannel?: (channelTitle: string) => void;
  onShowToast: (msg: string) => void;
  onShareVideo: (video: YouTubeVideo) => void;
}

export const YouTubeShortsView: React.FC<YouTubeShortsViewProps> = ({
  shortsList,
  onSelectChannel,
  onShowToast,
  onShareVideo,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});
  const [dislikedMap, setDislikedMap] = useState<Record<string, boolean>>({});
  const [subscribedMap, setSubscribedMap] = useState<Record<string, boolean>>({});
  const [showCommentsDrawer, setShowCommentsDrawer] = useState(false);
  const [comments, setComments] = useState([
    { id: '1', user: 'Hoàng Nam', text: 'Quá đỉnh luôn admin ơi! 🔥', likes: 124, time: '2 giờ trước' },
    { id: '2', user: 'Linh Trần', text: 'Nhạc nền cuốn cực kỳ, xin tên bài hát với ạ', likes: 45, time: '5 giờ trước' },
    { id: '3', user: 'Minh Đức', text: 'Video chất lượng 10/10 Gấu YouTube đỉnh!', likes: 89, time: '1 ngày trước' },
  ]);
  const [newCommentText, setNewCommentText] = useState('');

  if (!shortsList || shortsList.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] text-center p-6 text-white space-y-4">
        <Sparkles className="w-12 h-12 text-red-500 animate-bounce" />
        <h3 className="text-xl font-bold">Chưa có video Shorts nào</h3>
        <p className="text-xs text-[#AAAAAA]">Đang cập nhật danh sách Shorts mới nhất...</p>
      </div>
    );
  }

  const currentShort = shortsList[currentIndex] || shortsList[0];
  const isLiked = likedMap[currentShort.id] || false;
  const isDisliked = dislikedMap[currentShort.id] || false;
  const isSubscribed = subscribedMap[currentShort.channelTitle] || false;

  const handleNext = () => {
    if (currentIndex < shortsList.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setIsPlaying(true);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      setIsPlaying(true);
    }
  };

  const handleToggleLike = () => {
    setLikedMap((prev) => {
      const active = !prev[currentShort.id];
      if (active) {
        onShowToast('Đã thêm vào danh sách video đã thích');
      }
      return { ...prev, [currentShort.id]: active };
    });
    if (isDisliked) {
      setDislikedMap((prev) => ({ ...prev, [currentShort.id]: false }));
    }
  };

  const handleToggleDislike = () => {
    setDislikedMap((prev) => ({ ...prev, [currentShort.id]: !prev[currentShort.id] }));
    if (isLiked) {
      setLikedMap((prev) => ({ ...prev, [currentShort.id]: false }));
    }
  };

  const handleToggleSubscribe = () => {
    const nextState = !isSubscribed;
    setSubscribedMap((prev) => ({ ...prev, [currentShort.channelTitle]: nextState }));
    onShowToast(nextState ? `Đã đăng ký kênh ${currentShort.channelTitle}` : `Đã hủy đăng ký kênh ${currentShort.channelTitle}`);
  };

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (newCommentText.trim()) {
      setComments((prev) => [
        {
          id: Date.now().toString(),
          user: 'Bạn',
          text: newCommentText.trim(),
          likes: 0,
          time: 'Vừa xong',
        },
        ...prev,
      ]);
      setNewCommentText('');
      onShowToast('Đã đăng bình luận!');
    }
  };

  return (
    <div className="relative w-full min-h-[calc(100vh-60px)] flex items-center justify-center py-2 px-2 bg-[#0F0F0F] text-white">
      {/* Centered 9:16 Vertical Shorts Card */}
      <div className="relative w-full max-w-[420px] aspect-[9/16] bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/10 flex items-center justify-center group">
        {/* Video Embed Player */}
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${currentShort.id}?autoplay=1&mute=${
            isMuted ? 1 : 0
          }&controls=0&loop=1&playlist=${currentShort.id}&modestbranding=1&rel=0`}
          title={currentShort.title}
          className="w-full h-full object-cover pointer-events-auto"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        />

        {/* Play / Pause Toggle Button Overlay */}
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className="absolute inset-0 w-full h-full cursor-pointer bg-transparent focus:outline-none"
        />

        {/* Top Controls Overlay */}
        <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10">
          <span className="bg-red-600/90 text-white font-black text-xs px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center gap-1 shadow-md">
            <span>SHORTS</span>
          </span>
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="p-2 rounded-full bg-black/60 text-white hover:bg-black/90 transition-colors cursor-pointer"
          >
            {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
        </div>

        {/* Floating Right Action Rail */}
        <div className="absolute right-3 bottom-20 z-20 flex flex-col items-center gap-5">
          {/* Like Button */}
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={handleToggleLike}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-lg ${
                isLiked
                  ? 'bg-red-600 text-white scale-110 shadow-red-600/50'
                  : 'bg-black/60 hover:bg-black/80 text-white'
              }`}
            >
              <ThumbsUp className={`w-5 h-5 ${isLiked ? 'fill-white' : ''}`} />
            </button>
            <span className="text-[11px] font-bold text-white drop-shadow-md">
              {isLiked ? '12.5K' : '12.4K'}
            </span>
          </div>

          {/* Dislike Button */}
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={handleToggleDislike}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-lg ${
                isDisliked
                  ? 'bg-red-600 text-white scale-110 shadow-red-600/50'
                  : 'bg-black/60 hover:bg-black/80 text-white'
              }`}
            >
              <ThumbsDown className={`w-5 h-5 ${isDisliked ? 'fill-white' : ''}`} />
            </button>
            <span className="text-[11px] font-bold text-white drop-shadow-md">Không thích</span>
          </div>

          {/* Comments Button */}
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={() => setShowCommentsDrawer(true)}
              className="w-12 h-12 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center transition-colors cursor-pointer shadow-lg"
            >
              <MessageCircle className="w-5 h-5" />
            </button>
            <span className="text-[11px] font-bold text-white drop-shadow-md">
              {comments.length}
            </span>
          </div>

          {/* Share Button */}
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={() => onShareVideo(currentShort)}
              className="w-12 h-12 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center transition-colors cursor-pointer shadow-lg"
            >
              <Share2 className="w-5 h-5" />
            </button>
            <span className="text-[11px] font-bold text-white drop-shadow-md">Chia sẻ</span>
          </div>

          {/* Spinning Music Disc Animation */}
          <div className="w-10 h-10 rounded-full border-2 border-white/80 bg-black overflow-hidden animate-spin flex items-center justify-center shadow-xl">
            <Music className="w-5 h-5 text-red-500" />
          </div>
        </div>

        {/* Bottom Overlay Info (Channel & Caption) */}
        <div className="absolute bottom-4 left-4 right-16 z-20 space-y-2.5 text-left text-white drop-shadow-md">
          {/* Channel Info & Subscribe */}
          <div className="flex items-center gap-2">
            <img
              src={`https://ui-avatars.com/api/?name=${encodeURIComponent(
                currentShort.channelTitle
              )}&background=FF0000&color=fff&bold=true`}
              alt={currentShort.channelTitle}
              className="w-9 h-9 rounded-full border-2 border-white object-cover"
            />
            <span
              onClick={() => onSelectChannel?.(currentShort.channelTitle)}
              className="text-sm font-bold truncate hover:underline cursor-pointer flex items-center gap-1"
            >
              <span>@{currentShort.channelTitle}</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 fill-blue-400/20" />
            </span>
            <button
              onClick={handleToggleSubscribe}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                isSubscribed
                  ? 'bg-[#272727] text-white border border-white/20'
                  : 'bg-white text-black hover:bg-slate-200'
              }`}
            >
              {isSubscribed ? 'Đã đăng ký' : 'Đăng ký'}
            </button>
          </div>

          {/* Video Title / Caption */}
          <p className="text-xs font-medium line-clamp-2 leading-relaxed">
            {currentShort.title} #Shorts #GaUTube #Trending
          </p>

          {/* Music Track */}
          <div className="flex items-center gap-2 text-[11px] text-slate-200 font-semibold">
            <Music className="w-3.5 h-3.5 text-red-400 shrink-0" />
            <span className="truncate">Nhạc nền gốc - {currentShort.channelTitle}</span>
          </div>
        </div>
      </div>

      {/* Vertical Navigation Buttons (Next / Prev) */}
      <div className="hidden md:flex flex-col gap-3 ml-4">
        <button
          onClick={handlePrev}
          disabled={currentIndex === 0}
          className="p-3 rounded-full bg-[#272727] hover:bg-[#3F3F3F] text-white disabled:opacity-40 transition-colors cursor-pointer shadow-lg"
          title="Shorts trước"
        >
          <ChevronUp className="w-6 h-6" />
        </button>
        <button
          onClick={handleNext}
          disabled={currentIndex === shortsList.length - 1}
          className="p-3 rounded-full bg-[#272727] hover:bg-[#3F3F3F] text-white disabled:opacity-40 transition-colors cursor-pointer shadow-lg"
          title="Shorts tiếp theo"
        >
          <ChevronDown className="w-6 h-6" />
        </button>
      </div>

      {/* Comments Drawer Modal */}
      {showCommentsDrawer && (
        <div className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-sm flex justify-end animate-fade-in">
          <div className="w-full max-w-md bg-[#272727] h-full flex flex-col p-4 text-white shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="text-base font-bold flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-red-500" />
                <span>Bình luận ({comments.length})</span>
              </h3>
              <button
                onClick={() => setShowCommentsDrawer(false)}
                className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Comment List */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {comments.map((c) => (
                <div key={c.id} className="p-3 bg-[#181818] rounded-2xl space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">{c.user}</span>
                    <span className="text-[10px] text-[#AAAAAA]">{c.time}</span>
                  </div>
                  <p className="text-slate-200 leading-relaxed">{c.text}</p>
                  <div className="flex items-center gap-3 pt-1 text-[11px] text-[#AAAAAA]">
                    <button className="flex items-center gap-1 hover:text-white cursor-pointer">
                      <ThumbsUp className="w-3.5 h-3.5" />
                      <span>{c.likes}</span>
                    </button>
                    <button className="hover:text-white cursor-pointer">Trả lời</button>
                  </div>
                </div>
              ))}
            </div>

            {/* Add Comment Input */}
            <form onSubmit={handleAddComment} className="flex items-center gap-2 pt-2 border-t border-white/10">
              <input
                type="text"
                value={newCommentText}
                onChange={(e) => setNewCommentText(e.target.value)}
                placeholder="Thêm bình luận..."
                className="flex-1 bg-[#121212] text-xs text-white px-3.5 py-2.5 rounded-xl border border-white/10 focus:border-red-500 focus:outline-none"
              />
              <button
                type="submit"
                className="bg-red-600 hover:bg-red-700 text-white p-2.5 rounded-xl cursor-pointer transition-colors shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
