import React, { useState, useEffect } from 'react';
import { UserStats, UserActivityItem } from '../../types';
import { watchHistoryService } from '../../services/watchHistoryService';
import { formatDurationText, formatDateTimeExact, formatRelativeTime, getEffectiveTotalOnline, getEffectiveTotalWatch } from '../../services/userAnalyticsService';
import {
  X,
  User,
  Clock,
  Film,
  BookOpen,
  Tv,
  Youtube,
  Sparkles,
  Calendar,
  Layers,
  Activity,
  CheckCircle2,
  Trash2,
  Search,
  RefreshCw,
} from 'lucide-react';

interface AdminUserDetailModalProps {
  userStat: UserStats;
  onClose: () => void;
  onShowToast?: (msg: string) => void;
}

export const AdminUserDetailModal: React.FC<AdminUserDetailModalProps> = ({
  userStat,
  onClose,
  onShowToast,
}) => {
  const [activities, setActivities] = useState<UserActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterType, setFilterType] = useState<'all' | 'movie' | 'manga' | 'livetv' | 'youtube'>('all');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const fetchUserActivities = async () => {
    setIsLoading(true);
    try {
      const items = await watchHistoryService.getUserHistory(userStat.accountId, 100);
      setActivities(items);
    } catch (e) {
      console.warn('Failed to load user activities:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUserActivities();
  }, [userStat.accountId, filterType, searchKeyword]);

  const handleDeleteActivity = async (item: UserActivityItem) => {
    if (!window.confirm(`Xóa lịch sử "${item.title}" của người dùng này?`)) return;
    setIsDeleting(item.id);
    try {
      await watchHistoryService.deleteRecord(item.id);
      onShowToast?.(`Đã xóa mục lịch sử "${item.title}"`);
      setActivities((prev) => prev.filter((a) => a.id !== item.id));
    } catch (e: any) {
      onShowToast?.(`Lỗi khi xóa: ${e?.message || 'Thất bại'}`);
    } finally {
      setIsDeleting(null);
    }
  };

  const movieSec = userStat.watchSecondsByMedia?.movie || 0;
  const mangaSec = userStat.watchSecondsByMedia?.manga || 0;
  const tvSec = userStat.watchSecondsByMedia?.livetv || 0;
  const ytSec = userStat.watchSecondsByMedia?.youtube || 0;
  const totalWatchSec = getEffectiveTotalWatch(userStat) || (movieSec + mangaSec + tvSec + ytSec) || 0;

  const moviePct = totalWatchSec > 0 ? Math.round((movieSec / totalWatchSec) * 100) : 0;
  const mangaPct = totalWatchSec > 0 ? Math.round((mangaSec / totalWatchSec) * 100) : 0;
  const tvPct = totalWatchSec > 0 ? Math.round((tvSec / totalWatchSec) * 100) : 0;
  const ytPct = totalWatchSec > 0 ? Math.round((ytSec / totalWatchSec) * 100) : 0;

  return (
    <div
      id="admin-user-detail-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md overflow-y-auto animate-fade-in"
    >
      <div className="bg-[#0b1329] border border-blue-900/60 rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 sm:p-6 border-b border-slate-800 bg-[#070b16]/70">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="relative">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 border border-blue-400/40 flex items-center justify-center text-white font-bold text-lg shadow-lg">
                {(userStat.accountDisplayName || userStat.accountId || 'U').substring(0, 1).toUpperCase()}
              </div>
              {userStat.isOnline && (
                <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 border-2 border-[#0b1329]"></span>
                </span>
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-lg sm:text-xl font-bold text-white truncate">
                  {userStat.accountDisplayName || userStat.accountId}
                </h3>
                {userStat.isOnline ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700/60 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Online
                  </span>
                ) : (
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                    Offline
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 font-mono">ID: @{userStat.accountId}</p>
            </div>
          </div>

          <button
            id="close-user-detail-btn"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer border border-slate-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1">
          {/* Key Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            {/* Total Online Duration */}
            <div className="bg-[#0f172a] border border-blue-900/40 rounded-2xl p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Tổng Thời Gian Online</span>
                <Clock className="w-4 h-4 text-sky-400" />
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-black text-sky-400">
                  {formatDurationText(getEffectiveTotalOnline(userStat))}
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Đăng nhập: {userStat.totalSessions || 1} phiên hoạt động
                </p>
              </div>
            </div>

            {/* Total Watch Duration */}
            <div className="bg-[#0f172a] border border-blue-900/40 rounded-2xl p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Tổng Thời Lượng Đã Xem</span>
                <Film className="w-4 h-4 text-indigo-400" />
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-black text-indigo-300">
                  {formatDurationText(totalWatchSec)}
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Hiệu suất xem: {getEffectiveTotalOnline(userStat) > 0 ? Math.round((totalWatchSec / getEffectiveTotalOnline(userStat)) * 100) : 100}% thời gian
                </p>
              </div>
            </div>

            {/* Last Active Timestamp */}
            <div className="bg-[#0f172a] border border-blue-900/40 rounded-2xl p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Hoạt Động Gần Nhất</span>
                <Activity className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-200">
                  {formatRelativeTime(userStat.lastActiveAt)}
                </p>
                <p className="text-[11px] text-slate-400 mt-1 font-mono">
                  {formatDateTimeExact(userStat.lastActiveAt)}
                </p>
              </div>
            </div>
          </div>

          {/* Breakdown By Media Type */}
          <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-400" />
              <span>Phân Bổ Thời Lượng Xem Theo Thể Loại</span>
            </h4>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* Phim */}
              <div className="bg-[#070b16] border border-sky-900/40 rounded-xl p-3">
                <div className="flex items-center justify-between text-sky-400 text-xs font-bold">
                  <span className="flex items-center gap-1.5">
                    <Film className="w-3.5 h-3.5" /> Phim
                  </span>
                  <span>{moviePct}%</span>
                </div>
                <p className="text-sm font-bold text-white mt-1.5">{formatDurationText(movieSec)}</p>
                <div className="w-full bg-slate-800 rounded-full h-1 mt-2">
                  <div className="bg-sky-400 h-1 rounded-full" style={{ width: `${moviePct}%` }} />
                </div>
              </div>

              {/* Manga */}
              <div className="bg-[#070b16] border border-emerald-900/40 rounded-xl p-3">
                <div className="flex items-center justify-between text-emerald-400 text-xs font-bold">
                  <span className="flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5" /> Truyện Tranh
                  </span>
                  <span>{mangaPct}%</span>
                </div>
                <p className="text-sm font-bold text-white mt-1.5">{formatDurationText(mangaSec)}</p>
                <div className="w-full bg-slate-800 rounded-full h-1 mt-2">
                  <div className="bg-emerald-400 h-1 rounded-full" style={{ width: `${mangaPct}%` }} />
                </div>
              </div>

              {/* LiveTV */}
              <div className="bg-[#070b16] border border-amber-900/40 rounded-xl p-3">
                <div className="flex items-center justify-between text-amber-400 text-xs font-bold">
                  <span className="flex items-center gap-1.5">
                    <Tv className="w-3.5 h-3.5" /> Truyền Hình
                  </span>
                  <span>{tvPct}%</span>
                </div>
                <p className="text-sm font-bold text-white mt-1.5">{formatDurationText(tvSec)}</p>
                <div className="w-full bg-slate-800 rounded-full h-1 mt-2">
                  <div className="bg-amber-400 h-1 rounded-full" style={{ width: `${tvPct}%` }} />
                </div>
              </div>

              {/* YouTube */}
              <div className="bg-[#070b16] border border-red-900/40 rounded-xl p-3">
                <div className="flex items-center justify-between text-red-400 text-xs font-bold">
                  <span className="flex items-center gap-1.5">
                    <Youtube className="w-3.5 h-3.5" /> YouTube
                  </span>
                  <span>{ytPct}%</span>
                </div>
                <p className="text-sm font-bold text-white mt-1.5">{formatDurationText(ytSec)}</p>
                <div className="w-full bg-slate-800 rounded-full h-1 mt-2">
                  <div className="bg-red-500 h-1 rounded-full" style={{ width: `${ytPct}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* User Watch History Detail List */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>Danh Sách Nội Dung Đã Xem / Đọc</span>
                  <span className="text-xs bg-blue-950 text-sky-400 border border-blue-800 px-2 py-0.5 rounded-full font-mono">
                    {activities.length} mục
                  </span>
                </h4>
                <p className="text-xs text-slate-400">Toàn bộ lịch sử chi tiết được ghi nhận theo thời gian thực</p>
              </div>

              {/* Search & Filters */}
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-48">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    placeholder="Tìm tên nội dung..."
                    className="w-full pl-8 pr-3 py-1.5 bg-[#0f172a] border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="flex items-center p-1 bg-[#0f172a] rounded-xl border border-slate-800 text-xs">
                  <button
                    onClick={() => setFilterType('all')}
                    className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                      filterType === 'all' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Tất cả
                  </button>
                  <button
                    onClick={() => setFilterType('movie')}
                    className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                      filterType === 'movie' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Phim
                  </button>
                  <button
                    onClick={() => setFilterType('manga')}
                    className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                      filterType === 'manga' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Truyện
                  </button>
                  <button
                    onClick={() => setFilterType('youtube')}
                    className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                      filterType === 'youtube' ? 'bg-red-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    YT
                  </button>
                </div>
              </div>
            </div>

            {/* List Table / Cards */}
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-3">
                <RefreshCw className="w-6 h-6 text-sky-400 animate-spin" />
                <p className="text-xs text-slate-400">Đang tải lịch sử chi tiết...</p>
              </div>
            ) : activities.length === 0 ? (
              <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-8 text-center space-y-2">
                <p className="text-sm font-semibold text-slate-300">Chưa có lịch sử xem nào phù hợp bộ lọc</p>
                <p className="text-xs text-slate-500">Người dùng này chưa có lượt xem trong danh mục đã chọn.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {activities.map((item) => {
                  const isMovie = item.mediaType === 'movie';
                  const isManga = item.mediaType === 'manga';
                  const isTv = item.mediaType === 'livetv';
                  const isYt = item.mediaType === 'youtube';

                  return (
                    <div
                      key={item.id}
                      className="bg-[#0f172a] border border-slate-800/80 hover:border-slate-700 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all"
                    >
                      <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                        {item.coverUrl ? (
                          <img
                            src={item.coverUrl}
                            alt={item.title}
                            className="w-12 h-16 sm:w-14 sm:h-16 object-cover rounded-xl border border-slate-800 shrink-0"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-12 h-16 rounded-xl bg-slate-800 flex items-center justify-center text-slate-500 shrink-0">
                            <Sparkles className="w-5 h-5" />
                          </div>
                        )}

                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h5 className="text-xs sm:text-sm font-bold text-white line-clamp-1">
                              {item.title}
                            </h5>
                            {isMovie && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-950 text-sky-300 border border-sky-800">
                                Phim
                              </span>
                            )}
                            {isManga && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800">
                                Manga
                              </span>
                            )}
                            {isTv && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800">
                                LiveTV
                              </span>
                            )}
                            {isYt && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-950 text-red-300 border border-red-800">
                                YouTube
                              </span>
                            )}
                            {item.completed && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Đã xem xong
                              </span>
                            )}
                          </div>

                          {item.subtitle && (
                            <p className="text-[11px] text-sky-400 font-medium line-clamp-1">
                              {item.subtitle}
                            </p>
                          )}

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400">
                            {item.watchedDurationSeconds ? (
                              <span>Thời lượng xem: <strong className="text-slate-200">{formatDurationText(item.watchedDurationSeconds)}</strong></span>
                            ) : null}
                            {item.progressPercent !== undefined ? (
                              <span>Tiến độ: <strong className="text-sky-300">{item.progressPercent}%</strong></span>
                            ) : null}
                            {item.apiSource && (
                              <span className="font-mono text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">
                                {item.apiSource.toUpperCase()}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right side: Timestamp & Action */}
                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800 text-right">
                        <div className="text-left sm:text-right">
                          <p className="text-xs font-semibold text-slate-300">
                            {formatRelativeTime(item.lastWatchedAt)}
                          </p>
                          <p className="text-[10px] text-slate-500 font-mono">
                            {formatDateTimeExact(item.lastWatchedAt)}
                          </p>
                        </div>

                        <button
                          onClick={() => handleDeleteActivity(item)}
                          disabled={isDeleting === item.id}
                          className="p-2 rounded-xl bg-slate-800/80 hover:bg-red-950 text-slate-400 hover:text-red-400 border border-slate-700 hover:border-red-800/60 transition cursor-pointer"
                          title="Xóa mục lịch sử này"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-[#070b16]/70 flex items-center justify-between">
          <p className="text-xs text-slate-400">
            Dữ liệu được lưu trữ chuẩn xác trong Firestore <span className="text-sky-400 font-mono">userActivityHistory</span>
          </p>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition cursor-pointer shadow-lg shadow-blue-600/30"
          >
            Đóng Chi Tiết
          </button>
        </div>
      </div>
    </div>
  );
};
