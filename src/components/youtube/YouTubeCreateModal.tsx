import React, { useState } from 'react';
import { X, Video, Link, Plus } from 'lucide-react';
import { extractYouTubeId } from '../../services/youtubeApi';
import { YouTubeVideo } from '../../types';

interface YouTubeCreateModalProps {
  isOpen?: boolean;
  onClose: () => void;
  onAddCustomVideo?: (video: YouTubeVideo) => void;
  onVideoCreated?: (video: YouTubeVideo) => void;
  onShowToast?: (msg: string) => void;
}

export const YouTubeCreateModal: React.FC<YouTubeCreateModalProps> = ({
  isOpen = true,
  onClose,
  onAddCustomVideo,
  onVideoCreated,
  onShowToast,
}) => {
  const [videoUrl, setVideoUrl] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [customChannel, setCustomChannel] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const extractedId = extractYouTubeId(videoUrl);
    if (!extractedId) {
      setErrorMsg('Đường dẫn YouTube hoặc Video ID không hợp lệ!');
      return;
    }

    const newVideo: YouTubeVideo = {
      id: extractedId,
      title: customTitle.trim() || `Video YouTube (${extractedId})`,
      channelTitle: customChannel.trim() || 'Kênh của bạn',
      publishedAt: 'Mới đăng',
      duration: '10:00',
      viewCount: '1 lượt xem',
      thumbnailUrl: `https://i.ytimg.com/vi/${extractedId}/hqdefault.jpg`,
      description: 'Video thêm thủ công từ liên kết YouTube.',
      category: 'trending',
    };

    if (onAddCustomVideo) onAddCustomVideo(newVideo);
    if (onVideoCreated) onVideoCreated(newVideo);
    onShowToast?.('Đã thêm video thành công!');

    setVideoUrl('');
    setCustomTitle('');
    setCustomChannel('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-[#272727] border border-white/10 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5 text-white relative">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Video className="w-5 h-5 text-red-500" />
            <span>Tải lên / Thêm Video YouTube</span>
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="space-y-1">
            <label className="text-[#AAAAAA] font-semibold flex items-center gap-1">
              <Link className="w-3.5 h-3.5 text-red-500" />
              <span>Link video hoặc ID YouTube (*):</span>
            </label>
            <input
              type="text"
              required
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=... hoặc Shorts link"
              className="w-full bg-[#121212] text-white px-3.5 py-2.5 rounded-xl border border-white/10 focus:border-red-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[#AAAAAA] font-semibold">Tiêu đề video (tùy chọn):</label>
            <input
              type="text"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder="Tên video hiển thị..."
              className="w-full bg-[#121212] text-white px-3.5 py-2.5 rounded-xl border border-white/10 focus:border-red-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[#AAAAAA] font-semibold">Tên kênh (tùy chọn):</label>
            <input
              type="text"
              value={customChannel}
              onChange={(e) => setCustomChannel(e.target.value)}
              placeholder="Tên kênh đăng video..."
              className="w-full bg-[#121212] text-white px-3.5 py-2.5 rounded-xl border border-white/10 focus:border-red-500 focus:outline-none"
            />
          </div>

          {errorMsg && <p className="text-red-400 text-xs font-semibold">{errorMsg}</p>}

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-[#3F3F3F] hover:bg-slate-700 text-slate-200 py-2.5 rounded-xl font-bold cursor-pointer transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-xl font-bold cursor-pointer transition-all shadow-lg shadow-red-600/30 flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm video ngay</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
