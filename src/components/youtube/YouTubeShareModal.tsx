import React, { useState } from 'react';
import { YouTubeVideo } from '../../types';
import {
  X,
  Copy,
  Check,
  Code,
  Share2,
  Send,
  Mail,
  Clock,
  ExternalLink,
} from 'lucide-react';

interface YouTubeShareModalProps {
  video: YouTubeVideo;
  currentTime?: number;
  onClose: () => void;
  onShowToast?: (msg: string) => void;
}

export const YouTubeShareModal: React.FC<YouTubeShareModalProps> = ({
  video,
  currentTime = 0,
  onClose,
  onShowToast,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedEmbed, setCopiedEmbed] = useState(false);
  const [activeTab, setActiveTab] = useState<'link' | 'embed'>('link');
  const [startAtEnabled, setStartAtEnabled] = useState(false);
  const [startAtSeconds, setStartAtSeconds] = useState(Math.floor(currentTime) || 30);

  const formatTimestamp = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const [timestampStr, setTimestampStr] = useState(formatTimestamp(startAtSeconds));

  const handleTimestampChange = (val: string) => {
    setTimestampStr(val);
    const parts = val.split(':').map((p) => parseInt(p, 10));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      setStartAtSeconds(parts[0] * 60 + parts[1]);
    } else if (parts.length === 1 && !isNaN(parts[0])) {
      setStartAtSeconds(parts[0]);
    }
  };

  const baseShareUrl = `https://youtu.be/${video.id}`;
  const shareUrl = startAtEnabled
    ? `${baseShareUrl}?t=${startAtSeconds}`
    : baseShareUrl;

  const embedCode = `<iframe width="560" height="315" src="https://www.youtube-nocookie.com/embed/${video.id}${
    startAtEnabled ? `?start=${startAtSeconds}` : ''
  }" title="${video.title}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    onShowToast?.('Đã sao chép liên kết video!');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyEmbed = () => {
    navigator.clipboard.writeText(embedCode);
    setCopiedEmbed(true);
    onShowToast?.('Đã sao chép mã nhúng HTML!');
    setTimeout(() => setCopiedEmbed(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-[140] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-[#212121] border border-white/10 rounded-2xl p-5 max-w-md w-full shadow-2xl space-y-4 text-white">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Share2 className="w-5 h-5 text-red-500" />
            <span>Chia sẻ video</span>
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Share Tabs */}
        <div className="flex border-b border-white/10 text-xs font-bold">
          <button
            onClick={() => setActiveTab('link')}
            className={`flex-1 py-2 text-center transition-colors border-b-2 cursor-pointer ${
              activeTab === 'link'
                ? 'border-white text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Mạng xã hội & Liên kết
          </button>
          <button
            onClick={() => setActiveTab('embed')}
            className={`flex-1 py-2 text-center transition-colors border-b-2 cursor-pointer ${
              activeTab === 'embed'
                ? 'border-white text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Mã nhúng HTML
          </button>
        </div>

        {/* Video Mini Summary */}
        <div className="flex items-center gap-3 bg-[#181818] p-2.5 rounded-xl border border-white/5">
          <img
            src={video.thumbnailUrl}
            alt={video.title}
            className="w-16 aspect-video rounded object-cover shrink-0"
            referrerPolicy="no-referrer"
          />
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="text-xs font-bold text-white line-clamp-1">{video.title}</p>
            <p className="text-[11px] text-[#AAAAAA] truncate">{video.channelTitle}</p>
          </div>
        </div>

        {activeTab === 'link' ? (
          <div className="space-y-4">
            {/* Quick Share Icons Grid */}
            <div className="grid grid-cols-5 gap-2 text-center">
              <a
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`}
                target="_blank"
                rel="noreferrer"
                className="flex flex-col items-center gap-1 p-2 rounded-xl bg-blue-600/15 hover:bg-blue-600/25 text-blue-400 transition-colors text-[10px] font-medium"
              >
                <div className="w-8 h-8 rounded-full bg-[#1877F2] text-white flex items-center justify-center font-bold text-sm">
                  f
                </div>
                <span>Facebook</span>
              </a>

              <a
                href={`https://zalo.me/share?url=${encodeURIComponent(shareUrl)}`}
                target="_blank"
                rel="noreferrer"
                className="flex flex-col items-center gap-1 p-2 rounded-xl bg-sky-600/15 hover:bg-sky-600/25 text-sky-400 transition-colors text-[10px] font-medium"
              >
                <div className="w-8 h-8 rounded-full bg-[#0068FF] text-white flex items-center justify-center font-bold text-[10px]">
                  Zalo
                </div>
                <span>Zalo</span>
              </a>

              <a
                href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(video.title)}`}
                target="_blank"
                rel="noreferrer"
                className="flex flex-col items-center gap-1 p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white transition-colors text-[10px] font-medium"
              >
                <div className="w-8 h-8 rounded-full bg-black border border-white/20 text-white flex items-center justify-center font-bold text-xs">
                  𝕏
                </div>
                <span>X / Twitter</span>
              </a>

              <a
                href={`https://api.whatsapp.com/send?text=${encodeURIComponent(video.title + ' ' + shareUrl)}`}
                target="_blank"
                rel="noreferrer"
                className="flex flex-col items-center gap-1 p-2 rounded-xl bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-400 transition-colors text-[10px] font-medium"
              >
                <div className="w-8 h-8 rounded-full bg-[#25D366] text-white flex items-center justify-center font-bold text-xs">
                  WA
                </div>
                <span>WhatsApp</span>
              </a>

              <a
                href={`mailto:?subject=${encodeURIComponent(video.title)}&body=${encodeURIComponent(shareUrl)}`}
                className="flex flex-col items-center gap-1 p-2 rounded-xl bg-amber-600/15 hover:bg-amber-600/25 text-amber-400 transition-colors text-[10px] font-medium"
              >
                <div className="w-8 h-8 rounded-full bg-amber-600 text-white flex items-center justify-center">
                  <Mail className="w-4 h-4" />
                </div>
                <span>Email</span>
              </a>
            </div>

            {/* Direct Link Input & Copy */}
            <div className="space-y-1.5">
              <label className="text-[11px] text-[#AAAAAA] font-medium">Đường dẫn video:</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  className="flex-1 bg-[#121212] text-xs text-slate-200 px-3 py-2.5 rounded-xl border border-white/10 focus:outline-none select-all"
                />
                <button
                  onClick={handleCopyLink}
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    copiedLink
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white text-black hover:bg-slate-200'
                  }`}
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Đã chép!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Sao chép</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Start at MM:SS Checkbox */}
            <div className="pt-2 border-t border-white/10 flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={startAtEnabled}
                  onChange={(e) => setStartAtEnabled(e.target.checked)}
                  className="w-4 h-4 rounded border-white/20 text-red-600 focus:ring-red-500 bg-[#181818] cursor-pointer accent-red-600"
                />
                <span className="flex items-center gap-1.5 font-medium">
                  <Clock className="w-3.5 h-3.5 text-[#AAAAAA]" />
                  <span>Bắt đầu tại:</span>
                </span>
              </label>

              <input
                type="text"
                disabled={!startAtEnabled}
                value={timestampStr}
                onChange={(e) => handleTimestampChange(e.target.value)}
                placeholder="00:30"
                className={`w-20 bg-[#121212] text-xs text-center font-mono py-1 px-2 rounded-lg border border-white/10 focus:outline-none focus:border-red-500 ${
                  !startAtEnabled ? 'opacity-40 cursor-not-allowed' : 'text-white'
                }`}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[11px] text-[#AAAAAA] font-medium">Mã nhúng iframe HTML:</label>
              <textarea
                readOnly
                rows={4}
                value={embedCode}
                className="w-full bg-[#121212] text-xs text-slate-300 font-mono p-3 rounded-xl border border-white/10 focus:outline-none select-all"
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#AAAAAA]">Nhúng video vào trang web hoặc blog của bạn</span>
              <button
                onClick={handleCopyEmbed}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  copiedEmbed
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white text-black hover:bg-slate-200'
                }`}
              >
                {copiedEmbed ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Đã chép!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Sao chép mã</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
