import React from 'react';
import { UserProfile, WatchHistoryItem } from '../types';
import { Clock, Play, Trash2, RotateCcw, AlertTriangle } from 'lucide-react';
import { getImageUrl } from '../services/movieApi';

interface HistoryViewProps {
  history: WatchHistoryItem[];
  activeProfile?: UserProfile | null;
  profileName?: string;
  onResume?: (item: WatchHistoryItem) => void;
  onResumeItem?: (item: WatchHistoryItem) => void;
  onRemoveItem: (movieSlug: string) => void;
  onClearAll?: () => void;
  onExploreMovies?: () => void;
  onExploreClick?: () => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  history,
  activeProfile,
  profileName,
  onResume,
  onResumeItem,
  onRemoveItem,
  onClearAll,
  onExploreMovies,
  onExploreClick,
}) => {
  const displayProfileName = profileName || activeProfile?.name || 'Bạn';
  const handleResume = onResume || onResumeItem || (() => {});
  const handleExplore = onExploreMovies || onExploreClick || (() => {});

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
      return `${hrs}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div id="watch-history-page" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-blue-900/40">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white flex items-center gap-2.5">
            <Clock className="w-6 h-6 text-sky-400" />
            <span>Lịch Sử Xem Phim</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Hồ sơ: <span className="text-white font-semibold">{displayProfileName}</span> • Tự động lưu tiến độ xem
          </p>
        </div>

        {history.length > 0 && onClearAll && (
          <button
            onClick={onClearAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-semibold transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Xóa tất cả</span>
          </button>
        )}
      </div>

      {history.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 sm:gap-7 lg:gap-8">
          {history.map((item) => (
            <div
              key={item.movieSlug}
              id={`history-card-${item.movieSlug}`}
              className="group bg-[#0f172a] rounded-2xl overflow-hidden border border-blue-900/50 hover:border-blue-500/80 transition-all hover:scale-[1.02] shadow-lg flex flex-col"
            >
              {/* Thumbnail with Progress Bar */}
              <div
                className="relative aspect-video w-full overflow-hidden bg-black cursor-pointer"
                onClick={() => handleResume(item)}
              >
                <img
                  src={getImageUrl(item.movieThumb || item.moviePoster)}
                  alt={item.movieName}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src =
                      'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=600&auto=format&fit=crop&q=80';
                  }}
                />

                {/* Overlay Play Icon */}
                <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-xl shadow-blue-600/40">
                    <Play className="w-6 h-6 fill-white ml-0.5" />
                  </div>
                </div>

                {/* Progress Bar at bottom of thumbnail */}
                <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-slate-800">
                  <div
                    className="h-full bg-gradient-to-r from-blue-600 to-cyan-400"
                    style={{ width: `${Math.min(100, Math.max(2, item.progressPercent || 0))}%` }}
                  />
                </div>
              </div>

              {/* Info Details */}
              <div className="p-4 flex flex-col justify-between flex-1 bg-[#0b1329]">
                <div>
                  <h3 className="text-sm font-bold text-white line-clamp-1 group-hover:text-sky-300">
                    {item.movieName}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-slate-300 mt-1">
                    <span className="font-semibold text-sky-400">
                      {item.episodeName.startsWith('Tập') ? item.episodeName : `Tập ${item.episodeName}`}
                    </span>
                    <span>•</span>
                    <span className="text-slate-400">{item.serverName}</span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2 font-mono">
                    <span>
                      Đã xem: {formatTime(item.currentTime)} / {formatTime(item.duration)}
                    </span>
                    <span className="text-cyan-400 font-semibold">{Math.round(item.progressPercent || 0)}%</span>
                  </div>
                </div>

                {/* Action Row */}
                <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-800">
                  <button
                    onClick={() => handleResume(item)}
                    className="flex items-center gap-1.5 text-xs font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 px-3.5 py-1.5 rounded-xl transition-all cursor-pointer shadow-lg shadow-blue-600/30"
                  >
                    <Play className="w-3.5 h-3.5 fill-white" />
                    <span>Tiếp tục xem</span>
                  </button>

                  <button
                    onClick={() => onRemoveItem(item.movieSlug)}
                    className="text-slate-500 hover:text-red-400 p-1.5 transition-colors cursor-pointer"
                    title="Xóa khỏi lịch sử"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-24 text-center bg-[#0f172a]/60 rounded-2xl border border-blue-900/40 p-8 max-w-lg mx-auto">
          <Clock className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-white mb-1">Chưa có lịch sử xem phim</h2>
          <p className="text-xs text-slate-400 mb-6">
            Khi bạn xem bất kỳ bộ phim nào trên QTB, hệ thống sẽ tự động ghi nhớ vị trí và tập đang xem để bạn
            tiếp tục thưởng thức sau này.
          </p>
          <button
            onClick={handleExplore}
            className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-xl shadow-blue-600/30 cursor-pointer"
          >
            Bắt đầu xem phim
          </button>
        </div>
      )}
    </div>
  );
};
