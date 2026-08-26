import React, { useState, useEffect } from 'react';
import { YouTubeVideo, YouTubeUserPlaylist, UserProfile, Account } from '../../types';
import {
  X,
  Plus,
  Bookmark,
  Clock,
  Lock,
  Globe,
  Link2,
  Check,
  FolderPlus,
  Loader2,
} from 'lucide-react';

interface YouTubeSavePlaylistModalProps {
  video: YouTubeVideo;
  activeProfile?: UserProfile | null;
  currentAccount?: Account | null;
  onClose: () => void;
  onShowToast: (msg: string) => void;
}

const getPlaylistsKey = (profileId?: string | null) =>
  `gau_yt_playlists_${profileId || 'default'}`;

const getWatchLaterKey = (profileId?: string | null) =>
  `gau_yt_watch_later_${profileId || 'default'}`;

export const YouTubeSavePlaylistModal: React.FC<YouTubeSavePlaylistModalProps> = ({
  video,
  activeProfile,
  currentAccount,
  onClose,
  onShowToast,
}) => {
  const profileId = activeProfile?.id;
  const [playlists, setPlaylists] = useState<YouTubeUserPlaylist[]>([]);
  const [watchLaterSaved, setWatchLaterSaved] = useState(false);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPrivacy, setNewPrivacy] = useState<'public' | 'unlisted' | 'private'>('private');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load playlists & watch later status
  useEffect(() => {
    try {
      const savedPl = localStorage.getItem(getPlaylistsKey(profileId));
      if (savedPl) {
        setPlaylists(JSON.parse(savedPl));
      } else {
        const defaultPls: YouTubeUserPlaylist[] = [
          {
            id: 'pl_fav',
            title: 'Video yêu thích',
            privacy: 'private',
            videoIds: [],
            createdAt: Date.now(),
          },
          {
            id: 'pl_music',
            title: 'Nhạc tuyển chọn',
            privacy: 'public',
            videoIds: [],
            createdAt: Date.now() - 86400000,
          },
        ];
        setPlaylists(defaultPls);
        localStorage.setItem(getPlaylistsKey(profileId), JSON.stringify(defaultPls));
      }

      const wlList: string[] = JSON.parse(
        localStorage.getItem(getWatchLaterKey(profileId)) || '[]'
      );
      setWatchLaterSaved(wlList.includes(video.id));
    } catch {
      setPlaylists([]);
    }
  }, [profileId, video.id]);

  const toggleWatchLater = () => {
    try {
      const wlList: string[] = JSON.parse(
        localStorage.getItem(getWatchLaterKey(profileId)) || '[]'
      );
      const exists = wlList.includes(video.id);
      let updated: string[];
      if (exists) {
        updated = wlList.filter((id) => id !== video.id);
        setWatchLaterSaved(false);
        onShowToast('Đã xóa khỏi danh sách Xem sau');
      } else {
        updated = [video.id, ...wlList];
        setWatchLaterSaved(true);
        onShowToast('Đã lưu vào danh sách Xem sau');
      }
      localStorage.setItem(getWatchLaterKey(profileId), JSON.stringify(updated));
    } catch {
      // Ignore
    }
  };

  const togglePlaylist = (playlist: YouTubeUserPlaylist) => {
    try {
      const hasVideo = playlist.videoIds.includes(video.id);
      const updatedVideoIds = hasVideo
        ? playlist.videoIds.filter((id) => id !== video.id)
        : [...playlist.videoIds, video.id];

      const updatedPlaylists = playlists.map((pl) =>
        pl.id === playlist.id
          ? { ...pl, videoIds: updatedVideoIds, updatedAt: Date.now() }
          : pl
      );

      setPlaylists(updatedPlaylists);
      localStorage.setItem(getPlaylistsKey(profileId), JSON.stringify(updatedPlaylists));

      if (hasVideo) {
        onShowToast(`Đã xóa khỏi "${playlist.title}"`);
      } else {
        onShowToast(`Đã lưu vào "${playlist.title}"`);
      }
    } catch {
      // Ignore
    }
  };

  const handleCreatePlaylist = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    setIsSubmitting(true);
    const newPl: YouTubeUserPlaylist = {
      id: `pl_${Date.now()}`,
      title: newTitle.trim(),
      privacy: newPrivacy,
      videoIds: [video.id], // auto-add current video
      createdAt: Date.now(),
    };

    const updated = [newPl, ...playlists];
    setPlaylists(updated);
    try {
      localStorage.setItem(getPlaylistsKey(profileId), JSON.stringify(updated));
    } catch {}

    setIsSubmitting(false);
    setIsCreatingNew(false);
    setNewTitle('');
    onShowToast(`Đã tạo "${newPl.title}" và lưu video!`);
  };

  return (
    <div className="fixed inset-0 z-[130] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-[#212121] border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden text-white">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Bookmark className="w-4 h-4 text-red-500" />
            <span>Lưu video vào...</span>
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Video preview mini bar */}
        <div className="px-5 py-2.5 bg-[#181818] flex items-center gap-3 border-b border-white/5">
          <img
            src={video.thumbnailUrl}
            alt={video.title}
            className="w-12 aspect-video rounded object-cover shrink-0"
            referrerPolicy="no-referrer"
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-white truncate">{video.title}</p>
            <p className="text-[11px] text-[#AAAAAA] truncate">{video.channelTitle}</p>
          </div>
        </div>

        {/* Playlists List with Checkboxes */}
        <div className="max-h-60 overflow-y-auto px-2 py-2 space-y-0.5">
          {/* Default Watch Later */}
          <label className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors cursor-pointer select-none">
            <input
              type="checkbox"
              checked={watchLaterSaved}
              onChange={toggleWatchLater}
              className="w-4 h-4 rounded border-[#717171] text-red-600 focus:ring-red-500 bg-[#181818] cursor-pointer accent-red-600"
            />
            <div className="flex items-center justify-between flex-1 min-w-0">
              <span className="text-sm font-medium text-white flex items-center gap-2 truncate">
                <Clock className="w-4 h-4 text-[#AAAAAA] shrink-0" />
                <span>Xem sau</span>
              </span>
              <Lock className="w-3.5 h-3.5 text-[#717171] shrink-0" />
            </div>
          </label>

          {/* User Custom Playlists */}
          {playlists.map((pl) => {
            const isChecked = pl.videoIds.includes(video.id);
            return (
              <label
                key={pl.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors cursor-pointer select-none"
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => togglePlaylist(pl)}
                  className="w-4 h-4 rounded border-[#717171] text-red-600 focus:ring-red-500 bg-[#181818] cursor-pointer accent-red-600"
                />
                <div className="flex items-center justify-between flex-1 min-w-0">
                  <span className="text-sm font-medium text-white truncate">
                    {pl.title}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0 text-[#717171]">
                    {pl.privacy === 'public' ? (
                      <Globe className="w-3.5 h-3.5" />
                    ) : pl.privacy === 'unlisted' ? (
                      <Link2 className="w-3.5 h-3.5" />
                    ) : (
                      <Lock className="w-3.5 h-3.5" />
                    )}
                  </div>
                </div>
              </label>
            );
          })}
        </div>

        {/* Footer / Create new playlist section */}
        <div className="p-4 border-t border-white/10 bg-[#181818]">
          {!isCreatingNew ? (
            <button
              onClick={() => setIsCreatingNew(true)}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-full text-xs font-semibold text-white hover:bg-white/10 transition-colors cursor-pointer border border-white/10"
            >
              <Plus className="w-4 h-4 text-red-500" />
              <span>Tạo danh sách phát mới</span>
            </button>
          ) : (
            <form onSubmit={handleCreatePlaylist} className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-[#AAAAAA] mb-1">
                  Tên danh sách phát
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Nhập tiêu đề..."
                  autoFocus
                  required
                  className="w-full bg-[#272727] text-white text-xs px-3 py-2 rounded-lg border border-white/15 focus:outline-none focus:border-red-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[#AAAAAA] mb-1">
                  Quyền riêng tư
                </label>
                <select
                  value={newPrivacy}
                  onChange={(e) => setNewPrivacy(e.target.value as any)}
                  className="w-full bg-[#272727] text-white text-xs px-3 py-2 rounded-lg border border-white/15 focus:outline-none focus:border-red-500 cursor-pointer"
                >
                  <option value="private">Riêng tư (Chỉ bạn có thể xem)</option>
                  <option value="unlisted">Không công khai (Bất kỳ ai có liên kết)</option>
                  <option value="public">Công khai (Mọi người đều có thể tìm)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsCreatingNew(false)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium text-[#AAAAAA] hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={!newTitle.trim() || isSubmitting}
                  className="px-4 py-1.5 rounded-full text-xs font-bold bg-white text-black hover:bg-slate-200 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Tạo mới'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
