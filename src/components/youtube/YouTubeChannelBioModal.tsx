import React from 'react';
import { YouTubeChannel } from '../../types';
import {
  X,
  Globe,
  Info,
  Calendar,
  Eye,
  Users,
  Video,
  Mail,
  ExternalLink,
  ShieldCheck,
  Share2,
} from 'lucide-react';

interface YouTubeChannelBioModalProps {
  channel: YouTubeChannel;
  onClose: () => void;
  onShowToast?: (msg: string) => void;
}

export const YouTubeChannelBioModal: React.FC<YouTubeChannelBioModalProps> = ({
  channel,
  onClose,
  onShowToast,
}) => {
  const handleShare = () => {
    const channelUrl = `https://youtube.com/${channel.handle || channel.title.replace(/\s+/g, '')}`;
    navigator.clipboard.writeText(channelUrl);
    onShowToast?.('Đã sao chép liên kết kênh!');
  };

  return (
    <div className="fixed inset-0 z-[130] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-[#212121] border border-white/10 rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl overflow-hidden text-white">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Info className="w-4 h-4 text-red-500" />
            <span>Giới thiệu về {channel.title}</span>
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Scrollable */}
        <div className="p-5 overflow-y-auto space-y-6 text-xs text-slate-200 leading-relaxed">
          {/* Channel Brief Card */}
          <div className="flex items-center gap-4 p-3.5 rounded-xl bg-[#181818] border border-white/5">
            <img
              src={
                channel.avatarUrl ||
                `https://ui-avatars.com/api/?name=${encodeURIComponent(channel.title)}&background=FF0000&color=fff&bold=true`
              }
              alt={channel.title}
              className="w-14 h-14 rounded-full object-cover border border-white/10 shrink-0"
              referrerPolicy="no-referrer"
            />
            <div className="min-w-0 flex-1 space-y-0.5">
              <h4 className="text-sm font-bold text-white flex items-center gap-1.5 truncate">
                {channel.title}
                <span className="w-3.5 h-3.5 rounded-full bg-neutral-600 text-white text-[9px] font-bold flex items-center justify-center">
                  ✓
                </span>
              </h4>
              <p className="text-[11px] text-[#AAAAAA]">{channel.handle || `@${channel.title.toLowerCase().replace(/\s+/g, '')}`}</p>
              <p className="text-[11px] text-[#AAAAAA]">{[channel.subscribers, channel.videoCount].filter(Boolean).join(' • ')}</p>
            </div>
          </div>

          {/* Description Section */}
          <div className="space-y-2">
            <h5 className="text-xs font-bold uppercase tracking-wider text-[#AAAAAA]">Mô tả kênh</h5>
            <div className="bg-[#181818] p-4 rounded-xl border border-white/5 whitespace-pre-line text-slate-300 font-sans leading-normal">
              {channel.description ||
                `Chào mừng bạn đến với kênh chính thức của ${channel.title}! Tại đây chúng tôi liên tục cập nhật những video độc quyền, hấp dẫn và đặc sắc nhất dành cho cộng đồng. Hãy đăng ký kênh và nhấn chuông thông báo để không bỏ lỡ các nội dung mới nhất!`}
            </div>
          </div>

          {/* Channel Links */}
          <div className="space-y-2">
            <h5 className="text-xs font-bold uppercase tracking-wider text-[#AAAAAA]">Liên kết & Mạng xã hội</h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <a
                href="https://facebook.com"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between p-2.5 rounded-xl bg-[#181818] hover:bg-white/5 border border-white/5 transition-colors text-blue-400 font-medium"
              >
                <div className="flex items-center gap-2 truncate">
                  <Globe className="w-4 h-4 text-blue-400 shrink-0" />
                  <span className="truncate">Fanpage Facebook chính thức</span>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </a>
              <a
                href="https://tiktok.com"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between p-2.5 rounded-xl bg-[#181818] hover:bg-white/5 border border-white/5 transition-colors text-pink-400 font-medium"
              >
                <div className="flex items-center gap-2 truncate">
                  <Globe className="w-4 h-4 text-pink-400 shrink-0" />
                  <span className="truncate">Kênh TikTok Official</span>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </a>
            </div>
          </div>

          {/* Channel Stats */}
          <div className="space-y-2">
            <h5 className="text-xs font-bold uppercase tracking-wider text-[#AAAAAA]">Chi tiết & Thống kê</h5>
            <div className="divide-y divide-white/5 rounded-xl bg-[#181818] border border-white/5 overflow-hidden">
              <div className="flex items-center justify-between p-3">
                <span className="flex items-center gap-2 text-slate-400">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  <span>Ngày tham gia</span>
                </span>
                <span className="font-semibold text-white">{channel.joinedDate || '15 tháng 3, 2018'}</span>
              </div>
              <div className="flex items-center justify-between p-3">
                <span className="flex items-center gap-2 text-slate-400">
                  <Eye className="w-4 h-4 text-slate-400" />
                  <span>Tổng lượt xem</span>
                </span>
                <span className="font-semibold text-white">{channel.viewsTotal || '185.620.400 lượt xem'}</span>
              </div>
              <div className="flex items-center justify-between p-3">
                <span className="flex items-center gap-2 text-slate-400">
                  <Users className="w-4 h-4 text-slate-400" />
                  <span>Người đăng ký</span>
                </span>
                <span className="font-semibold text-white">{channel.subscribers || '1.8M người đăng ký'}</span>
              </div>
              <div className="flex items-center justify-between p-3">
                <span className="flex items-center gap-2 text-slate-400">
                  <Video className="w-4 h-4 text-slate-400" />
                  <span>Tổng số video</span>
                </span>
                <span className="font-semibold text-white">{channel.videoCount || '482 video'}</span>
              </div>
              <div className="flex items-center justify-between p-3">
                <span className="flex items-center gap-2 text-slate-400">
                  <Mail className="w-4 h-4 text-slate-400" />
                  <span>Liên hệ công việc</span>
                </span>
                <span className="font-semibold text-white">{channel.businessEmail || 'contact@gaucreator.vn'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 bg-[#181818] flex items-center justify-between">
          <button
            onClick={handleShare}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Chia sẻ kênh</span>
          </button>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-full bg-white text-black text-xs font-bold hover:bg-slate-200 transition-colors cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
