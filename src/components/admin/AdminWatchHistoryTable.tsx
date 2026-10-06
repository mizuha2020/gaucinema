import React, { useState, useEffect, useMemo } from 'react';
import { UserActivityItem, UserStats, MediaActivityType } from '../../types';
import { watchHistoryService } from '../../services/watchHistoryService';
import { formatDurationText, formatDateTimeExact, formatRelativeTime } from '../../services/userAnalyticsService';
import {
  Film,
  BookOpen,
  Youtube,
  Search,
  Filter,
  Download,
  Trash2,
  Sparkles,
  Calendar,
  Clock,
  User,
  Layers,
  RefreshCw,
  CheckCircle2,
  ChevronDown,
  ArrowUpDown,
  ExternalLink,
} from 'lucide-react';

interface AdminWatchHistoryTableProps {
  userStats: UserStats[];
  onOpenUserDetail: (stat: UserStats) => void;
  onShowToast?: (msg: string) => void;
}

export const AdminWatchHistoryTable: React.FC<AdminWatchHistoryTableProps> = ({
  userStats,
  onOpenUserDetail,
  onShowToast,
}) => {
  const [historyItems, setHistoryItems] = useState<UserActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMediaType, setSelectedMediaType] = useState<MediaActivityType | 'all'>('all');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('all');
  const [selectedTimeRange, setSelectedTimeRange] = useState<'all' | 'today' | '7days' | '30days'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'duration' | 'progress'>('newest');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const loadHistory = async () => {
    setIsLoading(true);
    try {
      const result = await watchHistoryService.getHistoryPaginated({ pageSize: 100 });
      setHistoryItems(result.items);
    } catch (e) {
      void 0;
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  // Filter & Sort
  const filteredItems = useMemo(() => {
    const now = Date.now();
    return historyItems.filter((item) => {
      // 1. Media Type
      if (selectedMediaType !== 'all' && item.mediaType !== selectedMediaType) return false;

      // 2. Account
      if (selectedAccountId !== 'all' && item.accountId !== selectedAccountId) return false;

      // 3. Time Range
      if (selectedTimeRange === 'today') {
        const startOfDay = new Date().setHours(0, 0, 0, 0);
        if (item.lastWatchedAt < startOfDay) return false;
      } else if (selectedTimeRange === '7days') {
        if (now - item.lastWatchedAt > 7 * 24 * 3600 * 1000) return false;
      } else if (selectedTimeRange === '30days') {
        if (now - item.lastWatchedAt > 30 * 24 * 3600 * 1000) return false;
      }

      // 4. Search text
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTitle = item.title.toLowerCase().includes(q);
        const matchUser = (item.accountDisplayName || item.accountId).toLowerCase().includes(q);
        const matchSubtitle = (item.subtitle || '').toLowerCase().includes(q);
        const matchSource = (item.apiSource || '').toLowerCase().includes(q);
        if (!matchTitle && !matchUser && !matchSubtitle && !matchSource) return false;
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === 'newest') return (b.lastWatchedAt || 0) - (a.lastWatchedAt || 0);
      if (sortBy === 'duration') return (b.watchedDurationSeconds || 0) - (a.watchedDurationSeconds || 0);
      if (sortBy === 'progress') return (b.progressPercent || 0) - (a.progressPercent || 0);
      return 0;
    });
  }, [historyItems, selectedMediaType, selectedAccountId, selectedTimeRange, searchQuery, sortBy]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const paginatedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, page, pageSize]);

  // Aggregate stats of filtered results
  const totalFilteredDurationSec = useMemo(() => {
    return filteredItems.reduce((sum, item) => sum + (item.watchedDurationSeconds || 0), 0);
  }, [filteredItems]);

  const uniqueUsersCount = useMemo(() => {
    return new Set(filteredItems.map((i) => i.accountId)).size;
  }, [filteredItems]);

  // Delete single record
  const handleDeleteRecord = async (item: UserActivityItem) => {
    if (!window.confirm(`Xóa lịch sử "${item.title}" của ${item.accountDisplayName || item.accountId}?`)) return;
    try {
      await watchHistoryService.deleteRecord(item.id);
      onShowToast?.('Đã xóa bản ghi lịch sử');
      setHistoryItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch (e: any) {
      onShowToast?.(`Lỗi: ${e?.message || 'Không thể xóa'}`);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    try {
      const headers = ['ID', 'Tài Khoản', 'Tên Hiển Thị', 'Loại Nội Dung', 'Tên Nội Dung', 'Tập/Chương', 'Thời Lượng Xem (giây)', 'Tiến Độ (%)', 'Nguồn API', 'Thời Gian Xem'];
      const rows = filteredItems.map((item) => [
        `"${item.id}"`,
        `"${item.accountId}"`,
        `"${item.accountDisplayName || item.accountId}"`,
        `"${item.mediaType}"`,
        `"${item.title.replace(/"/g, '""')}"`,
        `"${(item.subtitle || '').replace(/"/g, '""')}"`,
        item.watchedDurationSeconds || 0,
        item.progressPercent || 0,
        `"${item.apiSource || ''}"`,
        `"${formatDateTimeExact(item.lastWatchedAt)}"`,
      ]);

      const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `lich_su_xem_gau_cinema_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      onShowToast?.('Đã xuất file CSV thành công!');
    } catch (e: any) {
      onShowToast?.(`Lỗi xuất file: ${e?.message || 'Thất bại'}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Stats Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#0f172a] border border-blue-900/40 rounded-2xl p-4 shadow-lg">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Tổng Lượt Xem Đã Ghi</p>
          <div className="flex items-baseline gap-2 mt-1">
            <h3 className="text-2xl font-black text-white">{filteredItems.length}</h3>
            <span className="text-xs text-slate-400">nội dung</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">Dựa trên bộ lọc hiện tại</p>
        </div>

        <div className="bg-[#0f172a] border border-blue-900/40 rounded-2xl p-4 shadow-lg">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Tổng Thời Lượng Đã Xem</p>
          <div className="flex items-baseline gap-2 mt-1">
            <h3 className="text-2xl font-black text-sky-400">{formatDurationText(totalFilteredDurationSec)}</h3>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">Thời gian xem tích lũy</p>
        </div>

        <div className="bg-[#0f172a] border border-blue-900/40 rounded-2xl p-4 shadow-lg">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Thành Viên Tương Tác</p>
          <div className="flex items-baseline gap-2 mt-1">
            <h3 className="text-2xl font-black text-emerald-400">{uniqueUsersCount}</h3>
            <span className="text-xs text-slate-400">người dùng</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">Có xem nội dung trong bộ lọc</p>
        </div>

        <div className="bg-[#0f172a] border border-blue-900/40 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Xuất Dữ Liệu Lịch Sử</p>
            <p className="text-xs text-slate-400 mt-1">Báo cáo chuẩn xác cho quản trị viên</p>
          </div>
          <button
            onClick={handleExportCSV}
            className="mt-3 flex items-center justify-center gap-2 py-2 px-3 bg-blue-600/90 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition shadow-md shadow-blue-600/20 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Tải Báo Cáo CSV</span>
          </button>
        </div>
      </div>

      {/* Filter & Controls Toolbar */}
      <div className="bg-[#0b1222] border border-blue-950/80 rounded-2xl p-4 sm:p-5 shadow-lg space-y-4">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Tìm kiếm theo tên phim, truyện, kênh TV, tên người dùng, nguồn API..."
              className="w-full pl-10 pr-4 py-2 bg-[#0f172a] border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
            />
          </div>

          {/* Quick Filter Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Account Selector */}
            <select
              value={selectedAccountId}
              onChange={(e) => {
                setSelectedAccountId(e.target.value);
                setPage(1);
              }}
              className="bg-[#0f172a] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="all">Tất cả tài khoản ({userStats.length})</option>
              {userStats.map((u) => (
                <option key={u.accountId} value={u.accountId}>
                  {u.accountDisplayName || u.accountId} {u.isOnline ? '🟢' : ''}
                </option>
              ))}
            </select>

            {/* Time Range Selector */}
            <select
              value={selectedTimeRange}
              onChange={(e) => {
                setSelectedTimeRange(e.target.value as any);
                setPage(1);
              }}
              className="bg-[#0f172a] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="all">Toàn bộ thời gian</option>
              <option value="today">Hôm nay</option>
              <option value="7days">7 ngày qua</option>
              <option value="30days">30 ngày qua</option>
            </select>

            {/* Sort Selector */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-[#0f172a] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="newest">Mới xem nhất</option>
              <option value="duration">Thời lượng xem nhiều nhất</option>
              <option value="progress">Tiến độ cao nhất</option>
            </select>

            <button
              onClick={loadHistory}
              className="p-2 bg-[#0f172a] hover:bg-slate-800 border border-slate-700 rounded-xl text-slate-400 hover:text-white transition cursor-pointer"
              title="Làm mới bảng lịch sử"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Media Type Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <button
            onClick={() => {
              setSelectedMediaType('all');
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
              selectedMediaType === 'all'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'bg-[#0f172a] text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            Tất Cả Thể Loại
          </button>
          <button
            onClick={() => {
              setSelectedMediaType('movie');
              setPage(1);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
              selectedMediaType === 'movie'
                ? 'bg-sky-600 text-white shadow-md shadow-sky-600/30'
                : 'bg-[#0f172a] text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            <span>Phim</span>
          </button>
          <button
            onClick={() => {
              setSelectedMediaType('manga');
              setPage(1);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
              selectedMediaType === 'manga'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                : 'bg-[#0f172a] text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Manga</span>
          </button>
          <button
            onClick={() => {
              setSelectedMediaType('youtube');
              setPage(1);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
              selectedMediaType === 'youtube'
                ? 'bg-red-600 text-white shadow-md shadow-red-600/30'
                : 'bg-[#0f172a] text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Youtube className="w-3.5 h-3.5" />
            <span>YouTube</span>
          </button>
        </div>
      </div>

      {/* Main Table / Cards View */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-[#0f172a] border border-slate-800/80 rounded-2xl space-y-3">
          <RefreshCw className="w-8 h-8 text-sky-400 animate-spin" />
          <p className="text-sm font-semibold text-slate-300">Đang tải dữ liệu lịch sử người dùng...</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="bg-[#0f172a] border border-slate-800/80 rounded-2xl p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-800/80 mx-auto flex items-center justify-center text-slate-500">
            <Film className="w-6 h-6" />
          </div>
          <h4 className="text-base font-bold text-slate-200">Không tìm thấy lịch sử xem nào</h4>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Thử thay đổi từ khóa tìm kiếm, tài khoản hoặc phạm vi thời gian để xem kết quả.
          </p>
        </div>
      ) : (
        <div className="bg-[#0f172a] border border-slate-800/80 rounded-2xl overflow-hidden shadow-xl">
          {/* Desktop Table View */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#070b16]/90 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3.5 px-4">Nội Dung</th>
                  <th className="py-3.5 px-4">Người Dùng</th>
                  <th className="py-3.5 px-4">Thể Loại</th>
                  <th className="py-3.5 px-4">Tiến Độ & Thời Lượng</th>
                  <th className="py-3.5 px-4">Nguồn API</th>
                  <th className="py-3.5 px-4">Thời Gian Xem</th>
                  <th className="py-3.5 px-4 text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {paginatedItems.map((item) => {
                  const isMovie = item.mediaType === 'movie';
                  const isManga = item.mediaType === 'manga';
                  const isYt = item.mediaType === 'youtube';

                  const correspondingStat = userStats.find((s) => s.accountId === item.accountId);

                  return (
                    <tr key={item.id} className="hover:bg-[#131f37]/50 transition-colors">
                      {/* Content column */}
                      <td className="py-3.5 px-4 min-w-[240px]">
                        <div className="flex items-center gap-3">
                          {item.coverUrl ? (
                            <img
                              src={item.coverUrl}
                              alt={item.title}
                              className="w-10 h-14 object-cover rounded-lg border border-slate-800 shrink-0"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-10 h-14 rounded-lg bg-slate-800 flex items-center justify-center text-slate-500 shrink-0">
                              <Sparkles className="w-4 h-4" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-bold text-white text-xs line-clamp-1">{item.title}</p>
                            {item.subtitle && (
                              <p className="text-[11px] text-sky-400 font-medium line-clamp-1 mt-0.5">
                                {item.subtitle}
                              </p>
                            )}
                            {item.completed && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-bold mt-1">
                                <CheckCircle2 className="w-3 h-3" /> Hoàn thành
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* User column */}
                      <td className="py-3.5 px-4 min-w-[160px]">
                        <button
                          onClick={() => correspondingStat && onOpenUserDetail(correspondingStat)}
                          className="flex items-center gap-2 text-left hover:text-sky-300 transition group cursor-pointer"
                        >
                          <div className="w-7 h-7 rounded-lg bg-blue-950 border border-blue-800 flex items-center justify-center font-bold text-sky-400 text-xs shrink-0 group-hover:border-sky-400">
                            {(item.accountDisplayName || item.accountId || 'U').substring(0, 1).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-slate-200 text-xs truncate group-hover:text-sky-300">
                              {item.accountDisplayName || item.accountId}
                            </p>
                            <p className="text-[10px] text-slate-500 font-mono truncate">@{item.accountId}</p>
                          </div>
                        </button>
                      </td>

                      {/* Media Type */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {isMovie && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-950 text-sky-300 border border-sky-800 flex items-center gap-1 w-fit">
                            <Film className="w-3 h-3" /> Phim
                          </span>
                        )}
                        {isManga && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1 w-fit">
                            <BookOpen className="w-3 h-3" /> Manga
                          </span>
                        )}
                        {isYt && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-950 text-red-300 border border-red-800 flex items-center gap-1 w-fit">
                            <Youtube className="w-3 h-3" /> YouTube
                          </span>
                        )}
                      </td>

                      {/* Progress & Duration */}
                      <td className="py-3.5 px-4 min-w-[150px]">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-400">
                              {formatDurationText(item.watchedDurationSeconds || 0)}
                            </span>
                            <span className="font-bold text-sky-300">{item.progressPercent || 0}%</span>
                          </div>
                          <div className="w-full bg-slate-800 rounded-full h-1">
                            <div
                              className="bg-sky-400 h-1 rounded-full transition-all"
                              style={{ width: `${Math.min(100, item.progressPercent || 0)}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* API Source */}
                      <td className="py-3.5 px-4 whitespace-nowrap font-mono text-[11px] text-slate-400">
                        {item.apiSource ? (
                          <span className="bg-slate-800 px-2 py-0.5 rounded border border-slate-700 text-slate-300 uppercase">
                            {item.apiSource}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>

                      {/* Time */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <p className="font-medium text-slate-300 text-xs">
                          {formatRelativeTime(item.lastWatchedAt)}
                        </p>
                        <p className="text-[10px] text-slate-500 font-mono">
                          {formatDateTimeExact(item.lastWatchedAt)}
                        </p>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <button
                          onClick={() => handleDeleteRecord(item)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-950 text-slate-400 hover:text-red-400 transition cursor-pointer border border-slate-700 hover:border-red-800"
                          title="Xóa bản ghi này"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="p-4 bg-[#070b16]/90 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
            <div>
              Hiển thị <strong>{(page - 1) * pageSize + 1}</strong> -{' '}
              <strong>{Math.min(page * pageSize, filteredItems.length)}</strong> trên tổng số{' '}
              <strong>{filteredItems.length}</strong> nội dung
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className={`px-3 py-1.5 rounded-xl border font-semibold transition cursor-pointer ${
                  page === 1
                    ? 'border-slate-800 text-slate-600 cursor-not-allowed'
                    : 'border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                Trang trước
              </button>
              <span className="font-mono text-slate-300">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className={`px-3 py-1.5 rounded-xl border font-semibold transition cursor-pointer ${
                  page === totalPages
                    ? 'border-slate-800 text-slate-600 cursor-not-allowed'
                    : 'border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                Trang sau
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
