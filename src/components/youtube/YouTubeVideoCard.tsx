import React, { useState, useRef, useEffect } from 'react';
import { YouTubeVideo, YouTubeChannel } from '../../types';
import {
  MoreVertical,
  CheckCircle2,
  Clock,
  ListPlus,
  Ban,
  Share2,
  Flag,
  Play,
  Volume2,
  VolumeX,
} from 'lucide-react';

interface YouTubeVideoCardProps {
  video: YouTubeVideo;
  onSelectVideo: (video: YouTubeVideo) => void;
  onSelectChannel?: (channelIdOrTitle: string) => void;
  onOpenChannel?: (channelName: string, channelId?: string) => void;
  onSaveToWatchLater?: (video: YouTubeVideo) => void;
  onShareVideo?: (video: YouTubeVideo) => void;
  onShowToast?: (msg: string) => void;
  onToggleFavorite?: (video: YouTubeVideo) => void;
  isFavorite?: boolean;
}

export const YouTubeVideoCard: React.FC<YouTubeVideoCardProps> = ({
  video,
  onSelectVideo,
  onSelectChannel,
  onOpenChannel,
  onSaveToWatchLater,
  onShareVideo,
  onShowToast,
  onToggleFavorite,
  isFavorite,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [notInterested, setNotInterested] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Dismiss context menu on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);

  if (notInterested) {
    return (
      <div className="bg-[#272727] rounded-xl p-4 text-center text-xs text-[#AAAAAA] flex flex-col items-center justify-center gap-2 border border-white/5">
        <p>Đã ẩn video này khỏi trang chủ</p>
        <button
          onClick={() => setNotInterested(false)}
          className="text-red-400 font-bold hover:underline cursor-pointer"
        >
          Hoàn tác
        </button>
      </div>
    );
  }

  const avatarUrl =
    video.channelAvatar ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(video.channelTitle || 'Channel')}&background=333&color=fff&bold=true`;

  return (
    <div className="group flex flex-col gap-2.5 cursor-pointer relative select-none">
      {/* 16:9 Thumbnail Container */}
      <div
        onClick={() => onSelectVideo(video)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="relative aspect-video w-full rounded-xl overflow-hidden bg-[#272727] shadow-lg transition-transform duration-300 group-hover:scale-[1.02] group-hover:rounded-none sm:group-hover:rounded-xl"
      >
        <img
          src={video.thumbnailUrl}
          alt={video.title}
          className="w-full h-full object-cover transition-opacity duration-300"
          loading="lazy"
        />

        {/* Hover Play Overlay */}
        {isHovered && (
          <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center transition-opacity">
            <div className="w-12 h-12 rounded-full bg-red-600 text-white flex items-center justify-center shadow-xl scale-105 transition-transform">
              <Play className="w-6 h-6 fill-white ml-0.5" />
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsMuted(!isMuted);
              }}
              className="absolute bottom-2 left-2 p-1.5 rounded-full bg-black/70 text-white hover:bg-black cursor-pointer"
              title={isMuted ? 'Bật tiếng' : 'Tắt tiếng'}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>
        )}

        {/* Duration / LIVE Badge */}
        {video.duration && (
          <div className="absolute bottom-2 right-2 bg-black/85 text-white text-[11px] font-semibold px-1.5 py-0.5 rounded tracking-wide font-mono">
            {video.duration}
          </div>
        )}
      </div>

      {/* Video Meta Info */}
      <div className="flex gap-3 px-0.5">
        {/* Channel Avatar */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (onOpenChannel) {
              onOpenChannel(video.channelTitle, video.channelId);
            } else if (onSelectChannel && (video.channelId || video.channelTitle)) {
              onSelectChannel(video.channelId || video.channelTitle);
            }
          }}
          className="shrink-0 cursor-pointer focus:outline-none"
          title={video.channelTitle}
        >
          <img
            src={avatarUrl}
            alt={video.channelTitle}
            className="w-9 h-9 rounded-full object-cover border border-white/10 hover:opacity-90 transition-opacity"
          />
        </button>

        {/* Title, Channel, Views & 3-Dots Menu */}
        <div className="flex-1 min-w-0 pr-1">
          <h3
            onClick={() => onSelectVideo(video)}
            className="text-sm font-semibold text-white line-clamp-2 leading-snug group-hover:text-red-400 transition-colors"
            title={video.title}
          >
            {video.title}
          </h3>

          {/* Channel Name */}
          <div
            onClick={(e) => {
              e.stopPropagation();
              if (onOpenChannel) {
                onOpenChannel(video.channelTitle, video.channelId);
              } else if (onSelectChannel && (video.channelId || video.channelTitle)) {
                onSelectChannel(video.channelId || video.channelTitle);
              }
            }}
            className="flex items-center gap-1 text-[13px] text-[#AAAAAA] hover:text-white transition-colors mt-1 truncate cursor-pointer"
          >
            <span className="truncate">{video.channelTitle}</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-[#AAAAAA] fill-[#AAAAAA]/30 shrink-0" />
          </div>

          {/* Views & Time Ago */}
          <div className="text-[12px] text-[#AAAAAA] flex items-center gap-1 mt-0.5 truncate">
            <span>{typeof video.viewCount === 'number' ? `${video.viewCount.toLocaleString()} lượt xem` : video.viewCount || '100K lượt xem'}</span>
            <span>•</span>
            <span>{video.publishedAt || '2 ngày trước'}</span>
          </div>
        </div>

        {/* 3-Dots Context Menu Button */}
        <div ref={menuRef} className="relative shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsMenuOpen(!isMenuOpen);
            }}
            className="p-1 rounded-full text-slate-400 opacity-0 group-hover:opacity-100 hover:text-white hover:bg-[#272727] transition-all cursor-pointer"
            title="Tùy chọn khác"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {/* Floating Context Menu Dropdown */}
          {isMenuOpen && (
            <div className="absolute right-0 top-6 w-56 bg-[#282828] border border-[#3F3F3F] rounded-2xl shadow-2xl py-2 z-50 text-xs text-white animate-fade-in space-y-0.5">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSaveToWatchLater?.(video);
                  setIsMenuOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3.5 py-2 hover:bg-[#3F3F3F] text-left transition-colors cursor-pointer"
              >
                <Clock className="w-4 h-4 text-slate-300 shrink-0" />
                <span>Lưu vào Xem sau</span>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onShowToast?.('Đã thêm vào danh sách chờ phát!');
                  setIsMenuOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3.5 py-2 hover:bg-[#3F3F3F] text-left transition-colors cursor-pointer"
              >
                <ListPlus className="w-4 h-4 text-slate-300 shrink-0" />
                <span>Thêm vào danh sách chờ</span>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setNotInterested(true);
                  setIsMenuOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3.5 py-2 hover:bg-[#3F3F3F] text-left transition-colors cursor-pointer"
              >
                <Ban className="w-4 h-4 text-slate-300 shrink-0" />
                <span>Không quan tâm</span>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onShareVideo?.(video);
                  setIsMenuOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3.5 py-2 hover:bg-[#3F3F3F] text-left transition-colors cursor-pointer"
              >
                <Share2 className="w-4 h-4 text-slate-300 shrink-0" />
                <span>Chia sẻ</span>
              </button>

              <div className="border-t border-[#3F3F3F] my-1" />

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onShowToast?.('Đã gửi báo cáo vi phạm!');
                  setIsMenuOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3.5 py-2 hover:bg-[#3F3F3F] text-left text-red-400 transition-colors cursor-pointer"
              >
                <Flag className="w-4 h-4 text-red-400 shrink-0" />
                <span>Báo cáo vi phạm</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
