import React, { useState } from 'react';
import { YouTubeVideo } from '../../types';
import { X, Copy, Check, Code, ExternalLink, Share2, MessageCircle, Send, Mail } from 'lucide-react';

interface YouTubeShareModalProps {
  video: YouTubeVideo;
  onClose: () => void;
  onShowToast: (msg: string) => void;
}

export const YouTubeShareModal: React.FC<YouTubeShareModalProps> = ({
  video,
  onClose,
  onShowToast,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedEmbed, setCopiedEmbed] = useState(false);
  const [activeTab, setActiveTab] = useState<'link' | 'embed'>('link');

  const shareUrl = `https://youtube.com/watch?v=${video.id}`;
  const embedCode = `<iframe width="560" height="315" src="https://www.youtube-nocookie.com/embed/${video.id}" title="${video.title}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    onShowToast('Đã sao chép liên kết video!');
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleCopyEmbed = () => {
    navigator.clipboard.writeText(embedCode);
    setCopiedEmbed(true);
    onShowToast('Đã sao chép mã nhúng HTML!');
    setTimeout(() => setCopiedEmbed(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-[#272727] border border-white/10 rounded-2xl p-5 max-w-md w-full shadow-2xl space-y-4 text-white">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Share2 className="w-5 h-5 text-red-500" />
            <span>Chia sẻ video này</span>
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
            Liên kết trực tiếp
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
          />
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="text-xs font-bold text-white line-clamp-1">{video.title}</p>
            <p className="text-[11px] text-[#AAAAAA] truncate">{video.channelTitle}</p>
          </div>
        </div>

        {activeTab === 'link' ? (
          <div className="space-y-4">
            {/* Social Share Buttons */}
            <div className="grid grid-cols-4 gap-2 text-center">
              <a
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`}
                target="_blank"
                rel="noreferrer"
                className="flex flex-col items-center gap-1.5 p-2 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 transition-colors text-xs font-semibold cursor-pointer"
              >
                <div className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-lg">
                  f
                </div>
                <span>Facebook</span>
              </a>

              <a
                href={`https://zalo.me/share?url=${encodeURIComponent(shareUrl)}`}
                target="_blank"
                rel="noreferrer"
                className="flex flex-col items-center gap-1.5 p-2 rounded-xl bg-sky-600/20 hover:bg-sky-600/30 text-sky-400 transition-colors text-xs font-semibold cursor-pointer"
              >
                <div className="w-9 h-9 rounded-full bg-sky-500 text-white flex items-center justify-center font-bold text-xs">
                  Zalo
                </div>
                <span>Zalo</span>
              </a>

              <a
                href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(video.title)}`}
                target="_blank"
                rel="noreferrer"
                className="flex flex-col items-center gap-1.5 p-2 rounded-xl bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-400 transition-colors text-xs font-semibold cursor-pointer"
              >
                <div className="w-9 h-9 rounded-full bg-cyan-500 text-white flex items-center justify-center font-bold">
                  𝕏
                </div>
                <span>Twitter / X</span>
              </a>

              <a
                href={`mailto:?subject=${encodeURIComponent(video.title)}&body=${encodeURIComponent(shareUrl)}`}
                className="flex flex-col items-center gap-1.5 p-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 transition-colors text-xs font-semibold cursor-pointer"
              >
                <div className="w-9 h-9 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold">
                  <Mail className="w-4 h-4" />
                </div>
                <span>Email</span>
              </a>
            </div>

            {/* Direct Link Input & Copy */}
            <div className="space-y-1">
              <label className="text-[11px] text-[#AAAAAA] font-medium">Đường dẫn video:</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  className="flex-1 bg-[#121212] text-xs text-slate-200 px-3 py-2 rounded-xl border border-white/10 focus:outline-none"
                />
                <button
                  onClick={handleCopyLink}
                  className="bg-red-600 hover:bg-red-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedLink ? 'Đã chép' : 'Sao chép'}</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-[11px] text-[#AAAAAA] font-medium flex items-center gap-1">
                <Code className="w-3.5 h-3.5 text-red-500" />
                <span>Mã nhúng iFrame HTML:</span>
              </label>
              <textarea
                readOnly
                rows={4}
                value={embedCode}
                className="w-full bg-[#121212] text-xs text-slate-300 font-mono p-3 rounded-xl border border-white/10 focus:outline-none resize-none leading-relaxed"
              />
            </div>
            <button
              onClick={handleCopyEmbed}
              className="w-full bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-red-600/30"
            >
              {copiedEmbed ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copiedEmbed ? 'Đã sao chép mã nhúng' : 'Sao chép mã nhúng HTML'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
